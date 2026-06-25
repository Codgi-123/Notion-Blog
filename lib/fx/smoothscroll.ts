// Lenis-style inertia smooth scroll, dependency-free.
//
// Instead of transforming a content wrapper (which breaks position:sticky and
// position:fixed — the nav and the article TOC rely on both), this keeps native
// layout and only *smooths the scroll position*: wheel/keyboard feed a target,
// and the shared rAF loop eases window.scrollTo() toward it each frame.
//
// Desktop-only (fine pointer, motion allowed). Touch devices already have great
// native momentum scrolling, so we leave them alone. Inner scrollable regions
// (TOC, search results, code blocks, modals) keep their native wheel scroll.

import { addTick, damp } from './engine';
import { reducedMotion, finePointer } from './perf';

// Shared state so PageTransition can reset the target on navigation and
// scrolldrive can read the live (smoothed) position without re-querying.
export const scrollState = {
  enabled: false,
  current: 0,
  target: 0,
};

// The position we last handed to window.scrollTo(). The rAF tick compares it to
// window.scrollY to tell *our* scrolls apart from external ones (find-in-page,
// scrollIntoView, a dragged scrollbar). Module-scoped so resetScroll() can keep
// it in sync and avoid a one-frame false "external scroll" right after a route
// change. (Comparing in a 'scroll' listener instead is unreliable: scroll events
// fire async and coalesce, so by the time one lands this value has already moved
// on — which used to break fast-fling inertia.)
let lastCommanded = 0;

// Snap the smoothed scroller to a position (used right after a route change so
// the eased loop doesn't fling the new page back to the old offset).
export function resetScroll(y = 0): void {
  scrollState.current = y;
  scrollState.target = y;
  lastCommanded = y;
}

// Does `el` (or an ancestor up to <body>) have its own scrollbar that can still
// move in direction `dy`? If so we must NOT hijack the wheel — let it scroll.
function consumesWheel(start: EventTarget | null, dy: number): boolean {
  let el = start as HTMLElement | null;
  while (el && el !== document.body && el !== document.documentElement) {
    if (el.scrollHeight > el.clientHeight + 1) {
      const style = getComputedStyle(el).overflowY;
      if (style === 'auto' || style === 'scroll') {
        const atTop = el.scrollTop <= 0;
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
        if ((dy < 0 && !atTop) || (dy > 0 && !atBottom)) return true;
      }
    }
    el = el.parentElement;
  }
  return false;
}

// Vertical offset an in-page anchor should clear: the live height of the fixed
// nav (it shrinks on scroll, so this can't be hardcoded) plus a small margin.
function navOffset(): number {
  const nav = document.querySelector('.site-nav-bar');
  const h = nav ? nav.getBoundingClientRect().height : 0;
  return h + 12;
}

export function initSmoothScroll(): () => void {
  if (typeof window === 'undefined') return () => {};
  if (reducedMotion() || !finePointer()) return () => {};

  const root = document.documentElement;
  root.classList.add('fx-smooth');
  // Our per-frame scrollTo would otherwise be double-smoothed by CSS.
  const prevBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';

  scrollState.enabled = true;
  scrollState.current = window.scrollY;
  scrollState.target = window.scrollY;
  lastCommanded = window.scrollY;

  // Cached scroll limit. Reading scrollHeight forces layout, so we never do it
  // per-frame — only on resize and when the document actually changes size
  // (Notion images decoding, fonts loading, client-nav swapping the page…).
  let limit = Math.max(0, root.scrollHeight - window.innerHeight);
  const recomputeLimit = () => {
    limit = Math.max(0, root.scrollHeight - window.innerHeight);
    // A shrunk document can leave the target past the new bottom; pull it back.
    scrollState.target = Math.min(Math.max(scrollState.target, 0), limit);
  };
  const clamp = (v: number) => Math.min(Math.max(v, 0), limit);

  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey) return; // pinch-zoom
    if (consumesWheel(e.target, e.deltaY)) return; // inner scroll area
    e.preventDefault();
    let d = e.deltaY;
    if (e.deltaMode === 1) d *= 16; // lines -> px
    else if (e.deltaMode === 2) d *= window.innerHeight; // pages -> px
    scrollState.target = clamp(scrollState.target + d);
  };
  window.addEventListener('wheel', onWheel, { passive: false });

  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    const tag = t?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return;
    const page = window.innerHeight * 0.9;
    let handled = true;
    switch (e.key) {
      case 'ArrowDown': scrollState.target = clamp(scrollState.target + 90); break;
      case 'ArrowUp': scrollState.target = clamp(scrollState.target - 90); break;
      case 'PageDown': scrollState.target = clamp(scrollState.target + page); break;
      case 'PageUp': scrollState.target = clamp(scrollState.target - page); break;
      case ' ':
        scrollState.target = clamp(scrollState.target + (e.shiftKey ? -page : page));
        break;
      case 'Home': scrollState.target = 0; break;
      case 'End': scrollState.target = limit; break;
      default: handled = false;
    }
    if (handled) e.preventDefault();
  };
  window.addEventListener('keydown', onKey);

  // Route in-page anchor clicks through the eased loop (smooth, offset for nav).
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0) return;
    const a = (e.target as HTMLElement)?.closest?.('a[href^="#"]') as HTMLAnchorElement | null;
    if (!a) return;
    const href = a.getAttribute('href') || '';
    const id = decodeURIComponent(href.slice(1));
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    const top = el.getBoundingClientRect().top + window.scrollY - navOffset();
    scrollState.target = clamp(top);
  };
  document.addEventListener('click', onClick);

  const onResize = () => recomputeLimit();
  window.addEventListener('resize', onResize, { passive: true });

  // Async content (images, fonts, client-side nav) changes the page height
  // without a resize event; watch the body so `limit` stays correct.
  const ro = new ResizeObserver(() => recomputeLimit());
  ro.observe(document.body);

  const unTick = addTick((dt) => {
    // Adopt scrolls we didn't command. We read window.scrollY *before* easing,
    // so it reflects exactly last frame's scrollTo plus anything external since.
    // A >2px gap can only be external (find-in-page, scrollIntoView, a dragged
    // scrollbar, or the browser clamping us at the real bottom) — sub-pixel
    // rounding from scrollTo stays well under the threshold. Done synchronously
    // here (not in a 'scroll' listener) so it can't race our own scrolls.
    if (Math.abs(window.scrollY - lastCommanded) > 2) {
      scrollState.current = window.scrollY;
      scrollState.target = clamp(window.scrollY);
    }

    scrollState.current = damp(scrollState.current, scrollState.target, 9, dt);
    if (Math.abs(scrollState.current - scrollState.target) < 0.4) {
      scrollState.current = scrollState.target;
    }
    lastCommanded = scrollState.current;
    window.scrollTo(0, scrollState.current);
  });

  return () => {
    unTick();
    ro.disconnect();
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('keydown', onKey);
    document.removeEventListener('click', onClick);
    window.removeEventListener('resize', onResize);
    root.classList.remove('fx-smooth');
    root.style.scrollBehavior = prevBehavior;
    scrollState.enabled = false;
  };
}
