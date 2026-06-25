// Hover-reveal "#" anchor on article headings. Clicking copies a direct link to
// that section (and updates the URL hash). Headings already carry stable ids
// (see lib/toc + NotionBlock); we just decorate the ones that have them.

export function initHeadingAnchors(): () => void {
  if (typeof window === 'undefined') return () => {};

  const enhance = () => {
    document
      .querySelectorAll<HTMLElement>(
        '.notion-content h2[id], .notion-content h3[id], .notion-content h4[id]',
      )
      .forEach((h) => {
        if (h.dataset.anchorReady) return;
        h.dataset.anchorReady = '1';
        h.classList.add('has-anchor');

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'heading-anchor';
        btn.textContent = '#';
        btn.setAttribute('aria-label', '复制本节链接');
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          const url = `${location.origin}${location.pathname}#${h.id}`;
          try {
            await navigator.clipboard.writeText(url);
          } catch {
            /* clipboard blocked — still update the hash below */
          }
          history.replaceState(null, '', `#${h.id}`);
          btn.classList.add('is-copied');
          setTimeout(() => btn.classList.remove('is-copied'), 1200);
        });
        h.appendChild(btn);
      });
  };

  enhance();
  const mo = new MutationObserver(() => enhance());
  mo.observe(document.body, { childList: true, subtree: true });
  return () => mo.disconnect();
}
