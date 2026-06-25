// Adds a "copy" button to every rendered code block (figure.code-block). A pure
// utility — not gated by motion/pointer. New blocks after client-side navigation
// are picked up by a MutationObserver. Mounted once from FxRoot.

export function initCodeCopy(): () => void {
  if (typeof window === 'undefined') return () => {};

  const enhance = () => {
    document
      .querySelectorAll<HTMLElement>('figure.code-block:not([data-copy-ready])')
      .forEach((fig) => {
        fig.dataset.copyReady = '1';
        const pre = fig.querySelector('pre');
        if (!pre) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'code-copy';
        btn.textContent = '复制';
        btn.setAttribute('aria-label', '复制代码');

        let resetTimer: ReturnType<typeof setTimeout> | null = null;
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          const text = (pre as HTMLElement).innerText;
          try {
            await navigator.clipboard.writeText(text);
            btn.textContent = '已复制';
            btn.classList.add('is-done');
          } catch {
            btn.textContent = '复制失败';
          }
          if (resetTimer) clearTimeout(resetTimer);
          resetTimer = setTimeout(() => {
            btn.textContent = '复制';
            btn.classList.remove('is-done');
          }, 1500);
        });

        fig.appendChild(btn);
      });
  };

  enhance();
  const mo = new MutationObserver(() => enhance());
  mo.observe(document.body, { childList: true, subtree: true });
  return () => mo.disconnect();
}
