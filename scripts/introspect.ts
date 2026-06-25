// Prints your Notion database's property names + types so you can fill in
// blog.config.js correctly. Run with: npm run notion:schema
import { config } from 'dotenv';
// Next.js reads .env.local automatically, but this standalone script doesn't —
// load it explicitly (falling back to .env).
config({ path: '.env.local' });
config();
import { Client, isFullPage } from '@notionhq/client';

const token = process.env.NOTION_TOKEN;
const databaseId = process.env.NOTION_DATABASE_ID;

async function main() {
  if (!token || !databaseId) {
    console.error('Set NOTION_TOKEN and NOTION_DATABASE_ID in .env.local first.');
    process.exit(1);
  }

  const notion = new Client({ auth: token });

  const db = await notion.databases.retrieve({ database_id: databaseId });
  const title =
    'title' in db && Array.isArray(db.title)
      ? db.title.map((t: any) => t.plain_text).join('')
      : '(untitled)';

  console.log(`\nDatabase: ${title}\n`);
  console.log('Properties:');
  for (const [name, prop] of Object.entries((db as any).properties)) {
    console.log(`  • ${name}  ->  ${(prop as any).type}`);
  }

  // Show one sample page so you can eyeball values.
  const sample = await notion.databases.query({ database_id: databaseId, page_size: 1 });
  const first = sample.results[0];
  if (first && isFullPage(first)) {
    console.log('\nSample page property values:');
    for (const [name, prop] of Object.entries(first.properties)) {
      console.log(`  • ${name}: ${JSON.stringify(prop)}`);
    }
  }
  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
