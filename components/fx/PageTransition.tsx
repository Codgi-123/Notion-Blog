import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { resetScroll, scrollState } from '../../lib/fx/smoothscroll';

// Full-screen wipe between routes (Pages Router), driven by router events.
//
//   routeChangeStart    -> panels sweep up to cover the screen ("cover")
//   routeChangeComplete -> jump to top, then panels sweep away ("reveal")
//
// The new page renders underneath while covered, so there's no flash of the old
// content scrolling/cutting. SSR-safe: renders an idle, hidden overlay.
//
// On reduced motion the whole thing is hidden via CSS, so navigation is instant.

type Phase = 'idle' | 'cover' | 'reveal';

export function PageTransition() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clear = () => {
      if (timer.current) clearTimeout(timer.current);
    };

    const onStart = () => {
      clear();
      document.documentElement.setAttribute('data-transitioning', '1');
      setPhase('cover');
    };
    const onDone = () => {
      clear();
      // We're fully covered now — reset scroll for the incoming page.
      window.scrollTo(0, 0);
      if (scrollState.enabled) resetScroll(0);
      // Next frame: start the uncover sweep.
      requestAnimationFrame(() => setPhase('reveal'));
      timer.current = setTimeout(() => {
        setPhase('idle');
        document.documentElement.removeAttribute('data-transitioning');
        document.dispatchEvent(new CustomEvent('fx-page-revealed'));
      }, 700);
    };

    router.events.on('routeChangeStart', onStart);
    router.events.on('routeChangeComplete', onDone);
    router.events.on('routeChangeError', onDone);
    return () => {
      router.events.off('routeChangeStart', onStart);
      router.events.off('routeChangeComplete', onDone);
      router.events.off('routeChangeError', onDone);
      clear();
    };
  }, [router]);

  return (
    <div className={`fx-page-transition is-${phase}`} aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}
