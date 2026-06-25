import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import blogConfig from '../blog.config';
import type { Post } from '../lib/types';

interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
  posts: Post[];
}

// Cmd/Ctrl+K command palette from the Kiwi design: searches title, summary and
// tags; Escape or a backdrop click closes it.
export function SearchOverlay({ open, onClose, posts }: SearchOverlayProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return posts.slice(0, 4);
    return posts.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.summary.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [query, posts]);

  if (!open) return null;

  const go = (post: Post) => {
    onClose();
    router.push(`/${blogConfig.articlePrefix}/${post.slug}`);
  };

  const noResults = query.trim().length > 0 && results.length === 0;

  return (
    <div className="search-backdrop" onClick={onClose}>
      <div className="search-panel" onClick={(e) => e.stopPropagation()}>
        <div className="search-input-row">
          <svg
            className="search-icon"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索文章、标签..."
            className="search-input"
          />
          <button className="search-esc" onClick={onClose} type="button">
            ESC
          </button>
        </div>
        {results.length > 0 && (
          <div className="search-results">
            {results.map((p) => (
              <button key={p.id} className="search-result" onClick={() => go(p)} type="button">
                <div className="search-result-text">
                  <div className="search-result-title">{p.title}</div>
                  {p.summary && <div className="search-result-desc">{p.summary}</div>}
                </div>
                {p.date && (
                  <span className="search-result-date">{formatShort(p.date)}</span>
                )}
              </button>
            ))}
          </div>
        )}
        {noResults && <div className="search-empty">没有找到匹配的文章</div>}
      </div>
    </div>
  );
}

function formatShort(iso: string): string {
  // Timezone-stable (see formatMonthDay in PostCard) so SSR and client agree.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return '';
  return `${m[2]}.${m[3]}`;
}
