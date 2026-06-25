// Lusion-style fluid cursor trail.
//
// A real-time Navier–Stokes (incompressible) fluid solver running entirely on
// the GPU in raw WebGL — no Three.js, no npm deps. The pointer "splats" velocity
// and dye into the field; every frame we advect, enforce zero divergence with a
// Jacobi pressure solve, and add a touch of vorticity confinement so the trail
// curls like real liquid instead of just diffusing.
//
// This is the same family of solver popularised by Pavel Dobryakov's
// WebGL-Fluid-Simulation (MIT), trimmed to just the cursor trail: no bloom, no
// sunrays, no config UI. It renders to a fixed, transparent, pointer-transparent
// full-screen canvas that floats above the page content.
//
// Gated to the `high` perf tier + fine pointer only — touch / reduced-motion /
// weak devices get nothing. The simulation runs at a low internal resolution
// (the dye is upsampled with bilinear filtering, so it stays smooth) and self
// -tears-down if the GPU can't keep up on the first frames.

import { addTick } from './engine';
import { getTier, canHover } from './perf';

// ---- Tunables (the "feel" of the fluid) -------------------------------------
const CONFIG = {
  // ponytail: dropped from 128/512 — dye is the full-screen texture, so 256
  // quarters the per-frame fill cost; bilinear upsampling keeps it smooth.
  // Bump back up if the trail looks too coarse on hi-dpi.
  SIM_RESOLUTION: 64,
  DYE_RESOLUTION: 256,
  DENSITY_DISSIPATION: 9.0,
  VELOCITY_DISSIPATION: 2.0,
  SPLAT_RADIUS: 0.05,
  SPLAT_FORCE: 4000,
  TINT: 0.02,
  IDLE_TIMEOUT: 1.5,
};

// ---- Shaders ----------------------------------------------------------------
// Shared vertex shader: full-screen triangle + precomputed neighbour texcoords
// (left/right/top/bottom) so the fragment stencils don't recompute them.
const BASE_VERT = `
precision highp float;
attribute vec2 aPosition;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform vec2 texelSize;
void main () {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// Inject velocity + dye at the pointer with a soft Gaussian falloff.
const SPLAT_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
void main () {
  vec2 p = vUv - point.xy;
  p.x *= aspectRatio;
  vec3 splat = exp(-dot(p, p) / radius) * color;
  vec3 base = texture2D(uTarget, vUv).xyz;
  gl_FragColor = vec4(base + splat, 1.0);
}
`;

// Semi-Lagrangian advection. MANUAL_FILTERING is compiled in when the GPU can't
// linearly filter float textures (older WebGL1) — then we bilerp by hand.
const ADVECTION_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform vec2 dyeTexelSize;
uniform float dt;
uniform float dissipation;
#ifdef MANUAL_FILTERING
vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
  vec2 st = uv / tsize - 0.5;
  vec2 iuv = floor(st);
  vec2 fuv = fract(st);
  vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
  vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
  vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
  vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
  return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
}
void main () {
  vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
  vec4 result = bilerp(uSource, coord, dyeTexelSize);
  float decay = 1.0 + dissipation * dt;
  gl_FragColor = result / decay;
}
#else
void main () {
  vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
  vec4 result = texture2D(uSource, coord);
  float decay = 1.0 + dissipation * dt;
  gl_FragColor = result / decay;
}
#endif
`;

// Final pass: emit the dye with alpha derived from its own intensity, so the
// canvas is transparent everywhere the fluid hasn't been.
const DISPLAY_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTexture;
void main () {
  vec3 c = texture2D(uTexture, vUv).rgb;
  float a = clamp(max(c.r, max(c.g, c.b)), 0.0, 1.0);
  gl_FragColor = vec4(c, a);
}
`;

// ---- GL plumbing ------------------------------------------------------------
type GL = WebGL2RenderingContext | WebGLRenderingContext;

interface FBO {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  attach(id: number): number;
}

interface DoubleFBO {
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  read: FBO;
  write: FBO;
  swap(): void;
}

interface Formats {
  rgba: { internalFormat: number; format: number };
  rg: { internalFormat: number; format: number };
  r: { internalFormat: number; format: number };
  halfFloatType: number;
  supportLinear: boolean;
}

function compile(gl: GL, type: number, src: string, keywords?: string[]): WebGLShader | null {
  let source = src;
  if (keywords) source = keywords.map((k) => `#define ${k}\n`).join('') + src;
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function link(gl: GL, vs: WebGLShader, fs: WebGLShader): WebGLProgram | null {
  const p = gl.createProgram()!;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  // All programs share the one full-screen-triangle buffer at location 0.
  gl.bindAttribLocation(p, 0, 'aPosition');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
  return p;
}

// A program plus a lazily-built name->location map.
class Program {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null> = {};
  private gl: GL;
  constructor(gl: GL, vs: WebGLShader, fs: WebGLShader) {
    this.gl = gl;
    this.program = link(gl, vs, fs)!;
    const count = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const name = gl.getActiveUniform(this.program, i)!.name;
      this.uniforms[name] = gl.getUniformLocation(this.program, name);
    }
  }
  bind() {
    this.gl.useProgram(this.program);
  }
}

export function initFluidCursor(): () => void {
  // Same gating as the rest of the FX layer: real pointer, motion allowed, and
  // a GPU we trust. Everything else gets nothing (and the page is unaffected).
  if (getTier() !== 'high' || !canHover()) return () => {};

  const canvas = document.createElement('canvas');
  canvas.className = 'fx-fluid';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);

  const params: WebGLContextAttributes = {
    alpha: true,
    depth: false,
    stencil: false,
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
  };

  let gl: GL | null = canvas.getContext('webgl2', params) as WebGL2RenderingContext | null;
  const isWebGL2 = !!gl;
  if (!gl) {
    gl =
      (canvas.getContext('webgl', params) as WebGLRenderingContext | null) ||
      (canvas.getContext('experimental-webgl', params) as WebGLRenderingContext | null);
  }
  if (!gl) {
    canvas.remove();
    return () => {};
  }
  const glc: GL = gl;

  const detected = getFormats(glc, isWebGL2);
  if (!detected) {
    canvas.remove();
    return () => {};
  }
  // Re-bind as a non-null const so the closures below narrow cleanly.
  const formats: Formats = detected;

  // Full-screen triangle.
  const vbo = glc.createBuffer();
  glc.bindBuffer(glc.ARRAY_BUFFER, vbo);
  glc.bufferData(glc.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), glc.STATIC_DRAW);
  glc.enableVertexAttribArray(0);
  glc.vertexAttribPointer(0, 2, glc.FLOAT, false, 0, 0);

  const baseVert = compile(glc, glc.VERTEX_SHADER, BASE_VERT)!;
  const mk = (frag: string, keywords?: string[]) =>
    new Program(glc, baseVert, compile(glc, glc.FRAGMENT_SHADER, frag, keywords)!);

  const programs = {
    splat: mk(SPLAT_FRAG),
    advection: mk(ADVECTION_FRAG, formats.supportLinear ? undefined : ['MANUAL_FILTERING']),
    display: mk(DISPLAY_FRAG),
  };

  const blit = (target: FBO | null) => {
    if (target) {
      glc.viewport(0, 0, target.width, target.height);
      glc.bindFramebuffer(glc.FRAMEBUFFER, target.fbo);
    } else {
      glc.viewport(0, 0, glc.drawingBufferWidth, glc.drawingBufferHeight);
      glc.bindFramebuffer(glc.FRAMEBUFFER, null);
    }
    glc.drawArrays(glc.TRIANGLES, 0, 3);
  };

  const filtering = formats.supportLinear ? glc.LINEAR : glc.NEAREST;

  function createFBO(w: number, h: number, fmt: { internalFormat: number; format: number }): FBO {
    glc.activeTexture(glc.TEXTURE0);
    const texture = glc.createTexture()!;
    glc.bindTexture(glc.TEXTURE_2D, texture);
    glc.texParameteri(glc.TEXTURE_2D, glc.TEXTURE_MIN_FILTER, filtering);
    glc.texParameteri(glc.TEXTURE_2D, glc.TEXTURE_MAG_FILTER, filtering);
    glc.texParameteri(glc.TEXTURE_2D, glc.TEXTURE_WRAP_S, glc.CLAMP_TO_EDGE);
    glc.texParameteri(glc.TEXTURE_2D, glc.TEXTURE_WRAP_T, glc.CLAMP_TO_EDGE);
    glc.texImage2D(
      glc.TEXTURE_2D,
      0,
      fmt.internalFormat,
      w,
      h,
      0,
      fmt.format,
      formats.halfFloatType,
      null,
    );
    const fbo = glc.createFramebuffer()!;
    glc.bindFramebuffer(glc.FRAMEBUFFER, fbo);
    glc.framebufferTexture2D(glc.FRAMEBUFFER, glc.COLOR_ATTACHMENT0, glc.TEXTURE_2D, texture, 0);
    glc.clearColor(0, 0, 0, 0);
    glc.clear(glc.COLOR_BUFFER_BIT);
    return {
      texture,
      fbo,
      width: w,
      height: h,
      texelSizeX: 1 / w,
      texelSizeY: 1 / h,
      attach(id: number) {
        glc.activeTexture(glc.TEXTURE0 + id);
        glc.bindTexture(glc.TEXTURE_2D, texture);
        return id;
      },
    };
  }

  function createDoubleFBO(
    w: number,
    h: number,
    fmt: { internalFormat: number; format: number },
  ): DoubleFBO {
    let fbo1 = createFBO(w, h, fmt);
    let fbo2 = createFBO(w, h, fmt);
    return {
      width: w,
      height: h,
      texelSizeX: 1 / w,
      texelSizeY: 1 / h,
      get read() {
        return fbo1;
      },
      set read(v) {
        fbo1 = v;
      },
      get write() {
        return fbo2;
      },
      set write(v) {
        fbo2 = v;
      },
      swap() {
        const tmp = fbo1;
        fbo1 = fbo2;
        fbo2 = tmp;
      },
    };
  }

  // Render targets sized from the simulation resolution, aspect-correct.
  let dye: DoubleFBO;
  let velocity: DoubleFBO;

  function res(resolution: number) {
    const aspect = glc.drawingBufferWidth / glc.drawingBufferHeight;
    let w = Math.round(resolution);
    let h = Math.round(resolution);
    if (aspect > 1) w = Math.round(resolution * aspect);
    else h = Math.round(resolution / aspect);
    return { w, h };
  }

  function initFramebuffers() {
    const sim = res(CONFIG.SIM_RESOLUTION);
    const dyeRes = res(CONFIG.DYE_RESOLUTION);
    velocity = createDoubleFBO(sim.w, sim.h, formats.rg);
    dye = createDoubleFBO(dyeRes.w, dyeRes.h, formats.rgba);
  }

  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const resize = () => {
    const w = Math.floor(window.innerWidth * DPR);
    const h = Math.floor(window.innerHeight * DPR);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      initFramebuffers();
    }
  };
  resize();
  window.addEventListener('resize', resize, { passive: true });

  // ---- Pointer -> splats ----------------------------------------------------
  // Dye colour follows the theme accent, resolved once to concrete rgb.
  let color = accentColor();
  const themeObserver = new MutationObserver(() => (color = accentColor()));
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  interface Pointer {
    x: number;
    y: number;
    dx: number;
    dy: number;
    moved: boolean;
    down: boolean;
  }
  const pointer: Pointer = { x: 0, y: 0, dx: 0, dy: 0, moved: false, down: false };
  let last = { x: 0, y: 0, has: false };
  // Where we last injected dye — the tick walks from here to the current point
  // and lays down a continuous string of small splats (no discrete blobs).
  let splatPrev = { x: 0, y: 0, has: false };

  const onMove = (e: PointerEvent) => {
    wake(); // resume the sim if it had gone to sleep while idle
    const x = e.clientX / window.innerWidth;
    const y = 1 - e.clientY / window.innerHeight; // GL origin is bottom-left
    if (!last.has) {
      last = { x, y, has: true };
      pointer.x = x;
      pointer.y = y;
      return;
    }
    pointer.dx = (x - last.x) * CONFIG.SPLAT_FORCE;
    pointer.dy = (y - last.y) * CONFIG.SPLAT_FORCE;
    pointer.x = x;
    pointer.y = y;
    pointer.moved = Math.abs(pointer.dx) > 0 || Math.abs(pointer.dy) > 0;
    last = { x, y, has: true };
  };
  window.addEventListener('pointermove', onMove, { passive: true });

  function splat(x: number, y: number, dx: number, dy: number, c: [number, number, number]) {
    const radius = correctRadius(CONFIG.SPLAT_RADIUS / 100);

    programs.splat.bind();
    glc.uniform1i(programs.splat.uniforms.uTarget, velocity.read.attach(0));
    glc.uniform1f(programs.splat.uniforms.aspectRatio, canvas.width / canvas.height);
    glc.uniform2f(programs.splat.uniforms.point, x, y);
    glc.uniform3f(programs.splat.uniforms.color, dx, dy, 0);
    glc.uniform1f(programs.splat.uniforms.radius, radius);
    blit(velocity.write);
    velocity.swap();

    glc.uniform1i(programs.splat.uniforms.uTarget, dye.read.attach(0));
    glc.uniform3f(programs.splat.uniforms.color, c[0], c[1], c[2]);
    blit(dye.write);
    dye.swap();
  }

  function correctRadius(radius: number) {
    const aspect = canvas.width / canvas.height;
    return aspect > 1 ? radius * aspect : radius;
  }

  // ---- Simulation step ------------------------------------------------------
  function step(dt: number) {
    glc.disable(glc.BLEND);

    // Advect velocity, then dye.
    programs.advection.bind();
    glc.uniform2f(programs.advection.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    if (!formats.supportLinear)
      glc.uniform2f(
        programs.advection.uniforms.dyeTexelSize,
        velocity.texelSizeX,
        velocity.texelSizeY,
      );
    glc.uniform1i(programs.advection.uniforms.uVelocity, velocity.read.attach(0));
    glc.uniform1i(programs.advection.uniforms.uSource, velocity.read.attach(0));
    glc.uniform1f(programs.advection.uniforms.dt, dt);
    glc.uniform1f(programs.advection.uniforms.dissipation, CONFIG.VELOCITY_DISSIPATION);
    blit(velocity.write);
    velocity.swap();

    if (!formats.supportLinear)
      glc.uniform2f(programs.advection.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
    glc.uniform1i(programs.advection.uniforms.uVelocity, velocity.read.attach(0));
    glc.uniform1i(programs.advection.uniforms.uSource, dye.read.attach(1));
    glc.uniform1f(programs.advection.uniforms.dissipation, CONFIG.DENSITY_DISSIPATION);
    blit(dye.write);
    dye.swap();
  }

  function render() {
    // Premultiplied-alpha-friendly blend so the trail composites over the page.
    glc.enable(glc.BLEND);
    glc.blendFunc(glc.ONE, glc.ONE_MINUS_SRC_ALPHA);
    programs.display.bind();
    glc.uniform1i(programs.display.uniforms.uTexture, dye.read.attach(0));
    blit(null);
  }

  // ---- Main tick (shared rAF) ----------------------------------------------
  let probeFrames = 0;
  let probeSum = 0;
  let downgraded = false;
  let idleTime = 0;
  let subscription: (() => void) | null = null;
  let cleaned = false;

  const tick = (dt: number) => {
    const t0 = performance.now();
    const didMove = pointer.moved;

    if (pointer.moved) {
      pointer.moved = false;
      const c: [number, number, number] = [
        color[0] * CONFIG.TINT,
        color[1] * CONFIG.TINT,
        color[2] * CONFIG.TINT,
      ];
      if (!splatPrev.has) splatPrev = { x: pointer.x, y: pointer.y, has: true };

      // Subdivide the move into steps no larger than ~half the brush, so a fast
      // flick lays a smooth ribbon instead of one big mushrooming puff.
      let sx = pointer.x - splatPrev.x;
      let sy = pointer.y - splatPrev.y;
      const dist = Math.hypot(sx, sy);
      // A big jump = the pointer left and re-entered elsewhere; teleport rather
      // than streak a line across the whole screen.
      if (dist > 0.2) {
        sx = 0;
        sy = 0;
      }
      // ponytail: cap 24 -> 12; fast flicks splat half as often, ribbon still smooth.
      const steps = dist > 0.2 ? 1 : Math.min(12, Math.max(1, Math.ceil(dist / 0.006)));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        // Push the dye OPPOSITE to the motion so the trail drags behind the
        // cursor instead of shooting out ahead of it. Velocity is spread across
        // the sub-splats so total push is path-length–based, not step-count–based.
        splat(splatPrev.x + sx * t, splatPrev.y + sy * t, -pointer.dx / steps, -pointer.dy / steps, c);
      }
      splatPrev = { x: pointer.x, y: pointer.y, has: true };
    }

    // The solver wants a fixed-ish dt; clamp like the engine does for springs.
    step(Math.min(dt, 0.016666));
    render();

    // Watch the first couple dozen frames; bail to nothing if the GPU stalls.
    if (!downgraded && probeFrames < 30) {
      probeSum += performance.now() - t0;
      probeFrames++;
      if (probeFrames === 30 && probeSum / 30 > 10) {
        downgraded = true;
        cleanup();
        return;
      }
    }

    // Once the trail has faded and the pointer is still, unsubscribe from the
    // rAF loop entirely — an idle page then costs zero GPU until the next move.
    idleTime = didMove ? 0 : idleTime + dt;
    if (idleTime > CONFIG.IDLE_TIMEOUT) sleep();
  };

  function wake() {
    idleTime = 0;
    if (!subscription && !cleaned) subscription = addTick(tick);
  }
  function sleep() {
    if (subscription) {
      subscription();
      subscription = null;
    }
  }
  wake(); // kick off (the first pointermove will keep it alive)

  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    sleep();
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', onMove);
    themeObserver.disconnect();
    glc.getExtension('WEBGL_lose_context')?.loseContext();
    canvas.remove();
  }

  return cleanup;
}

// Resolve --accent (which may be oklch) to linear-ish 0..1 rgb for the dye.
function accentColor(): [number, number, number] {
  const probe = document.createElement('span');
  probe.style.cssText = 'color:var(--accent);position:absolute;opacity:0;pointer-events:none';
  document.body.appendChild(probe);
  const m = getComputedStyle(probe).color.match(/[\d.]+/g);
  probe.remove();
  if (!m) return [0.4, 0.78, 0.62];
  return [Number(m[0]) / 255, Number(m[1]) / 255, Number(m[2]) / 255];
}

// Pick renderable float texture formats for whichever WebGL we got. Returns
// null if the GPU can't render to any float format (then we skip the effect).
function getFormats(gl: GL, isWebGL2: boolean): Formats | null {
  let halfFloatType: number;
  let supportLinear: boolean;

  if (isWebGL2) {
    const gl2 = gl as WebGL2RenderingContext;
    gl2.getExtension('EXT_color_buffer_float');
    supportLinear = !!gl2.getExtension('OES_texture_float_linear');
    halfFloatType = gl2.HALF_FLOAT;
    const rgba = supported(gl2, gl2.RGBA16F, gl2.RGBA, halfFloatType);
    const rg = supported(gl2, gl2.RG16F, gl2.RG, halfFloatType);
    const r = supported(gl2, gl2.R16F, gl2.RED, halfFloatType);
    if (!rgba || !rg || !r) return null;
    return { rgba, rg, r, halfFloatType, supportLinear };
  }

  const ext = gl.getExtension('OES_texture_half_float');
  if (!ext) return null;
  supportLinear = !!gl.getExtension('OES_texture_half_float_linear');
  halfFloatType = (ext as { HALF_FLOAT_OES: number }).HALF_FLOAT_OES;
  // WebGL1 has no RG/R render targets — everything uses RGBA.
  const rgba = supported(gl, gl.RGBA, gl.RGBA, halfFloatType);
  if (!rgba) return null;
  return { rgba, rg: rgba, r: rgba, halfFloatType, supportLinear };
}

function supported(
  gl: GL,
  internalFormat: number,
  format: number,
  type: number,
): { internalFormat: number; format: number } | null {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.deleteFramebuffer(fbo);
  gl.deleteTexture(tex);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return ok ? { internalFormat, format } : null;
}
