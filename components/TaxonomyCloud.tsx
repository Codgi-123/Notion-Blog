import Link from 'next/link';
import type { Taxonomy } from '../lib/notion';

// A clickable cloud of categories or tags. `base` is '/category' or '/tag'.
export function TaxonomyCloud({
  items,
  base,
  prefix = '',
}: {
  items: Taxonomy[];
  base: string;
  prefix?: string;
}) {
  if (items.length === 0) return <p>暂无内容。</p>;
  return (
    <div className="taxonomy-cloud">
      {items.map((it) => (
        <Link key={it.name} href={`${base}/${encodeURIComponent(it.name)}`} className="taxonomy-chip">
          {prefix}
          {it.name}
          <span className="taxonomy-count">{it.count}</span>
        </Link>
      ))}
    </div>
  );
}
