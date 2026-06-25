// Pointer-driven interaction controller.
//
// Owns three effects, all fed by the shared rAF loop in engine.ts:
//   - [data-tilt]     real 3D rotation toward the pointer + a specular sheen
//   - [data-magnetic] magnetic pull toward the pointer with spring-like return
//   - scroll reveal   IntersectionObserver toggles `.is-visible` on `.reveal`
//   - custom cursor   a spring-trailing ring that grows over interactive targets
//
// New elements appearing after client-side navigation are picked up by a
// debounced MutationObserver, so this controller is mounted ONCE (in _app) and
// lives for the whole session.

import { addTick, damp, stepSpring, type Spring } from './engine';
import { canHover, reducedMotion } from './perf';

interface TiltState {
  rx: number; // current rotateX (deg)
  ry: number; // current rotateY (deg)
  trx: number; // target rotateX
  try_: number; // target rotateY
  mx: number; // sheen x (0..100)
  my: number; // sheen y (0..100)
  tmx: number;
  tmy: number;
  lift: number; // current translateZ (px)
  tlift: number; // target translateZ
  active: boolean;
}

interface MagState {
  x: number;
  y: number;
  tx: number;
  ty: number;
}

const TILT_MAX = 9; // degrees
const TILT_LIFT = 18; // px translateZ on hover
const MAG_RADIUS = 90; // px activation radius
const MAG_STRENGTH = 0.4; // fraction of pointer offset

export function initInteractions(): () => void {
  const cleanups: Array<() => void> = [];

  // ---- Scroll reveal (cheap; runs even when pointer FX are disabled) --------
  if (!reducedMotion() && 'IntersectionObserver' in window) {
    document.documentElement.classList.add('fx-ready');
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );
    // Re-arming variant for article body blocks (.reveal-block): re-plays the
    // push-in each downward pass, but only ever animates on DOWNWARD scroll.
    //   - enter  -> reveal (animate). Entering from the top can't animate because
    //              such blocks were never re-armed (see below), so they stay shown.
    //   - exit   -> only re-arm (hide) when the block left via the BOTTOM edge,
    //              i.e. it's now off-screen below us after scrolling up. Leaving
    //              via the top keeps it visible, so scrolling up never replays.
    // Triggers right at the viewport edge (rootMargin 0) to avoid an empty band
    // of not-yet-revealed content at the bottom while scrolling down.
    const ioRepeat = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
          } else if (e.boundingClientRect.top >= (e.rootBounds?.top ?? 0)) {
            e.target.classList.remove('is-visible');
          }
        }
      },
      { rootMargin: '0px', threshold: 0 },
    );
    const observeReveals = () => {
      // observe() is idempotent, so re-scanning after DOM changes is safe.
      document.querySelectorAll('.reveal:not(.is-visible)').forEach((el) => io.observe(el));
      document.querySelectorAll('.reveal-block').forEach((el) => ioRepeat.observe(el));
    };
    observeReveals();
    const revealObserver = new MutationObserver(() => observeReveals());
    revealObserver.observe(document.body, { childList: true, subtree: true });
    cleanups.push(() => {
      io.disconnect();
      ioRepeat.disconnect();
      revealObserver.disconnect();
    });
  } else {
    // No motion: make sure nothing stays hidden.
    document.documentElement.classList.remove('fx-ready');
  }

  // ---- Pointer interactions (skipped entirely on touch / reduced motion) ----
  if (!canHover()) {
    return () => cleanups.forEach((fn) => fn());
  }

  const tiltStates = new WeakMap<HTMLElement, TiltState>();
  const magStates = new WeakMap<HTMLElement, MagState>();
  const bound = new WeakSet<HTMLElement>();
  let tiltEls: HTMLElement[] = [];
  let magEls: HTMLElement[] = [];

  const pointer = { x: -9999, y: -9999, has: false };

  const onTiltMove = (el: HTMLElement, e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width; // 0..1
    const py = (e.clientY - r.top) / r.height;
    const s = tiltStates.get(el)!;
    s.try_ = (px - 0.5) * 2 * TILT_MAX;
    s.trx = -(py - 0.5) * 2 * TILT_MAX;
    s.tmx = px * 100;
    s.tmy = py * 100;
  };
  const onTiltEnter = (el: HTMLElement) => {
    const s = tiltStates.get(el)!;
    s.active = true;
    s.tlift = TILT_LIFT;
  };
  const onTiltLeave = (el: HTMLElement) => {
    const s = tiltStates.get(el)!;
    s.active = false;
    s.trx = 0;
    s.try_ = 0;
    s.tlift = 0;
  };

  const scan = () => {
    tiltEls = Array.from(document.querySelectorAll<HTMLElement>('[data-tilt]'));
    magEls = Array.from(document.querySelectorAll<HTMLElement>('[data-magnetic]'));

    for (const el of tiltEls) {
      if (!tiltStates.has(el)) {
        tiltStates.set(el, {
          rx: 0, ry: 0, trx: 0, try_: 0,
          mx: 50, my: 50, tmx: 50, tmy: 50,
          lift: 0, tlift: 0, active: false,
        });
      }
      if (!bound.has(el)) {
        bound.add(el);
        el.addEventListener('pointerenter', () => onTiltEnter(el));
        el.addEventListener('pointermove', (e) => onTiltMove(el, e as PointerEvent));
        el.addEventListener('pointerleave', () => onTiltLeave(el));
      }
    }
    for (const el of magEls) {
      if (!magStates.has(el)) magStates.set(el, { x: 0, y: 0, tx: 0, ty: 0 });
    }
  };
  scan();
  const domObserver = new MutationObserver(() => scan());
  domObserver.observe(document.body, { childList: true, subtree: true });
  cleanups.push(() => domObserver.disconnect());

  const onMove = (e: PointerEvent) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.has = true;
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  cleanups.push(() => window.removeEventListener('pointermove', onMove));

  // ---- Cursor spring (drives the ribbon trail head) -------------------------
  // The visible ring/circle was removed; we still spring-track the pointer so
  // the ribbon trail keeps its smooth catch-up motion.
  const cx: Spring = { value: pointer.x, velocity: 0 };
  const cy: Spring = { value: pointer.y, velocity: 0 };
  let cursorShown = false;

  // ---- Velocity ribbon trail (canvas) ---------------------------------------
  // A glowing tapered ribbon: a chain of points follows the ring with eased
  // catch-up, so it stretches out on fast motion and collapses to a point when
  // idle. Drawn on a full-screen canvas so it can blur + additively blend.
  const trail = document.createElement('canvas');
  trail.className = 'fx-cursor-trail';
  trail.setAttribute('aria-hidden', 'true');
  document.body.appendChild(trail);
  const tctx = trail.getContext('2d')!;
  let dpr = 1;
  const sizeTrail = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    trail.width = Math.round(window.innerWidth * dpr);
    trail.height = Math.round(window.innerHeight * dpr);
    trail.style.width = `${window.innerWidth}px`;
    trail.style.height = `${window.innerHeight}px`;
  };
  sizeTrail();
  window.addEventListener('resize', sizeTrail, { passive: true });
  cleanups.push(() => window.removeEventListener('resize', sizeTrail));
  cleanups.push(() => trail.remove());

  const TRAIL_N = 22; // chained points (head -> tail)
  const pts = Array.from({ length: TRAIL_N }, () => ({ x: pointer.x, y: pointer.y }));
  let prevPx = pointer.x;
  let prevPy = pointer.y;
  let smoothSpeed = 0; // px/s, smoothed

  // Resolve --accent (oklch) to concrete rgb once, for canvas strokes.
  const probe = document.createElement('span');
  probe.style.cssText = 'color:var(--accent);display:none';
  document.body.appendChild(probe);
  const [ar, ag, ab] = (getComputedStyle(probe).color.match(/\d+/g) || ['120', '200', '160'])
    .slice(0, 3)
    .map(Number);
  probe.remove();

  // ---- The single tick ------------------------------------------------------
  const unTick = addTick((dt) => {
    // Tilt
    for (const el of tiltEls) {
      const s = tiltStates.get(el);
      if (!s) continue;
      const settled =
        !s.active &&
        Math.abs(s.rx) < 0.01 && Math.abs(s.ry) < 0.01 && s.lift < 0.05;
      if (settled) {
        if (el.style.transform) el.style.transform = '';
        continue;
      }
      s.rx = damp(s.rx, s.trx, 12, dt);
      s.ry = damp(s.ry, s.try_, 12, dt);
      s.lift = damp(s.lift, s.tlift, 12, dt);
      s.mx = damp(s.mx, s.tmx, 14, dt);
      s.my = damp(s.my, s.tmy, 14, dt);
      el.style.transform =
        `perspective(900px) rotateX(${s.rx.toFixed(3)}deg) rotateY(${s.ry.toFixed(3)}deg) translateZ(${s.lift.toFixed(2)}px)`;
      el.style.setProperty('--sheen-x', `${s.mx.toFixed(1)}%`);
      el.style.setProperty('--sheen-y', `${s.my.toFixed(1)}%`);
      el.style.setProperty('--sheen', s.active ? '1' : '0');
    }

    // Magnetic
    for (const el of magEls) {
      const s = magStates.get(el);
      if (!s) continue;
      if (pointer.has) {
        // Read the rest-position by temporarily clearing the transform so
        // getBoundingClientRect returns the original layout position, not the
        // displaced one. Without this, the offset feedback-loops: the element
        // moves toward the pointer, shrinking dx, which reduces the target,
        // which bounces the element back — oscillation on small elements.
        const prev = el.style.transform;
        if (prev) el.style.transform = '';
        const r = el.getBoundingClientRect();
        if (prev) el.style.transform = prev;
        const dx = pointer.x - (r.left + r.width / 2);
        const dy = pointer.y - (r.top + r.height / 2);
        const dist = Math.hypot(dx, dy);
        const reach = MAG_RADIUS + Math.max(r.width, r.height) / 2;
        if (dist < reach) {
          s.tx = dx * MAG_STRENGTH;
          s.ty = dy * MAG_STRENGTH;
        } else {
          s.tx = 0;
          s.ty = 0;
        }
      } else {
        s.tx = 0;
        s.ty = 0;
      }
      s.x = damp(s.x, s.tx, 10, dt);
      s.y = damp(s.y, s.ty, 10, dt);
      if (Math.abs(s.x) < 0.02 && Math.abs(s.y) < 0.02 && s.tx === 0 && s.ty === 0) {
        if (el.style.transform) el.style.transform = '';
      } else {
        el.style.transform = `translate(${s.x.toFixed(2)}px, ${s.y.toFixed(2)}px)`;
      }
    }

    // Cursor spring (feeds the ribbon trail head)
    if (pointer.has) {
      if (!cursorShown) {
        cursorShown = true;
        cx.value = pointer.x;
        cy.value = pointer.y;
        for (const p of pts) {
          p.x = pointer.x;
          p.y = pointer.y;
        }
        prevPx = pointer.x;
        prevPy = pointer.y;
      }
      stepSpring(cx, pointer.x, dt, 160, 20);
      stepSpring(cy, pointer.y, dt, 160, 20);

      // Ribbon trail: speed from the per-frame pointer delta, smoothed.
      const dxp = pointer.x - prevPx;
      const dyp = pointer.y - prevPy;
      prevPx = pointer.x;
      prevPy = pointer.y;
      smoothSpeed = damp(smoothSpeed, Math.hypot(dxp, dyp) / Math.max(dt, 1e-3), 10, dt);
      const t = Math.min(Math.max((smoothSpeed - 200) / 2400, 0), 1); // 0 idle .. 1 fast

      // Chain: head rides the ring spring, each point eases toward the one ahead.
      pts[0].x = cx.value;
      pts[0].y = cy.value;
      for (let i = 1; i < TRAIL_N; i++) {
        pts[i].x += (pts[i - 1].x - pts[i].x) * 0.38;
        pts[i].y += (pts[i - 1].y - pts[i].y) * 0.38;
      }

      tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      tctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const dark = document.documentElement.dataset.theme === 'dark';
      tctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
      tctx.lineCap = 'round';
      tctx.lineJoin = 'round';
      tctx.shadowColor = `rgba(${ar}, ${ag}, ${ab}, ${dark ? 0.55 : 0.3})`;
      tctx.shadowBlur = (8 + 18 * t) * (dark ? 1 : 0.7);
      // Tail -> head so the brightest, thickest segment sits on top.
      for (let i = TRAIL_N - 1; i >= 1; i--) {
        const f = 1 - i / TRAIL_N; // 0 tail .. ~1 head
        const w = (1.5 + 15 * f) * (0.3 + 0.7 * t);
        const a = (dark ? 0.55 : 0.5) * f * (0.18 + 0.82 * t);
        tctx.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${a.toFixed(3)})`;
        tctx.lineWidth = w;
        tctx.beginPath();
        tctx.moveTo(pts[i].x, pts[i].y);
        tctx.lineTo(pts[i - 1].x, pts[i - 1].y);
        tctx.stroke();
      }
    }
  });
  cleanups.push(unTick);

  return () => cleanups.forEach((fn) => fn());
}
