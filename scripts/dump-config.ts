// Read-only: dump CONFIG-TABLE schema + every row (all property values).
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

async function main() {
  const { notion } = await import('../lib/notion');
  const { isFullBlock, isFullPage } = await import('@notionhq/client');
  const blogConfig = (await import('../blog.config')).default as any;
  const databaseId = process.env.NOTION_DATABASE_ID!;

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
  if (!childDbId) throw new Error('CONFIG-TABLE not found');

  const db: any = await notion.databases.retrieve({ database_id: childDbId });
  console.log('Columns:', Object.entries(db.properties).map(([n, p]: any) => `${n}(${p.type})`).join(', '));

  const read = (p: any): string => {
    if (!p) return '';
    if (p.type === 'title') return p.title.map((t: any) => t.plain_text).join('');
    if (p.type === 'rich_text') return p.rich_text.map((t: any) => t.plain_text).join('');
    if (p.type === 'checkbox') return p.checkbox ? '✓' : '✗';
    return `[${p.type}]`;
  };

  const res = await notion.databases.query({ database_id: childDbId, page_size: 100 });
  for (const pg of res.results) {
    if (!isFullPage(pg)) continue;
    const parts = Object.entries(pg.properties).map(([n, p]) => `${n}=${JSON.stringify(read(p))}`);
    console.log(parts.join('  |  '));
  }
}
main();
