# notionblog

A from-scratch blog powered by the **official Notion API** + **Next.js (Pages Router)**, inspired by [notion-next](https://github.com/tangly1024/NotionNext). Unlike notion-next (which scrapes public pages via the unofficial `notion-client`), this project reads your database through the official `@notionhq/client` and renders Notion blocks with its own React renderer.

## Architecture

```
blog.config.js          Site config + Notion property-name mapping
lib/notion.ts           Official Notion API data layer (posts, blocks)
lib/types.ts            Normalized Post type + block helpers
components/
  NotionBlock.tsx       Block dispatcher (paragraph, headings, lists, code…)
  RichText.tsx          Rich-text annotations + colors + links
  Layout / PostCard     UI shell
pages/
  index.tsx             Post list (getStaticProps + ISR)
  [slug].tsx            Post detail (getStaticPaths + ISR)
scripts/introspect.ts   Print your DB schema to fill blog.config.js
```

## Setup

1. **Create a Notion integration** at <https://www.notion.so/my-integrations>, copy its secret.
2. **Share your database** with that integration: open the database → `•••` → *Connections* → add your integration.
3. Copy env and fill it in:
   ```bash
   cp .env.local.example .env.local
   # set NOTION_TOKEN; NOTION_DATABASE_ID is pre-filled for your space
   ```
4. Install + inspect your schema, then update `blog.config.js` property names to match:
   ```bash
   npm install
   npm run notion:schema
   ```
5. Run it:
   ```bash
   npm run dev
   ```

## Deploy (Vercel)

Push to a Git repo, import on Vercel, and set `NOTION_TOKEN` + `NOTION_DATABASE_ID` as environment variables. ISR (`revalidate` in `blog.config.js`) keeps content fresh without rebuilds.

## Property mapping

The official API returns properties **by name**, so `blog.config.js` → `properties` must match your column names exactly. Defaults assume: `Name` (title), `slug`, `status`, `summary`, `tags`, `category`, `date`, `type`. Run `npm run notion:schema` to see yours; missing columns degrade gracefully.
