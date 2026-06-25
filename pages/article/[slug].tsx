import type { GetStaticPaths, GetStaticProps } from 'next';
import Link from 'next/link';
import { Layout } from '../../components/Layout';
import { NotionBlocks } from '../../components/NotionBlock';
import { ArticleToc } from '../../components/ArticleToc';
import { BackLink } from '../../components/BackLink';
import { ReadingProgress } from '../../components/ReadingProgress';
import { getPosts, getPostBySlug, getBlocks, getLayoutProps } from '../../lib/notion';
import { enrichBlocks } from '../../lib/notion-render';
import blogConfig from '../../blog.config';
import type { Post, MenuItem, SiteConfig, BlockWithChildren } from '../../lib/types';

interface NavPost {
  title: string;
  slug: string;
}

interface ArticleProps {
  post: Post;
  blocks: BlockWithChildren[];
  menus: MenuItem[];
  notices: Post[];
  site: SiteConfig;
  prev: NavPost | null;
  next: NavPost | null;
  readingMinutes: number;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  // Build the date from the ISO parts directly — toLocaleDateString is
  // timezone-dependent and causes SSR/client hydration mismatches.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return '';
  return `${m[1]}年${Number(m[2])}月${Number(m[3])}日`;
}

// Estimate reading time from the block text: CJK characters and Latin words are
// counted separately (~400 chars/min, ~200 words/min) since they read at very
// different paces.
function blocksToText(blocks: BlockWithChildren[]): string {
  let out = '';
  for (const b of blocks) {
    const data = (b as Record<string, unknown>)[(b as { type: string }).type] as
      | { rich_text?: { plain_text: string }[] }
      | undefined;
    if (data?.rich_text) out += data.rich_text.map((r) => r.plain_text).join('') + ' ';
    if (b.children?.length) out += blocksToText(b.children);
  }
  return out;
}
function readingMinutesOf(blocks: BlockWithChildren[]): number {
  const text = blocksToText(blocks);
  const cjk = (text.match(/[一-鿿㐀-䶿]/g) || []).length;
  const words = (
    text.replace(/[一-鿿㐀-䶿]/g, ' ').match(/[A-Za-z0-9]+/g) || []
  ).length;
  return Math.max(1, Math.round(cjk / 400 + words / 200));
}

export default function ArticlePage({
  post,
  blocks,
  menus,
  notices,
  site,
  prev,
  next,
  readingMinutes,
}: ArticleProps) {
  return (
    <Layout title={post.title} description={post.summary} menus={menus} notices={notices} site={site}>
      <ReadingProgress />
      <div className="article-shell">
        <aside className="article-toc-col">
          <ArticleToc blocks={blocks} />
        </aside>
        <article className="article">
          <BackLink href="/" label="返回首页" />
          <h1 className="post-title">{post.title}</h1>
        <div className="post-detail-meta">
          {post.date && <time>{formatDate(post.date)}</time>}
          {post.category && (
            <Link href={`/category/${encodeURIComponent(post.category)}`}>
              {post.category}
            </Link>
          )}
          <span className="reading-time">约 {readingMinutes} 分钟阅读</span>
        </div>
        {post.tags.length > 0 && (
          <div className="post-tags">
            {post.tags.map((t) => (
              <Link key={t} href={`/tag/${encodeURIComponent(t)}`} className="chip">
                {t}
              </Link>
            ))}
          </div>
        )}
          <div className="notion-content">
            <NotionBlocks blocks={blocks} reveal />
          </div>

          {(prev || next) && (
            <nav className="post-nav">
              {prev ? (
                <Link
                  href={`/${blogConfig.articlePrefix}/${prev.slug}`}
                  className="post-nav-item post-nav-prev"
                  data-tilt
                >
                  <span className="post-nav-dir">← 上一篇</span>
                  <span className="post-nav-title">{prev.title}</span>
                </Link>
              ) : (
                <span />
              )}
              {next ? (
                <Link
                  href={`/${blogConfig.articlePrefix}/${next.slug}`}
                  className="post-nav-item post-nav-next"
                  data-tilt
                >
                  <span className="post-nav-dir">下一篇 →</span>
                  <span className="post-nav-title">{next.title}</span>
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </article>
      </div>
    </Layout>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  const posts = await getPosts();
  return {
    paths: posts.map((p) => ({ params: { slug: p.slug } })),
    fallback: 'blocking',
  };
};

export const getStaticProps: GetStaticProps<ArticleProps> = async ({ params }) => {
  const slug = params?.slug as string;
  const post = await getPostBySlug(slug);

  if (!post) {
    return { notFound: true, revalidate: blogConfig.revalidate };
  }

  const [blocks, layout, posts] = await Promise.all([
    getBlocks(post.id),
    getLayoutProps(),
    getPosts(),
  ]);

  // Neighbours in date order (posts are sorted most-recent-first): prev = newer,
  // next = older.
  const idx = posts.findIndex((p) => p.slug === post.slug);
  const toNav = (p: Post | undefined): NavPost | null =>
    p ? { title: p.title, slug: p.slug } : null;
  const prev = idx > 0 ? toNav(posts[idx - 1]) : null;
  const next = idx >= 0 && idx < posts.length - 1 ? toNav(posts[idx + 1]) : null;

  return {
    props: {
      post,
      blocks: enrichBlocks(blocks),
      prev,
      next,
      readingMinutes: readingMinutesOf(blocks),
      ...layout,
    },
    revalidate: blogConfig.revalidate,
  };
};
