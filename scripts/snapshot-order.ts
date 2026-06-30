// Build-time snapshot of the Notion database view's drag-sort order. Runs as
// `prebuild` (before `next build`) so the order is captured once per deploy and
// baked into lib/menu-order.json — runtime never hits Notion's flaky private API.
//
// On any failure (missing creds, network, empty read) it KEEPS the committed
// menu-order.json and exits 0, so a flaky read can never break the build or wipe
// the last known-good order.

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { fetchViewOrder } from '../lib/notionOrder';

const out = fileURLToPath(new URL('../lib/menu-order.json', import.meta.url));
const dbId = process.env.NOTION_DATABASE_ID;

(async () => {
  if (!dbId) {
    console.warn('[snapshot-order] no NOTION_DATABASE_ID — keeping committed order');
    return;
  }
  try {
    const ids = await fetchViewOrder(dbId);
    if (!ids.length) {
      console.warn('[snapshot-order] empty read — keeping committed order');
      return;
    }
    writeFileSync(out, JSON.stringify(ids, null, 0) + '\n');
    console.log(`[snapshot-order] wrote ${ids.length} ids`);
  } catch (e: any) {
    console.warn('[snapshot-order] failed — keeping committed order:', e?.message ?? e);
  }
})();
