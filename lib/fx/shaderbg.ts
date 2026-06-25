import { getTier } from './perf';

function staticTexture(el: HTMLElement) {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>` +
    `<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/>` +
    `<feColorMatrix type='saturate' values='0'/></filter>` +
    `<rect width='100%' height='100%' filter='url(#n)'/></svg>`;
  el.style.backgroundImage = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  el.style.backgroundSize = '160px 160px';
}

export function initShaderBackground(): () => void {
  if (getTier() === 'off') return () => {};
  const host = document.createElement('div');
  host.className = 'fx-bg fx-bg-static';
  host.setAttribute('aria-hidden', 'true');
  staticTexture(host);
  document.body.appendChild(host);
  return () => host.remove();
}
