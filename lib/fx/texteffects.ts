// Kinetic typography.
//
//   [data-split]     splits the element's text into per-character spans that
//                    cascade up into place the first time the element enters the
//                    viewport (each char gets --i for a staggered transition).
//   [data-scramble]  on hover, runs the classic "decode" scramble over the
//                    element's text, then settles back to the original.
//
// Both are pure DOM/CSS (no canvas, no deps). They no-op under reduced motion,
// and scramble is desktop-only. New nodes after client-side navigation are
// picked up by a MutationObserver.

import { reducedMotion, finePointer } from './perf';

const SCRAMBLE_CHARS = '!<>-_\\/[]{}—=+*^?#%@&';

function splitOne(el: HTMLElement) {
  if (el.dataset.splitDone) return;
  el.dataset.splitDone = '1';
  const text = el.textContent || '';
  el.textContent = '';
  el.classList.add('fx-split');
  let i = 0;
  for (const ch of text) {
    if (ch === ' ') {
      el.appendChild(document.createTextNode(' '));
      continue;
    }
    const span = document.createElement('span');
    span.className = 'fx-char';
    span.textContent = ch;
    span.style.setProperty('--i', String(i++));
    el.appendChild(span);
  }
  requestAnimationFrame(() => el.classList.add('is-split-in'));
}

function initSplit(): () => void {
  const scan = () =>
    document
      .querySelectorAll<HTMLElement>('[data-split]:not([data-split-done])')
      .forEach((el) => splitOne(el));
  scan();

  const mo = new MutationObserver(() => scan());
  mo.observe(document.body, { childList: true, subtree: true });

  return () => mo.disconnect();
}

function initScramble(): () => void {
  const bound = new WeakSet<HTMLElement>();
  const timers = new WeakMap<HTMLElement, number>();

  const run = (el: HTMLElement) => {
    const original = el.dataset.scrambleText || el.textContent || '';
    el.dataset.scrambleText = original;
    const start = performance.now();
    const DURATION = 480;
    const prev = timers.get(el);
    if (prev) cancelAnimationFrame(prev);

    const frame = (now: number) => {
      const t = Math.min((now - start) / DURATION, 1);
      // Reveal left-to-right; un-revealed chars flicker through random glyphs.
      const revealed = Math.floor(t * original.length);
      let out = '';
      for (let i = 0; i < original.length; i++) {
        if (original[i] === ' ') out += ' ';
        else if (i < revealed) out += original[i];
        else out += SCRAMBLE_CHARS[(Math.random() * SCRAMBLE_CHARS.length) | 0];
      }
      el.textContent = out;
      if (t < 1) timers.set(el, requestAnimationFrame(frame));
      else el.textContent = original;
    };
    timers.set(el, requestAnimationFrame(frame));
  };

  const scan = () => {
    document.querySelectorAll<HTMLElement>('[data-scramble]').forEach((el) => {
      if (bound.has(el)) return;
      bound.add(el);
      el.addEventListener('pointerenter', () => run(el));
    });
  };
  scan();

  const mo = new MutationObserver(() => scan());
  mo.observe(document.body, { childList: true, subtree: true });

  return () => mo.disconnect();
}

export function initTextEffects(): () => void {
  if (typeof window === 'undefined' || reducedMotion()) return () => {};
  const cleanups: Array<() => void> = [initSplit()];
  if (finePointer()) cleanups.push(initScramble());
  return () => cleanups.forEach((fn) => fn());
}
