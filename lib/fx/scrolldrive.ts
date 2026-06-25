// Scroll-driven, continuous animation — the layer the binary IntersectionObserver
// reveal couldn't do. Two declarative hooks, both updated from the shared rAF
// loop so they ride the same smoothed scroll position as everything else:
//
//   [data-parallax="0.2"]  translateY proportional to distance from viewport
//                          centre (negative = moves slower than scroll). The
//                          factor is the strength; element gets --py (px).
//   [data-scrub]           writes --progress (0..1) as the element travels from
//                          the bottom of the viewport (0) to the top (1), for
//                          scrubbed CSS (width, opacity, rotate, …).
//
// Rects are read each frame (cheap for the handful of decorative targets we tag)
// and only written when changed, so idle frames cost almost nothing.

import { addTick } from './engine';
import { reducedMotion } from './perf';

interface ParallaxTarget {
  el: HTMLElement;
  speed: number;
  last: number;
}

export function initScrollDrive(): () => void {
  if (typeof window === 'undefined' || reducedMotion()) return () => {};

  let parallax: ParallaxTarget[] = [];
  let scrub: HTMLElement[] = [];

  const scan = () => {
    parallax = Array.from(
      document.querySelectorAll<HTMLElement>('[data-parallax]'),
    ).map((el) => ({
      el,
      speed: parseFloat(el.dataset.parallax || '0.2') || 0.2,
      last: NaN,
    }));
    scrub = Array.from(document.querySelectorAll<HTMLElement>('[data-scrub]'));
  };
  scan();

  // New nodes after client-side navigation get picked up (debounced via rAF).
  let scheduled = false;
  const mo = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scan();
      lastY = NaN; // force one recompute so new nodes get positioned
    });
  });
  mo.observe(document.body, { childList: true, subtree: true });

  // Skip the per-frame rect reads when nothing moved. window.scrollY changes on
  // scroll; innerHeight on resize. Re-run once after a scan() too (new nodes).
  let lastY = NaN;
  let lastVh = NaN;
  const un = addTick(() => {
    const vh = window.innerHeight;
    const y = window.scrollY;
    if (y === lastY && vh === lastVh) return;
    lastY = y;
    lastVh = vh;
    const mid = vh / 2;

    for (const p of parallax) {
      const r = p.el.getBoundingClientRect();
      // Skip far-offscreen elements entirely.
      if (r.bottom < -vh || r.top > vh * 2) continue;
      const center = r.top + r.height / 2;
      const off = (center - mid) * -p.speed;
      if (Math.abs(off - p.last) > 0.1) {
        p.el.style.setProperty('--py', `${off.toFixed(1)}px`);
        p.last = off;
      }
    }

    for (const el of scrub) {
      const r = el.getBoundingClientRect();
      const prog = 1 - Math.min(Math.max(r.top / vh, 0), 1);
      el.style.setProperty('--progress', prog.toFixed(3));
    }
  });

  return () => {
    un();
    mo.disconnect();
  };
}
