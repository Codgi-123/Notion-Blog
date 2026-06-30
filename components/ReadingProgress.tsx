import { useEffect, useRef } from 'react';

// A thin accent bar pinned to the very top that fills as you read down the page.
// Writes the scaleX directly to the DOM node (no per-frame React re-render).
export function ReadingProgress() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Cache the scroll limit: reading scrollHeight forces a synchronous reflow,
    // so doing it per scroll event (i.e. every frame under smooth scroll) causes
    // layout thrashing. Recompute only when the document can actually resize.
    let max = document.documentElement.scrollHeight - window.innerHeight;
    const recompute = () => {
      max = document.documentElement.scrollHeight - window.innerHeight;
      onScroll();
    };
    const onScroll = () => {
      const p = max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0;
      if (ref.current) ref.current.style.transform = `scaleX(${p})`;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', recompute, { passive: true });
    const ro = new ResizeObserver(recompute);
    ro.observe(document.body);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', recompute);
      ro.disconnect();
    };
  }, []);

  return <div ref={ref} className="reading-progress" aria-hidden="true" />;
}
