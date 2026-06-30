import { Client, isFullBlock, isFullPage } from '@notionhq/client';
import type {
  PageObjectResponse,
  GetPageResponse,
} from '@notionhq/client/build/src/api-endpoints';
import blogConfig from '../blog.config';
import type { Post, MenuItem, SiteConfig, BlockWithChildren } from './types';
import { getViewOrder, sortByViewOrder } from './notionOrder';

const token = process.env.NOTION_TOKEN;
const databaseId = process.env.NOTION_DATABASE_ID;

if (!token) {
  console.warn('[notion] NOTION_TOKEN is not set — API calls will fail.');
}

export const notion = new Client({ auth: token });

const P = blogConfig.properties;

// ---------------------------------------------------------------------------
// Property readers — tolerate missing / differently-typed properties so the
// blog still renders if a database column is absent.
// ---------------------------------------------------------------------------

function plainText(rich: { plain_text: string }[] | undefined): string {
  if (!rich) return '';
  return rich.map((r) => r.plain_text).join('');
}

function readProp(page: PageObjectResponse, name: string) {
  return page.properties[name];
}

function readTitle(page: PageObjectResponse): string {
  const prop = readProp(page, P.title);
  if (prop?.type === 'title') return plainText(prop.title);
  return '';
}

function readRichText(page: PageObjectResponse, name: string): string {
  const prop = readProp(page, name);
  if (prop?.type === 'rich_text') return plainText(prop.rich_text);
  return '';
}

function readSelect(page: PageObjectResponse, name: string): string | null {
  const prop = readProp(page, name);
  if (prop?.type === 'select') return prop.select?.name ?? null;
  if (prop?.type === 'status') return prop.status?.name ?? null;
  return null;
}

function readMultiSelect(page: PageObjectResponse, name: string): string[] {
  const prop = readProp(page, name);
  if (prop?.type === 'multi_select') return prop.multi_select.map((s) => s.name);
  return [];
}

function readNumber(page: PageObjectResponse, name: string): number | null {
  const prop = readProp(page, name);
  if (prop?.type === 'number') return prop.number;
  return null;
}

function readDate(page: PageObjectResponse, name: string): string | null {
  const prop = readProp(page, name);
  if (prop?.type === 'date') return prop.date?.start ?? null;
  // Fall back to Notion's built-in created time.
  return null;
}

function readCover(page: PageObjectResponse): string | null {
  const cover = page.cover;
  if (!cover) return null;
  if (cover.type === 'external') return cover.external.url;
  if (cover.type === 'file') return cover.file.url;
  return null;
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

function pageToPost(page: PageObjectResponse): Post {
  const title = readTitle(page);
  const rawSlug = readRichText(page, P.slug);
  return {
    id: page.id,
    title,
    slug: rawSlug ? slugify(rawSlug) : page.id.replace(/-/g, ''),
    status: readSelect(page, P.status),
    summary: readRichText(page, P.summary),
    tags: readMultiSelect(page, P.tags),
    category: readSelect(page, P.category),
    date: readDate(page, P.date) ?? page.created_time,
    type: readSelect(page, P.type),
    cover: readCover(page),
    icon: readRichText(page, P.icon) || null,
    order: P.order ? readNumber(page, P.order) : null,
  };
}

function isPublished(post: Post): boolean {
  if (!post.status) return true; // no status column -> treat all as published
  return blogConfig.publishedStatuses.includes(post.status);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const T = blogConfig.types;

/**
 * All published rows in the database view's manual drag-sort order (see
 * notionOrder.getViewOrder; falls back to the official API's query order when
 * the private API is unavailable). The single source of truth — the typed
 * accessors below filter/re-sort it; menus consume this order directly.
 */
export async function getPublishedRows(): Promise<Post[]> {
  if (!token || !databaseId) {
    // No credentials (e.g. a preview build before secrets are set): return
    // empty rather than crashing the whole build.
    console.warn('[notion] Missing NOTION_TOKEN/NOTION_DATABASE_ID — returning no rows.');
    return [];
  }

  const rows: Post[] = [];
  let cursor: string | undefined;

  do {
    const res = await notion.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const page of res.results) {
      if (isFullPage(page)) rows.push(pageToPost(page));
    }
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);

  // Reorder to match the database view's manual drag-sort (read via the private
  // API in notionOrder; falls back to this query order if unavailable). Menus
  // depend on this order; date-sorted lists re-sort anyway.
  const ordered = sortByViewOrder(rows, await getViewOrder(databaseId));
  return ordered.filter(isPublished);
}

/** A slug usable as a clean internal URL (non-empty, not an external link). */
function hasValidSlug(post: Post): boolean {
  return !!post.slug && !/^https?[-:]/.test(post.slug);
}

/** Published blog articles (type Post, or untyped), newest first. */
export async function getPosts(): Promise<Post[]> {
  const rows = await getPublishedRows();
  return rows
    .filter((p) => !p.type || p.type === T.post)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
}

/** Standalone pages (type Page) with a valid slug. */
export async function getPages(): Promise<Post[]> {
  const rows = await getPublishedRows();
  return rows.filter((p) => p.type === T.page && hasValidSlug(p));
}

/** Site-wide notices (type Notice), newest first. */
export async function getNotices(): Promise<Post[]> {
  const rows = await getPublishedRows();
  return rows
    .filter((p) => p.type === T.notice)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
}

// A home-page special section: a single Notion row plus its rendered body.
export interface HomeSection {
  meta: Post | null;
  blocks: BlockWithChildren[];
}

export interface HomeSections {
  notice: HomeSection;
  about: HomeSection;
  friends: HomeSection;
}

/**
 * Fetch the home page's special sections (公告 / 关于我 / 友情链接). Each is one
 * Notion row whose body is rendered into a section. A row is matched by `type`
 * first; if it has no `type` yet, it's matched by a title keyword (configured in
 * blog.config.homeSections) so it works before the type is filled in.
 */
export async function getHomeSections(): Promise<HomeSections> {
  const rows = await getPublishedRows();
  const cfg = blogConfig.homeSections;

  const pick = (def: { type: string }): Post | null =>
    rows.find((r) => r.type === def.type) ?? null;

  const build = async (meta: Post | null): Promise<HomeSection> =>
    meta ? { meta, blocks: await getBlocks(meta.id) } : { meta: null, blocks: [] };

  const [notice, about, friends] = await Promise.all([
    build(pick(cfg.notice)),
    build(pick(cfg.about)),
    build(pick(cfg.friends)),
  ]);
  return { notice, about, friends };
}

/** A {name, count} taxonomy entry, sorted by count desc. */
export interface Taxonomy {
  name: string;
  count: number;
}

function tally(values: string[]): Taxonomy[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** All categories across published articles, with counts. */
export async function getCategories(): Promise<Taxonomy[]> {
  const posts = await getPosts();
  return tally(posts.map((p) => p.category).filter((c): c is string => !!c));
}

/** All tags across published articles, with counts. */
export async function getTags(): Promise<Taxonomy[]> {
  const posts = await getPosts();
  return tally(posts.flatMap((p) => p.tags));
}

/** Published articles in a given category. */
export async function getPostsByCategory(category: string): Promise<Post[]> {
  const posts = await getPosts();
  return posts.filter((p) => p.category === category);
}

/** Published articles carrying a given tag. */
export async function getPostsByTag(tag: string): Promise<Post[]> {
  const posts = await getPosts();
  return posts.filter((p) => p.tags.includes(tag));
}

/** Find a published article by slug. */
export async function getPostBySlug(slug: string): Promise<Post | null> {
  const posts = await getPosts();
  return posts.find((p) => p.slug === slug) ?? null;
}

/** Find a published standalone page by slug. */
export async function getPageBySlug(slug: string): Promise<Post | null> {
  const pages = await getPages();
  return pages.find((p) => p.slug === slug) ?? null;
}

/** Resolve a menu row's slug into an href (external, absolute, or prefixed). */
function resolveHref(slug: string): string {
  if (!slug) return '/'; // empty slug on a menu -> home
  if (/^https?:\/\//.test(slug)) return slug; // external link
  return slug.startsWith('/') ? slug : `/${slug}`;
}

/**
 * Build the navigation tree from Menu/SubMenu rows. Following notion-next's
 * rule, each SubMenu attaches to the Menu that immediately precedes it (in
 * database order). A Menu with children becomes a non-clickable dropdown.
 */
export async function getMenus(): Promise<MenuItem[]> {
  const rows = await getPublishedRows();
  // Rows arrive in the view's manual drag-sort order (getPublishedRows), so each
  // SubMenu lands right after its intended parent — matching what you see in
  // Notion. An `order` number property, if set, still overrides as a tie-break.
  const orderProp = blogConfig.properties.order;
  const menuRows = rows.filter((r) => r.type === T.menu || r.type === T.subMenu || r.type === T.page);
  if (orderProp) {
    menuRows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  const menus: MenuItem[] = [];

  for (const row of menuRows) {
    if (row.type === T.menu || row.type === T.page) {
      menus.push({
        id: row.id,
        title: row.title,
        href: resolveHref(row.slug),
        icon: row.icon,
        children: [],
      });
    } else if (row.type === T.subMenu && menus.length > 0) {
      menus[menus.length - 1].children.push({
        id: row.id,
        title: row.title,
        href: resolveHref(row.slug),
        icon: row.icon,
        children: [],
      });
    }
  }
  return menus;
}

/**
 * Read the Config row's embedded CONFIG-TABLE child database and return a map
 * of every *enabled* key -> value. Empty if there's no Config row or the
 * feature is disabled. Follows notion-next: only checked `启用` rows apply.
 */
export async function getNotionConfigMap(): Promise<Record<string, string>> {
  const ct = blogConfig.configTable;
  if (!ct || !token || !databaseId) return {};

  const rows = await getPublishedRows();
  const cfgRow = rows.find((r) => r.type === T.config);
  if (!cfgRow) return {};

  // Shallow-list the config row's children to find the embedded database.
  const children = await notion.blocks.children.list({ block_id: cfgRow.id, page_size: 100 });
  const childDb = children.results.find(
    (b): b is typeof b & { type: 'child_database' } => isFullBlock(b) && b.type === 'child_database',
  );
  if (!childDb) return {};

  const map: Record<string, string> = {};
  let cursor: string | undefined;
  do {
    const res = await notion.databases.query({
      database_id: childDb.id,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const pg of res.results) {
      if (!isFullPage(pg)) continue;
      const enableProp = pg.properties[ct.enable];
      const enabled = enableProp?.type === 'checkbox' ? enableProp.checkbox : false;
      if (!enabled) continue;

      const keyProp = pg.properties[ct.key];
      const valProp = pg.properties[ct.value];
      const key = keyProp?.type === 'title' ? plainText(keyProp.title) : '';
      const value = valProp?.type === 'rich_text' ? plainText(valProp.rich_text) : '';
      if (key) map[key.trim()] = value;
    }
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return map;
}

/** Merge Notion Config overrides over blog.config.js defaults. */
export async function getSiteConfig(): Promise<SiteConfig> {
  const raw = await getNotionConfigMap();
  const g = (k: string): string | null => (raw[k] ? raw[k] : null);
  return {
    title: g('TITLE') ?? blogConfig.title,
    description: g('DESCRIPTION') ?? blogConfig.description,
    author: g('AUTHOR') ?? blogConfig.author,
    link: g('LINK') ?? blogConfig.link,
    keywords: g('KEYWORDS'),
    favicon: g('BLOG_FAVICON'),
    bio: g('BIO'),
    globalCss: g('GLOBAL_CSS'),
  };
}

/** Shared layout data (nav + notices + resolved site config) every page needs. */
export async function getLayoutProps(): Promise<{
  menus: MenuItem[];
  notices: Post[];
  site: SiteConfig;
}> {
  const [menus, notices, site] = await Promise.all([getMenus(), getNotices(), getSiteConfig()]);
  return { menus, notices, site };
}

/** Page metadata by id (used when we already know the id). */
export async function getPageMeta(pageId: string): Promise<Post | null> {
  const page: GetPageResponse = await notion.pages.retrieve({ page_id: pageId });
  if (!isFullPage(page)) return null;
  return pageToPost(page);
}

/** Recursively fetch a page's block tree. */
export async function getBlocks(blockId: string): Promise<BlockWithChildren[]> {
  const blocks: BlockWithChildren[] = [];
  let cursor: string | undefined;

  do {
    const res = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const block of res.results) {
      if (!isFullBlock(block)) continue;
      const withChildren: BlockWithChildren = block;
      if (block.has_children) {
        withChildren.children = await getBlocks(block.id);
      }
      blocks.push(withChildren);
    }
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return blocks;
}
