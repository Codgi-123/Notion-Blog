import Link from 'next/link';
import blogConfig from '../blog.config';
import type { Post } from '../lib/types';

export function formatMonthDay(iso: string | null): string {
  if (!iso) return '';
  // Parse the date parts straight from the ISO string instead of via `new Date`
  // — Date()'s getMonth/getDate are timezone-dependent, which makes the server
  // (build TZ) and client (browser TZ) render different text and breaks
  // hydration. String slicing is timezone-stable.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return '';
  return `${m[1]}.${m[2]}.${m[3]}`;
}

export function PostCard({ post, delay = 0 }: { post: Post; delay?: number }) {
  const href = `/${blogConfig.articlePrefix}/${post.slug}`;
  return (
    <Link
      href={href}
      className="post-card reveal"
      data-tilt
      style={{ transitionDelay: `${delay}s` }}
    >
      <div className="post-card-head">
        <div className="post-card-tags">
          {post.tags.slice(0, 2).map((t) => (
            <span key={t} className="chip">
              {t}
            </span>
          ))}
        </div>
        <span className="post-card-date">{formatMonthDay(post.date)}</span>
      </div>
      <div className="post-card-title">{post.title || '(无标题)'}</div>
      {post.summary && <div className="post-card-desc">{post.summary}</div>}
      <div className="post-card-foot">
        <span className="post-card-cat">{post.category || '随笔'}</span>
        <span className="post-card-arrow">→</span>
      </div>
    </Link>
  );
}
