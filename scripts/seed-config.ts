// One-off: write the 8 site-config keys' defaults + 备注 into the live
// CONFIG-TABLE. Upserts by key. Skips LINK's value (real URL) but syncs its note.
// Run: npx tsx scripts/seed-config.ts
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

// value '' + enabled:false = placeholder row. value:null = leave value untouched.
const ROWS: { key: string; value: string | null; enabled: boolean | null; note: string }[] = [
  { key: 'TITLE', value: 'Codgi Blog', enabled: true, note: '站点标题，用于浏览器标签和 og:title。不启用则用 blog.config.js 默认值。' },
  { key: 'DESCRIPTION', value: 'A blog powered by Notion + Next.js', enabled: true, note: '站点描述，用于 meta description / og:description，也是首页副标题的兜底。不启用则用默认值。' },
  { key: 'AUTHOR', value: 'Codgi', enabled: true, note: '作者名，显示在页脚版权处（© 年份 作者）。' },
  { key: 'LINK', value: null, enabled: null, note: '站点网址，用于页脚 "Site" 外链和 sitemap 的 base URL。' },
  { key: 'KEYWORDS', value: '', enabled: false, note: 'SEO 关键词，渲染为 meta keywords，用英文逗号隔开。不启用则不渲染该标签。' },
  { key: 'BLOG_FAVICON', value: '', enabled: false, note: '站点 favicon 的图片 URL。不启用则用内置默认图标。' },
  { key: 'BIO', value: '', enabled: false, note: '首页 hero 区的副标题。不启用则回退到 DESCRIPTION。' },
  { key: 'GLOBAL_CSS', value: '', enabled: false, note: '自定义全局 CSS，原样注入到每个页面的 <style>。' },
  { key: 'HERO_LINE1', value: 'Thoughts,', enabled: true, note: '首页 hero 大标题第一行。不启用则用 blog.config.js 默认值。' },
  { key: 'HERO_LINE2', value: 'crafted.', enabled: true, note: '首页 hero 大标题第二行（斜体）。不启用则用 blog.config.js 默认值。' },
];

async function main() {
  const { notion } = await import('../lib/notion');
  const { isFullBlock, isFullPage } = await import('@notionhq/client');
  const blogConfig = (await import('../blog.config')).default as any;

  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!process.env.NOTION_TOKEN || !databaseId) throw new Error('Set NOTION_TOKEN and NOTION_DATABASE_ID');
  const ct = blogConfig.configTable;
  const NOTE = '备注';

  const rows = await notion.databases.query({ database_id: databaseId, page_size: 100 });
  let childDbId: string | undefined;
  for (const pg of rows.results) {
    if (!isFullPage(pg)) continue;
    const tp: any = pg.properties[blogConfig.properties.type];
    if ((tp?.type === 'select' ? tp.select?.name : undefined) !== blogConfig.types.config) continue;
    const children = await notion.blocks.children.list({ block_id: pg.id, page_size: 100 });
    const cdb = children.results.find((b) => isFullBlock(b) && b.type === 'child_database');
    if (cdb) childDbId = cdb.id;
    break;
  }
  if (!childDbId) throw new Error('CONFIG-TABLE child database not found');

  const byKey = new Map<string, string>();
  let cursor: string | undefined;
  do {
    const res = await notion.databases.query({ database_id: childDbId, start_cursor: cursor, page_size: 100 });
    for (const pg of res.results) {
      if (!isFullPage(pg)) continue;
      const kp: any = pg.properties[ct.key];
      if (kp?.type === 'title') byKey.set(kp.title.map((t: any) => t.plain_text).join('').trim(), pg.id);
    }
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);

  for (const r of ROWS) {
    const props: any = { [NOTE]: { rich_text: [{ text: { content: r.note } }] } };
    if (r.value !== null) props[ct.value] = { rich_text: r.value ? [{ text: { content: r.value } }] : [] };
    if (r.enabled !== null) props[ct.enable] = { checkbox: r.enabled };
    const id = byKey.get(r.key);
    if (id) {
      await notion.pages.update({ page_id: id, properties: props });
      console.log(`updated: ${r.key}`);
    } else {
      props[ct.key] = { title: [{ text: { content: r.key } }] };
      await notion.pages.create({ parent: { database_id: childDbId }, properties: props });
      console.log(`created: ${r.key}`);
    }
  }
  console.log('\ndone.');
}
main();
