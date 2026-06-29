import type { GetServerSideProps } from 'next';
import blogConfig from '../blog.config';
import { getPosts, getPages, getCategories, getTags, getSiteConfig } from '../lib/notion';

// ponytail: getServerSideProps emits the XML; the component never renders.
export default function Sitemap() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const [posts, pages, categories, tags, site] = await Promise.all([
    getPosts(),
    getPages(),
    getCategories(),
    getTags(),
    getSiteConfig(),
  ]);

  const base = site.link.replace(/\/$/, '');
  const url = (path: string, lastmod?: string | null) =>
    `<url><loc>${base}${path}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`;
  const enc = (s: string) => `/${encodeURIComponent(s)}`;

  const urls = [
    url('/'),
    url('/category'),
    url('/tag'),
    ...posts.map((p) => url(`/${blogConfig.articlePrefix}/${p.slug}`, p.date)),
    ...pages.map((p) => url(`/${p.slug}`)),
    ...categories.map((c) => url(`/category${enc(c.name)}`)),
    ...tags.map((t) => url(`/tag${enc(t.name)}`)),
  ];

  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', `public, s-maxage=${blogConfig.revalidate}, stale-while-revalidate`);
  res.write(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`);
  res.end();

  return { props: {} };
};
