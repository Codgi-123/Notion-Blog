// Heading extraction + anchor id assignment, shared by the inline
// `table_of_contents` block renderer (components/NotionBlock) and the sticky
// sidebar (components/ArticleToc). Keeping it here — pure, no React — guarantees
// both produce identical anchor ids for the same block tree.

import type { BlockWithChildren } from './types';

export interface TocItem {
  blockId: string;
  id: string; // anchor id (matches the heading element's id)
  text: string;
  level: number; // 1 (h1) .. 3 (h3)
}

export interface Toc {
  items: TocItem[];
  anchorOf: Map<string, string>; // block id -> anchor id
}

export const HEADING_LEVEL: Record<string, number> = {
  heading_1: 1,
  heading_2: 2,
  heading_3: 3,
};

export function slugifyHeading(text: string): string {
  return (
    text
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  );
}

export function buildToc(blocks: BlockWithChildren[]): Toc {
  const items: TocItem[] = [];
  const anchorOf = new Map<string, string>();
  const used = new Map<string, number>();

  const walk = (list: BlockWithChildren[]) => {
    for (const b of list) {
      const level = HEADING_LEVEL[b.type];
      if (level) {
        const rich = (b as unknown as Record<string, { rich_text?: { plain_text: string }[] }>)[
          b.type
        ]?.rich_text;
        const text = rich?.map((t) => t.plain_text).join('') ?? '';
        let id = slugifyHeading(text);
        const n = used.get(id) ?? 0;
        used.set(id, n + 1);
        if (n) id = `${id}-${n}`;
        anchorOf.set(b.id, id);
        items.push({ blockId: b.id, id, text, level });
      }
      if (b.children?.length) walk(b.children);
    }
  };
  walk(blocks);
  return { items, anchorOf };
}
