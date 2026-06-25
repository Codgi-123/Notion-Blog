import { useEffect, useRef, useState } from 'react';
import { scrollState } from '../lib/fx/smoothscroll';

// Floating "back to top" button, bottom-right. Hidden at the top of the page;
// appears once scrolled past a screenful. Routes through the smooth-scroll
// engine when it's active so the ascent eases like the rest of the site.
export function BackToTop() {
  const [show, setShow] = useState(false);
  const shown = useRef(false);

  useEffect(() => {
    const onScroll = () => {
      const next = window.scrollY > 600;
      if (next !== shown.current) {
        shown.current = next;
        setShow(next);
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const toTop = () => {
    if (scrollState.enabled) scrollState.target = 0;
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <button
      type="button"
      className={`back-to-top${show ? ' is-visible' : ''}`}
      onClick={toTop}
      aria-label="回到顶部"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </button>
  );
}
