import React, { useEffect, useMemo, useState } from 'react';
import type { BlockWithChildren } from '../lib/types';
import { buildToc, type TocItem } from '../lib/toc';

// Sticky, collapsible, level-indented table of contents shown beside an article.
// Highlights the section nearest the top of the viewport (scroll-spy) and links
// to the same anchor ids the headings render with (see lib/toc + NotionBlock).
//
// Rendered as a card that floats centered to the left of the article; hidden via
// CSS on narrow viewports; renders nothing when there are too few headings.

interface TocNode {
  item: TocItem;
  children: TocNode[];
}

// Nudge the card down a touch from the title's exact top — flush looks too high.
const TOP_OFFSET = 16;

// Flat [{level}] list -> nested tree, so deeper headings collapse under shallower.
function nest(items: TocItem[]): TocNode[] {
  const root: TocNode[] = [];
  const stack: TocNode[] = [];
  for (const item of items) {
    const node: TocNode = { item, children: [] };
    while (stack.length && stack[stack.length - 1].item.level >= item.level) stack.pop();
    (stack.length ? stack[stack.length - 1].children : root).push(node);
    stack.push(node);
  }
  return root;
}

// Default to showing only the top two levels: collapse any node deeper than the
// first level that still has children (so 3rd-level+ headings start hidden).
function defaultCollapsed(nodes: TocNode[], acc = new Set<string>()): Set<string> {
  for (const n of nodes) {
    if (n.item.level >= 2 && n.children.length) acc.add(n.item.blockId);
    if (n.children.length) defaultCollapsed(n.children, acc);
  }
  return acc;
}

export function ArticleToc({ blocks }: { blocks: BlockWithChildren[] }) {
  const items = useMemo(() => buildToc(blocks).items, [blocks]);
  const tree = useMemo(() => nest(items), [items]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => defaultCollapsed(tree));
  // Align the card's top with the article title's top (measured, since the nav
  // / notice-bar height isn't known up front). It's a document offset, so the
  // fixed card sits where the title starts and stays there as you scroll.
  const [topOffset, setTopOffset] = useState<number | null>(null);

  useEffect(() => {
    const measure = () => {
      const title = document.querySelector('.post-title');
      if (title) setTopOffset(title.getBoundingClientRect().top + window.scrollY + TOP_OFFSET);
    };
    measure();
    window.addEventListener('resize', measure, { passive: true });
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => {
    if (items.length < 2) return;
    const ids = items.map((i) => i.id);
    // Cache each heading's document offset. getBoundingClientRect forces a
    // synchronous reflow, so measuring every heading per scroll frame thrashes
    // layout; instead measure once (and on resize) and compare against scrollY.
    let tops: { id: string; top: number }[] = [];
    const measure = () => {
      tops = ids
        .map((id) => {
          const el = document.getElementById(id);
          return el ? { id, top: el.getBoundingClientRect().top + window.scrollY } : null;
        })
        .filter((t): t is { id: string; top: number } => t != null);
    };
    let raf = 0;
    const update = () => {
      raf = 0;
      let current = tops.length ? tops[0].id : ids[0];
      // A heading is "passed" once its top crosses 120px below the viewport top.
      for (const { id, top } of tops) {
        if (top - window.scrollY <= 120) current = id;
      }
      setActiveId(current);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    const onResize = () => {
      measure();
      onScroll();
    };
    measure();
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    // Heading positions shift as async content (images, fonts) settles.
    const ro = new ResizeObserver(onResize);
    ro.observe(document.body);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [items]);

  if (items.length < 2) return null;

  const toggle = (blockId: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(blockId) ? next.delete(blockId) : next.add(blockId);
      return next;
    });

  const renderNodes = (nodes: TocNode[]): React.ReactNode => (
    <ul>
      {nodes.map((node) => {
        const { blockId, id, text, level } = node.item;
        const hasChildren = node.children.length > 0;
        const isCollapsed = collapsed.has(blockId);
        return (
          <li key={blockId} className={`toc-l${level}`}>
            <div className="toc-row">
              {hasChildren ? (
                <button
                  type="button"
                  className="toc-caret"
                  aria-label={isCollapsed ? '展开' : '折叠'}
                  aria-expanded={!isCollapsed}
                  onClick={() => toggle(blockId)}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                    <path d="M3 1.5L6.5 5 3 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ) : (
                <span className="toc-caret-spacer" aria-hidden="true" />
              )}
              <a
                href={`#${id}`}
                className={activeId === id ? 'is-active' : undefined}
                onClick={() => setActiveId(id)}
              >
                {text}
              </a>
            </div>
            {hasChildren && !isCollapsed && renderNodes(node.children)}
          </li>
        );
      })}
    </ul>
  );

  return (
    <nav
      className="article-toc"
      aria-label="目录"
      style={topOffset != null ? { top: topOffset } : undefined}
    >
      <p className="article-toc-title">目录</p>
      {renderNodes(tree)}
    </nav>
  );
}
