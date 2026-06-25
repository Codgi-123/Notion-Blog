// Capability detection for the FX layer.
//
// Two independent gates, because they have very different costs:
//   - `getTier()`   governs the *expensive* WebGL background.
//   - `canHover()`  governs the *cheap* pointer interactions (tilt / magnetic /
//                   custom cursor). These are nearly free, so we run them on any
//                   non-touch device that hasn't opted out of motion.
//
// Everything degrades gracefully: a misdetected device still gets a usable,
// readable page — it just gets fewer moving parts.

export type Tier = 'high' | 'low' | 'off';

let tierCache: Tier | null = null;

export function reducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function finePointer(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  // `any-hover: hover` catches laptops with touchscreens too.
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

export function hasWebGL(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext('webgl') || c.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

// Pointer interactions are allowed whenever the device has a real pointer and
// the user hasn't asked for reduced motion.
export function canHover(): boolean {
  return finePointer() && !reducedMotion();
}

// Tier for the WebGL background.
//   off  -> render nothing (reduced motion, or no WebGL on a weak device)
//   low  -> static CSS/SVG noise texture, zero per-frame cost
//   high -> animated WebGL flow field at a reduced internal resolution
export function getTier(): Tier {
  if (tierCache) return tierCache;
  if (typeof window === 'undefined') return 'off';

  if (reducedMotion()) return (tierCache = 'off');

  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };

  // Respect Data Saver outright.
  if (nav.connection?.saveData) return (tierCache = 'low');

  // deviceMemory is reported in GB, rounded down to a power of two and capped
  // at 8 (and absent on Safari/iOS, where we assume a capable device).
  const mem = nav.deviceMemory ?? 8;
  const cores = nav.hardwareConcurrency ?? 8;

  const weak = mem <= 2 || cores <= 2;

  if (!hasWebGL()) return (tierCache = weak ? 'off' : 'low');
  tierCache = weak ? 'low' : 'high';
  return tierCache;
}
