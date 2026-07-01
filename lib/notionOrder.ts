// The database view's manual drag-sort order. The official @notionhq/client
// can't read view order, so we capture it from Notion's PRIVATE API — but only
// ONCE PER BUILD (scripts/snapshot-order.ts), never at request time: that read
// is too flaky from serverless IPs, and doing it on every ISR revalidate made
// the menu flip between correct and fallback order. Runtime just reads the
// snapshot below; reordering in Notion takes effect on the next deploy.

import snapshot from './menu-order.json';
import blogConfig from '../blog.config';

const strip = (id: string) => id.replace(/-/g, '');

/** Snapshotted row ids (dash-stripped), in the database view's order. */
export function getViewOrder(): string[] {
  return snapshot as string[];
}

/**
 * Stable-sort `rows` by their position in `order` (dash-stripped ids). Rows not
 * in `order` sink to the end in their original relative order. Pure.
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

// ---------------------------------------------------------------------------
// Live fetch — used ONLY by scripts/snapshot-order.ts at build time, never at
// request time. Kept here so the recordMap-parsing fragility lives in one place.
// ---------------------------------------------------------------------------

/** Fetch the live view order from Notion's private API (retries transient fails). */
export async function fetchViewOrder(databaseId: string): Promise<string[]> {
  const { NotionAPI } = await import('notion-client');
  const authToken = process.env.NOTION_TOKEN_V2;
  const activeUser = process.env.NOTION_ACTIVE_USER;

  const wantName: string | undefined = blogConfig.orderViewName;
  const blockIdsOf = (v: any): string[] =>
    v?.blockIds ?? v?.collection_group_results?.blockIds ?? [];

  // A DB has several views (Table/Board/Gallery…), each with its own drag-sort,
  // and the API lists them in NO stable order — so we must select a specific one
  // or the snapshot is a coin flip. getPage doesn't hydrate view names, so resolve
  // them via syncRecordValues and pick the view whose name matches config.
  const resolveViewIdByName = async (api: any, viewIds: string[]): Promise<string | undefined> => {
    if (!wantName) return undefined;
    const res: any = await api.fetch({
      endpoint: 'syncRecordValues',
      body: { requests: viewIds.map((id) => ({ pointer: { table: 'collection_view', id }, version: -1 })) },
    });
    const recs = res?.recordMap?.collection_view ?? res?.recordMapWithRoles?.collection_view ?? {};
    return viewIds.find((id) => {
      const v = recs[id]?.value?.value ?? recs[id]?.value;
      return v?.name === wantName;
    });
  };

  const once = async (): Promise<string[]> => {
    const api: any = new NotionAPI(authToken ? { authToken, activeUser } : {});
    const recordMap: any = await api.getPage(databaseId);
    const cq = recordMap?.collection_query ?? {};
    const collectionId = Object.keys(cq)[0];
    if (!collectionId) return [];
    const views = cq[collectionId] ?? {};
    const viewIds = Object.keys(views);

    const named = await resolveViewIdByName(api, viewIds);
    if (wantName && !named) {
      console.warn(`[notion] no view named "${wantName}" — falling back to first view`);
    }
    const chosen = named && views[named] ? named : viewIds[0];
    return blockIdsOf(views[chosen]).map(strip);
  };

  const ATTEMPTS = 3;
  for (let i = 0; i < ATTEMPTS; i++) {
    try {
      const ids = await once();
      if (ids.length) return ids;
    } catch (e) {
      if (i === ATTEMPTS - 1) throw e;
    }
    await new Promise((r) => setTimeout(r, 300 * (i + 1)));
  }
  return [];
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
