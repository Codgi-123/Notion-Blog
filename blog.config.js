// Central blog configuration. Edit these to match your Notion database.
//
// PROPERTY MAPPING
// The official Notion API returns properties by *name*. Map your database's
// property names here so the data layer doesn't hardcode them. The values on
// the right must exactly match the property names in your Notion database
// (run `npm run notion:schema` to print them).
module.exports = {
  title: 'Codgi Blog',
  description: 'A blog powered by Notion + Next.js',
  author: 'Codgi',
  // Site language (BCP-47). Overridable via the Notion Config row (LANG).
  lang: 'zh-CN',
  // Your site's canonical URL (used for SEO / RSS later).
  link: 'https://example.com',
  // Posts per page on the index.
  postsPerPage: 10,
  // ISR revalidation window in seconds.
  revalidate: 60,

  // URL prefix for articles (notion-next uses /article/[slug]).
  articlePrefix: 'article',

  // Map logical fields -> your Notion property names.
  properties: {
    title: 'title',       // title property (type: title)
    slug: 'slug',         // text property used in the URL; falls back to page id
    status: 'status',     // select property; only published statuses are shown
    summary: 'summary',   // text property for excerpt
    tags: 'tags',         // multi_select
    category: 'category', // select
    date: 'date',         // date property for publish date
    type: 'type',         // select: Post / Page / Menu / SubMenu / Notice / Config
    icon: 'icon',         // text: FontAwesome class for Menu/Page items
    // OPTIONAL: add a Number column to your DB and put its name here to control
    // menu ordering deterministically (official API can't read drag-sort order).
    order: '',            // e.g. 'order'  (empty = feature off)
  },

  // Only rows whose `status` equals one of these are published/visible.
  publishedStatuses: ['Published', 'Public', '已发布'],

  // The Config row (type=Config) embeds a child database (notion-next's
  // CONFIG-TABLE) of key/value overrides. These are its column names; only rows
  // whose `enable` checkbox is checked take effect, and they override the
  // defaults above. Set to null to disable Notion-driven config entirely.
  configTable: {
    key: '配置名',   // title column holding the config name
    value: '配置值', // rich_text column holding the value
    enable: '启用',  // checkbox column; only checked rows apply
  },

  // notion-next `type` semantics:
  //   Post    -> blog article, routed at /article/[slug]
  //   Page    -> standalone page, routed at /[slug]
  //   Menu    -> top-level nav item (slug = target; may be external)
  //   SubMenu -> dropdown child of the Menu directly above it
  //   Notice  -> site-wide announcement
  //   Config  -> reserved for Notion-driven site config (not yet wired up)
  types: {
    post: 'Post',
    page: 'Page',
    menu: 'Menu',
    subMenu: 'SubMenu',
    notice: 'Notice',
    config: 'Config',
    friends: 'Friends', // home "友情链接" section
    about: 'About',     // home "关于我" section
  },

  // Home-page special sections. Each is a single Notion row whose *body* is
  // rendered into a section on the home page. Rows are matched by `type` first;
  // if a row has no `type` yet, it's matched by a title keyword (so it works
  // before you fill in the type). Body content comes from the row's page body.
  homeSections: {
    notice: { type: 'Notice', titles: ['公告', 'Notice', '通知'] },
    about: { type: 'About', titles: ['关于我', '关于', 'About'] },
    friends: { type: 'Friends', titles: ['友情链接', '友链', 'Friends', 'Links'] },
  },
};
