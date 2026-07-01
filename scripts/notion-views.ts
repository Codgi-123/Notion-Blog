// List the database's views (name + type + first rows) so you can set the right
// `orderViewName` in blog.config.js. Run: `npm run notion:views`.

import { NotionAPI } from 'notion-client';

const dbId = process.env.NOTION_DATABASE_ID;
const strip = (s: string) => s.replace(/-/g, '');

(async () => {
  if (!dbId) throw new Error('NOTION_DATABASE_ID not set');
  const api: any = new NotionAPI({
    authToken: process.env.NOTION_TOKEN_V2,
    activeUser: process.env.NOTION_ACTIVE_USER,
  });
  const rm: any = await api.getPage(dbId);
  const cid = Object.keys(rm.collection_query)[0];
  const views = rm.collection_query[cid];
  const viewIds = Object.keys(views);
  const title = (id: string) => rm.block?.[id]?.value?.properties?.title?.[0]?.[0] ?? strip(id).slice(0, 8);

  // getPage doesn't hydrate view names; fetch them explicitly.
  const res: any = await api.fetch({
    endpoint: 'syncRecordValues',
    body: { requests: viewIds.map((id) => ({ pointer: { table: 'collection_view', id }, version: -1 })) },
  });
  const recs = res?.recordMap?.collection_view ?? res?.recordMapWithRoles?.collection_view ?? {};

  for (const vid of viewIds) {
    const v = recs[vid]?.value?.value ?? recs[vid]?.value;
    const ids: string[] = views[vid]?.blockIds ?? views[vid]?.collection_group_results?.blockIds ?? [];
    console.log(`\n"${v?.name ?? '?'}"  [${v?.type ?? '?'}]  (${ids.length} rows)`);
    console.log('  ' + ids.slice(0, 6).map(title).join(' | '));
  }
  console.log('\nSet the matching name as blogConfig.orderViewName.');
})().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
