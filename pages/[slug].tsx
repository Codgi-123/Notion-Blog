import type { GetStaticPaths, GetStaticProps } from 'next';
import { Layout } from '../components/Layout';
import { NotionBlocks } from '../components/NotionBlock';
import { getPages, getPageBySlug, getBlocks, getLayoutProps } from '../lib/notion';
import { enrichBlocks } from '../lib/notion-render';
import blogConfig from '../blog.config';
import type { Post, MenuItem, SiteConfig, BlockWithChildren } from '../lib/types';

interface PageProps {
  page: Post;
  blocks: BlockWithChildren[];
  menus: MenuItem[];
  notices: Post[];
  site: SiteConfig;
}

export default function StandalonePage({ page, blocks, menus, notices, site }: PageProps) {
  return (
    <Layout title={page.title} description={page.summary} menus={menus} notices={notices} site={site}>
      <article className="article">
        <h1 className="post-title">{page.title}</h1>
        <div className="notion-content">
          <NotionBlocks blocks={blocks} />
        </div>
      </article>
    </Layout>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  const pages = await getPages();
  return {
    paths: pages.map((p) => ({ params: { slug: p.slug } })),
    fallback: 'blocking',
  };
};

export const getStaticProps: GetStaticProps<PageProps> = async ({ params }) => {
  const slug = params?.slug as string;
  const page = await getPageBySlug(slug);

  if (!page) {
    return { notFound: true, revalidate: blogConfig.revalidate };
  }

  const [blocks, layout] = await Promise.all([getBlocks(page.id), getLayoutProps()]);

  return {
    props: { page, blocks: enrichBlocks(blocks), ...layout },
    revalidate: blogConfig.revalidate,
  };
};
