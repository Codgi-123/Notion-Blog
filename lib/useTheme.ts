import { useEffect, useState } from 'react';

// Client-side theme state, synced with the <html data-theme> attribute that
// _document.tsx sets before paint, and persisted to localStorage. The toggle
// renders sun/moon SVGs (see Layout.tsx) rather than glyphs.
export function useTheme() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.dataset.theme === 'dark');
  }, []);

  const toggle = () => {
    setDark((prev) => {
      const next = !prev;
      const root = document.documentElement;
      if (next) root.dataset.theme = 'dark';
      else delete root.dataset.theme;
      try {
        localStorage.setItem('kiwi-blog-theme', next ? 'dark' : 'light');
      } catch (e) {
        /* ignore */
      }
      return next;
    });
  };

  return { dark, toggle };
}
