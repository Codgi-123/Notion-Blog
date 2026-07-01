// List the database's views and the first few rows of each, so you can pick the
// right `orderViewId` for blog.config.js. Run: `npm run notion:views`.

import { NotionAPI } from 'notion-client';

const dbId = process.env.NOTION_DATABASE_ID;
const strip = (s: string) => s.replace(/-/g, '');

(async () => {
  if (!dbId) throw new Error('NOTION_DATABASE_ID not set');
  const api = new NotionAPI({
    authToken: process.env.NOTION_TOKEN_V2,
    activeUser: process.env.NOTION_ACTIVE_USER,
  });
  const rm: any = await api.getPage(dbId);
  const cq = rm?.collection_query ?? {};
  const title = (id: string) => rm.block?.[id]?.value?.properties?.title?.[0]?.[0] ?? strip(id).slice(0, 8);

  for (const cid of Object.keys(cq)) {
    for (const vid of Object.keys(cq[cid])) {
      const v = cq[cid][vid];
      const ids: string[] = v?.blockIds ?? v?.collection_group_results?.blockIds ?? [];
      console.log(`\nview ${vid}  (${ids.length} rows)`);
      console.log('  ' + ids.slice(0, 6).map(title).join(' | '));
    }
  }
  console.log('\nSet the matching id as blogConfig.orderViewId.');
})().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
