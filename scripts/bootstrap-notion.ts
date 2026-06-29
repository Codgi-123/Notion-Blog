// Agent-run: build the whole Notion database from scratch via the API.
// Prereq: NOTION_TOKEN set, and a Notion page shared with the integration whose
// id/URL is passed as arg or NOTION_PARENT_PAGE_ID. Creates the DB + all columns
// + select options + 2 sample posts + the Config row (CONFIG-TABLE seeded), then
// appends NOTION_DATABASE_ID to .env.local. Idempotent-ish: re-running makes a
// second DB, so run once.
//   npx tsx scripts/bootstrap-notion.ts <notion-page-url-or-id>
import { config } from 'dotenv';
config({ path: '.env.local' });
config();
import { appendFileSync, readFileSync, writeFileSync, existsSync } from 'fs';

const CONFIG_ROWS = [
  { key: 'TITLE', value: 'Codgi Blog', enabled: true, note: '站点标题，用于浏览器标签和 og:title。不启用则用 blog.config.js 默认值。' },
  { key: 'DESCRIPTION', value: 'A blog powered by Notion + Next.js', enabled: true, note: '站点描述，用于 meta description / og:description，也是首页副标题的兜底。' },
  { key: 'AUTHOR', value: 'Codgi', enabled: true, note: '作者名，显示在页脚版权处（© 年份 作者）。' },
  { key: 'LINK', value: 'https://example.com', enabled: false, note: '站点网址，用于页脚 "Site" 外链和 sitemap 的 base URL。部署后填真实域名并启用。' },
  { key: 'KEYWORDS', value: '', enabled: false, note: 'SEO 关键词，渲染为 meta keywords，用英文逗号隔开。' },
  { key: 'BLOG_FAVICON', value: '', enabled: false, note: '站点 favicon 的图片 URL。不启用则用内置默认图标。' },
  { key: 'BIO', value: '', enabled: false, note: '首页 hero 区的副标题。不启用则回退到 DESCRIPTION。' },
  { key: 'GLOBAL_CSS', value: '', enabled: false, note: '自定义全局 CSS，原样注入到每个页面的 <style>。' },
];

function pageId(arg: string): string {
  // Accept a raw 32-hex id or a Notion URL ending in ...-<id> or .../<id>?v=.
  const m = arg.replace(/-/g, '').match(/[0-9a-f]{32}/i);
  if (!m) throw new Error(`Can't find a 32-hex page id in: ${arg}`);
  return m[0];
}

async function main() {
  const { notion } = await import('../lib/notion');
  const blogConfig = (await import('../blog.config')).default as any;
  const P = blogConfig.properties;
  const T = blogConfig.types;
  const ct = blogConfig.configTable;

  if (!process.env.NOTION_TOKEN) throw new Error('Set NOTION_TOKEN in .env.local first.');
  const parent = pageId(process.argv[2] || process.env.NOTION_PARENT_PAGE_ID || '');

  const sel = (...names: string[]) => ({ select: { options: names.map((name) => ({ name })) } });

  // 1. Create the database with every column the data layer expects.
  const db = await notion.databases.create({
    parent: { type: 'page_id', page_id: parent },
    title: [{ text: { content: `${blogConfig.title} DB` } }],
    properties: {
      [P.title]: { title: {} },
      [P.slug]: { rich_text: {} },
      [P.status]: sel(...blogConfig.publishedStatuses, 'Draft'),
      [P.summary]: { rich_text: {} },
      [P.tags]: { multi_select: { options: [] } },
      [P.category]: { select: { options: [] } },
      [P.date]: { date: {} },
      [P.type]: sel(T.post, T.page, T.menu, T.subMenu, T.notice, T.about, T.friends, T.config),
      [P.icon]: { rich_text: {} },
      order: { number: {} },
    },
  });
  const dbId = db.id;
  console.log(`✓ database created: ${dbId}`);

  const text = (s: string) => (s ? [{ text: { content: s } }] : []);
  const today = new Date().toISOString().slice(0, 10);

  // 2. Two sample published posts so the site renders immediately.
  for (const [i, t] of [['Hello World', 'hello-world'], ['第二篇文章', 'second-post']].entries()) {
    await notion.pages.create({
      parent: { database_id: dbId },
      properties: {
        [P.title]: { title: text(t[0]) },
        [P.slug]: { rich_text: text(t[1]) },
        [P.status]: { select: { name: blogConfig.publishedStatuses[0] } },
        [P.type]: { select: { name: T.post } },
        [P.date]: { date: { start: today } },
        [P.summary]: { rich_text: text(i === 0 ? '由 bootstrap 脚本自动生成的示例文章。' : '又一篇示例。') },
      },
      children: [
        { object: 'block', type: 'paragraph', paragraph: { rich_text: text('正文直接写在这个 Notion 页面里。删掉这篇示例，开始你自己的写作。') } },
      ],
    });
    console.log(`✓ sample post: ${t[0]}`);
  }

  // 3. Config row + embedded CONFIG-TABLE child database, seeded.
  const cfgRow = await notion.pages.create({
    parent: { database_id: dbId },
    properties: {
      [P.title]: { title: text('Config') },
      [P.type]: { select: { name: T.config } },
    },
  });
  const cfgDb = await notion.databases.create({
    parent: { type: 'page_id', page_id: cfgRow.id },
    title: [{ text: { content: 'CONFIG-TABLE' } }],
    properties: {
      [ct.key]: { title: {} },
      [ct.value]: { rich_text: {} },
      [ct.enable]: { checkbox: {} },
      备注: { rich_text: {} },
    },
  });
  for (const r of CONFIG_ROWS) {
    await notion.pages.create({
      parent: { database_id: cfgDb.id },
      properties: {
        [ct.key]: { title: text(r.key) },
        [ct.value]: { rich_text: text(r.value) },
        [ct.enable]: { checkbox: r.enabled },
        备注: { rich_text: text(r.note) },
      },
    });
  }
  console.log(`✓ Config row + CONFIG-TABLE seeded (${CONFIG_ROWS.length} keys)`);

  // 4. Persist the id into .env.local (replace existing line if present).
  const envPath = '.env.local';
  const line = `NOTION_DATABASE_ID=${dbId}`;
  if (existsSync(envPath) && /^NOTION_DATABASE_ID=/m.test(readFileSync(envPath, 'utf8'))) {
    writeFileSync(envPath, readFileSync(envPath, 'utf8').replace(/^NOTION_DATABASE_ID=.*$/m, line));
  } else {
    appendFileSync(envPath, `\n${line}\n`);
  }
  console.log(`\n✅ done. NOTION_DATABASE_ID written to .env.local`);
  console.log(`Database URL: https://www.notion.so/${dbId.replace(/-/g, '')}`);
}
main().catch((e) => {
  console.error(e.body || e.message || e);
  process.exit(1);
});
