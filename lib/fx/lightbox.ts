// Click-to-zoom for article images. A single delegated click handler opens any
// clicked content image in a full-screen overlay; click anywhere or press Esc to
// close. Mounted once from FxRoot; works across client-side navigation without
// re-binding (event delegation on document).

export function initLightbox(): () => void {
  if (typeof window === 'undefined') return () => {};

  let overlay: HTMLDivElement | null = null;

  const close = () => {
    if (!overlay) return;
    const node = overlay;
    overlay = null;
    node.classList.remove('is-open');
    document.body.style.overflow = '';
    setTimeout(() => node.remove(), 300);
  };

  const open = (src: string, alt: string) => {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'fx-lightbox';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', alt || '图片预览');
    const img = document.createElement('img');
    img.src = src;
    img.alt = alt;
    overlay.appendChild(img);
    overlay.addEventListener('click', close);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => overlay && overlay.classList.add('is-open'));
  };

  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0) return;
    const t = e.target as HTMLElement;
    const img = t.closest?.(
      '.block-image img, .notion-content img',
    ) as HTMLImageElement | null;
    if (!img) return;
    e.preventDefault();
    open(img.currentSrc || img.src, img.alt || '');
  };
  document.addEventListener('click', onClick);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);

  return () => {
    document.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKey);
    close();
  };
}
