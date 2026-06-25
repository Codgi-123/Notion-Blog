// A single shared requestAnimationFrame loop + frame-rate-independent easing.
//
// Every animated thing (tilt, magnetic, cursor) subscribes to ONE rAF loop
// instead of spawning its own. The loop auto-stops when nothing is subscribed
// and pauses while the tab is hidden, so an idle page costs zero CPU.

type TickFn = (dt: number) => void;

const subscribers = new Set<TickFn>();
let rafId = 0;
let last = 0;

function frame(now: number) {
  // Clamp dt so a long pause (tab switch, GC stall) can't make springs explode.
  const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
  last = now;
  // Copy to an array so a subscriber removing itself mid-tick is safe.
  for (const fn of Array.from(subscribers)) fn(dt);
  rafId = subscribers.size ? requestAnimationFrame(frame) : 0;
}

function start() {
  if (rafId || typeof window === 'undefined') return;
  last = 0;
  rafId = requestAnimationFrame(frame);
}

function stop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
}

export function addTick(fn: TickFn): () => void {
  subscribers.add(fn);
  start();
  return () => {
    subscribers.delete(fn);
    if (!subscribers.size) stop();
  };
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (subscribers.size) start();
  });
}

// Frame-rate-independent exponential damping. `lambda` is the smoothing rate
// (higher = snappier). This is unconditionally stable, unlike a naive lerp.
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return target + (current - target) * Math.exp(-lambda * dt);
}

// A real critically-tunable spring (position + velocity), used for the cursor
// so it overshoots and settles like a physical object rather than just easing.
export interface Spring {
  value: number;
  velocity: number;
}

export function stepSpring(
  s: Spring,
  target: number,
  dt: number,
  stiffness = 140,
  damping = 18,
): void {
  const force = -stiffness * (s.value - target);
  const drag = -damping * s.velocity;
  s.velocity += (force + drag) * dt;
  s.value += s.velocity * dt;
}
