import { useEffect } from 'react';
import { initInteractions } from '../../lib/fx/interactions';
import { initShaderBackground } from '../../lib/fx/shaderbg';
import { initFluidCursor } from '../../lib/fx/fluidcursor';
import { initSmoothScroll } from '../../lib/fx/smoothscroll';
import { initScrollDrive } from '../../lib/fx/scrolldrive';
import { initTextEffects } from '../../lib/fx/texteffects';
import { initCodeCopy } from '../../lib/fx/codecopy';
import { initLightbox } from '../../lib/fx/lightbox';
import { initHeadingAnchors } from '../../lib/fx/headings';

// Mounted ONCE at the app root (client-only, no SSR). It outlives client-side
// navigation, so the shader context, cursor and smooth-scroll loop are created a
// single time while per-page elements are picked up by the controllers'
// MutationObservers.
export function FxRoot() {
  useEffect(() => {
    const stops = [
      initSmoothScroll(),
      initShaderBackground(),
      initInteractions(),
      initScrollDrive(),
      initTextEffects(),
      initCodeCopy(),
      initLightbox(),
      initHeadingAnchors(),
      initFluidCursor(),
    ];
    return () => stops.forEach((stop) => stop());
  }, []);

  return null;
}
