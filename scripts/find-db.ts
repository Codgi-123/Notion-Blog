// Agent-run: after the human duplicated the template AND connected the
// integration, auto-locate the blog database and write NOTION_DATABASE_ID into
// .env.local — no manual id copy. Run: npm run notion:find
import { config } from 'dotenv';
config({ path: '.env.local' });
config();
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';

async function main() {
  const { notion } = await import('../lib/notion');
  const blogConfig = (await import('../blog.config')).default as any;
  const P = blogConfig.properties;
  if (!process.env.NOTION_TOKEN) throw new Error('Set NOTION_TOKEN in .env.local first.');

  // Every database the integration can see.
  const found: { id: string; title: string }[] = [];
  let cursor: string | undefined;
  do {
    const res: any = await notion.search({
      filter: { value: 'database', property: 'object' },
      start_cursor: cursor,
      page_size: 100,
    });
    for (const db of res.results) {
      // The blog DB is the one carrying the type+status columns; this skips the
      // CONFIG-TABLE child db (配置名/配置值/启用) that search also returns.
      if (db.properties?.[P.type] && db.properties?.[P.status]) {
        const title = (db.title ?? []).map((t: any) => t.plain_text).join('') || '(untitled)';
        found.push({ id: db.id, title });
      }
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  if (found.length === 0) {
    throw new Error(
      'No matching database found. Did the human connect the integration to the duplicated page? (Share → + Add connections)',
    );
  }
  if (found.length > 1) {
    console.log('⚠️ Multiple candidate databases — using the first. All matches:');
    found.forEach((f, i) => console.log(`  [${i}] ${f.title}  ${f.id}`));
  }
  const dbId = found[0].id;
  console.log(`✓ blog database: "${found[0].title}"  ${dbId}`);

  const envPath = '.env.local';
  const line = `NOTION_DATABASE_ID=${dbId}`;
  if (existsSync(envPath) && /^NOTION_DATABASE_ID=/m.test(readFileSync(envPath, 'utf8'))) {
    writeFileSync(envPath, readFileSync(envPath, 'utf8').replace(/^NOTION_DATABASE_ID=.*$/m, line));
  } else {
    appendFileSync(envPath, `\n${line}\n`);
  }
  console.log('✅ NOTION_DATABASE_ID written to .env.local');
}
main().catch((e) => {
  console.error(e.body || e.message || e);
  process.exit(1);
});
