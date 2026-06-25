import type { GetStaticPaths, GetStaticProps } from 'next';
import { TaxonomyListPage } from '../../components/TaxonomyPages';
import { getTags, getPostsByTag, getLayoutProps } from '../../lib/notion';
import blogConfig from '../../blog.config';
import type { MenuItem, Post, SiteConfig } from '../../lib/types';

interface Props { name: string; posts: Post[]; menus: MenuItem[]; notices: Post[]; site: SiteConfig }

export default function TagPage(props: Props) {
  return <TaxonomyListPage {...props} kind="标签" prefix="#" backHref="/tag" backLabel="所有标签" />;
}

export const getStaticPaths: GetStaticPaths = async () => {
  const tags = await getTags();
  return { paths: tags.map((t) => ({ params: { name: t.name } })), fallback: 'blocking' };
};

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  const name = params?.name as string;
  const [posts, layout] = await Promise.all([getPostsByTag(name), getLayoutProps()]);
  if (posts.length === 0) return { notFound: true, revalidate: blogConfig.revalidate };
  return { props: { name, posts, ...layout }, revalidate: blogConfig.revalidate };
};
