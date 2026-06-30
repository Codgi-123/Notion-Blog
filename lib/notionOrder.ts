// The one piece that talks to Notion's *private* API. The official
// @notionhq/client cannot read a database view's manual drag-sort, so to honour
// "the order I dragged rows into" we read the view's blockIds via notion-client
// (the same trick notion-next uses) — and quarantine that fragility to this file.
//
// Needs NOTION_TOKEN_V2 (a browser `token_v2` cookie) for a PRIVATE database; a
// publicly-shared database works with no auth. Any failure returns [] so callers
// transparently fall back to the official API's query order.

import { NotionAPI } from 'notion-client';

const authToken = process.env.NOTION_TOKEN_V2;
const activeUser = process.env.NOTION_ACTIVE_USER; // only needed for some workspaces

const strip = (id: string) => id.replace(/-/g, '');

// Cache only a SUCCESSFUL non-empty result. A transient failure must not be
// memoised, or one flaky notion.so read early in a build poisons every later
// getStaticProps in the same process and silently reverts the whole site to the
// official query order.
let cached: string[] | null = null;
let inflight: Promise<string[]> | null = null;

/** Row ids (dash-stripped) in the database's default view order; [] on failure. */
export async function getViewOrder(databaseId: string): Promise<string[]> {
  if (cached) return cached;
  if (!inflight) {
    inflight = fetchOrder(databaseId)
      .then((ids) => {
        if (ids.length) cached = ids; // only a real answer sticks
        else console.warn('[notion] view-order: published DB but no ordered ids found');
        return ids;
      })
      .catch((e) => {
        console.warn('[notion] view-order fetch failed, using API order:', e?.message ?? e);
        return [];
      })
      .finally(() => {
        inflight = null; // let the next page retry if this one failed
      });
  }
  return inflight;
}

async function fetchOrder(databaseId: string): Promise<string[]> {
  const api = new NotionAPI(authToken ? { authToken, activeUser } : {});
  const recordMap: any = await api.getPage(databaseId);
  const cq = recordMap?.collection_query ?? {};

  // recordMap shape has shifted across Notion versions; accept either layout and
  // take the first view that yields ids (a database's default view).
  for (const collectionId of Object.keys(cq)) {
    const views = cq[collectionId] ?? {};
    for (const viewId of Object.keys(views)) {
      const v = views[viewId];
      const blockIds: string[] =
        v?.blockIds ?? v?.collection_group_results?.blockIds ?? [];
      if (blockIds.length) return blockIds.map(strip);
    }
  }
  return [];
}

/**
 * Stable-sort `rows` by their position in `order` (dash-stripped ids). Rows not
 * in `order` (e.g. brand-new, not yet in the cached view) sink to the end in
 * their original relative order. Pure — the testable core of this module.
 */
export function sortByViewOrder<T extends { id: string }>(rows: T[], order: string[]): T[] {
  if (!order.length) return rows;
  const rank = new Map(order.map((id, i) => [id, i]));
  const at = (r: T) => rank.get(strip(r.id)) ?? Number.MAX_SAFE_INTEGER;
  return rows
    .map((r, i) => [r, i] as const)
    .sort(([a, ai], [b, bi]) => at(a) - at(b) || ai - bi)
    .map(([r]) => r);
}

// ponytail: self-check for the sort glue. Run `tsx lib/notionOrder.ts`.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  const r = (id: string) => ({ id });
  const out = sortByViewOrder([r('c'), r('a'), r('new'), r('b')], ['a', 'b', 'c']).map((x) => x.id);
  console.assert(JSON.stringify(out) === JSON.stringify(['a', 'b', 'c', 'new']), 'order', out);
  console.assert(
    JSON.stringify(sortByViewOrder([r('x')], []).map((x) => x.id)) === '["x"]',
    'empty order = passthrough',
  );
  console.log('ok', out);
}
