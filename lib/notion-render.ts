// Server-only block enrichment.
//
// Runs in getStaticProps to pre-render the two things that would otherwise need
// a heavy client runtime: syntax-highlighted code (highlight.js) and math
// (KaTeX). The resulting HTML strings ride along in props, so the browser ships
// neither library. Never import this from a client component.

import hljs from 'highlight.js';
import katex from 'katex';
import type { BlockWithChildren } from './types';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function highlight(code: string, lang: string): string {
  if (lang && lang !== 'plain text' && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(code, { language: lang }).value;
    } catch {
      /* fall through to plain */
    }
  }
  return escapeHtml(code);
}

function katexHtml(expr: string, displayMode: boolean): string {
  try {
    return katex.renderToString(expr, { throwOnError: false, displayMode });
  } catch {
    return escapeHtml(expr);
  }
}

// Walk an arbitrary block-content value and attach inline KaTeX to every
// rich-text equation item found (in rich_text arrays, captions, table cells…).
// Rich-text equation items carry `annotations`; block-level equations don't,
// which is how we tell them apart.
function enrichInlineEquations(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) enrichInlineEquations(item);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown> & {
    type?: string;
    equation?: { expression?: string };
    annotations?: unknown;
    __eqHtml?: string;
  };
  if (obj.type === 'equation' && obj.annotations && obj.equation?.expression) {
    obj.__eqHtml = katexHtml(obj.equation.expression, false);
  }
  for (const key of Object.keys(obj)) {
    if (key === '__eqHtml') continue;
    enrichInlineEquations(obj[key]);
  }
}

// Mutates and returns the tree (props are JSON-cloned afterwards anyway).
export function enrichBlocks(blocks: BlockWithChildren[]): BlockWithChildren[] {
  for (const b of blocks) {
    if (b.type === 'code') {
      const code = b.code.rich_text.map((t) => t.plain_text).join('');
      b.__codeHtml = highlight(code, b.code.language);
    } else if (b.type === 'equation') {
      b.__eqHtml = katexHtml(b.equation.expression, true);
    }
    // Inline equations live inside the block's content payload (block[type]).
    enrichInlineEquations((b as unknown as Record<string, unknown>)[b.type]);
    if (b.children) enrichBlocks(b.children);
  }
  return blocks;
}
