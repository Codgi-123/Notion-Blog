// The database view's manual drag-sort order. The official @notionhq/client
// can't read view order, so we capture it from Notion's PRIVATE API — but only
// ONCE PER BUILD (scripts/snapshot-order.ts), never at request time: that read
// is too flaky from serverless IPs, and doing it on every ISR revalidate made
// the menu flip between correct and fallback order. Runtime just reads the
// snapshot below; reordering in Notion takes effect on the next deploy.

import snapshot from './menu-order.json';

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

  const once = async (): Promise<string[]> => {
    const api = new NotionAPI(authToken ? { authToken, activeUser } : {});
    const recordMap: any = await api.getPage(databaseId);
    const cq = recordMap?.collection_query ?? {};
    // recordMap shape has shifted across Notion versions; accept either layout.
    for (const collectionId of Object.keys(cq)) {
      const views = cq[collectionId] ?? {};
      for (const viewId of Object.keys(views)) {
        const v = views[viewId];
        const ids: string[] = v?.blockIds ?? v?.collection_group_results?.blockIds ?? [];
        if (ids.length) return ids.map(strip);
      }
    }
    return [];
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
