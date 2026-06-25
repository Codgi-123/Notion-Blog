import type { GetStaticPaths, GetStaticProps } from 'next';
import { TaxonomyListPage } from '../../components/TaxonomyPages';
import { getCategories, getPostsByCategory, getLayoutProps } from '../../lib/notion';
import blogConfig from '../../blog.config';
import type { MenuItem, Post, SiteConfig } from '../../lib/types';

interface Props { name: string; posts: Post[]; menus: MenuItem[]; notices: Post[]; site: SiteConfig }

export default function CategoryPage(props: Props) {
  return <TaxonomyListPage {...props} kind="分类" backHref="/category" backLabel="所有分类" />;
}

export const getStaticPaths: GetStaticPaths = async () => {
  const categories = await getCategories();
  return { paths: categories.map((c) => ({ params: { name: c.name } })), fallback: 'blocking' };
};

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  const name = params?.name as string;
  const [posts, layout] = await Promise.all([getPostsByCategory(name), getLayoutProps()]);
  if (posts.length === 0) return { notFound: true, revalidate: blogConfig.revalidate };
  return { props: { name, posts, ...layout }, revalidate: blogConfig.revalidate };
};
