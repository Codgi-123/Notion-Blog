// Read-only: lists the live CONFIG-TABLE rows and flags any key outside the
// 8 the code actually reads. Run with: npx tsx scripts/check-config.ts
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

const USED = ['TITLE', 'DESCRIPTION', 'AUTHOR', 'LINK', 'KEYWORDS', 'BLOG_FAVICON', 'BIO', 'GLOBAL_CSS'];

async function main() {
  // Dynamic import so lib/notion reads env AFTER dotenv loads (ESM hoists static imports).
  const { getNotionConfigMap } = await import('../lib/notion');
  const map = await getNotionConfigMap();
  const keys = Object.keys(map);
  const extra = keys.filter((k) => !USED.includes(k));
  console.log(`\nEnabled config rows (${keys.length}):`);
  for (const k of keys) console.log(`  ${USED.includes(k) ? '✓' : '✗ UNUSED'}  ${k}`);
  console.log(extra.length ? `\n仍有未使用的 key: ${extra.join(', ')}` : '\n✅ 全部都是代码用到的 key，干净。');
}
main();
