import type {
  BlockObjectResponse,
  RichTextItemResponse,
} from '@notionhq/client/build/src/api-endpoints';

// A published post's metadata, normalized from a Notion database page.
export interface Post {
  id: string;
  title: string;
  slug: string;
  status: string | null;
  summary: string;
  tags: string[];
  category: string | null;
  date: string | null; // ISO string
  type: string | null;
  cover: string | null;
  icon: string | null; // FontAwesome class for menu/page items
  order: number | null; // optional explicit sort key (e.g. for menus)
}

// Resolved site settings: blog.config.js defaults overridden by the Notion
// Config row (CONFIG-TABLE).
export interface SiteConfig {
  title: string;
  description: string;
  author: string;
  link: string;
  keywords: string | null;
  favicon: string | null;
  bio: string | null;
  globalCss: string | null;
  hero: { line1: string; line2: string };
}

// A navigation entry built from Menu/SubMenu rows.
export interface MenuItem {
  id: string;
  title: string;
  href: string; // resolved link target
  icon: string | null;
  children: MenuItem[];
}

export type Block = BlockObjectResponse;
export type RichText = RichTextItemResponse;

// A block plus its already-fetched children (Notion returns children lazily).
// The `__*Html` fields are populated server-side by enrichBlocks (lib/notion-
// render) with build-time rendered HTML, so the client ships no highlighter/math
// runtime. See components/NotionBlock + RichText for where they're consumed.
export type BlockWithChildren = Block & {
  children?: BlockWithChildren[];
  __codeHtml?: string; // highlight.js output for `code` blocks
  __eqHtml?: string; // KaTeX (display mode) for `equation` blocks
};

// A rich-text item that may carry build-time KaTeX for inline equations.
export type RichTextWithHtml = RichText & { __eqHtml?: string };
