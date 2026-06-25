import type { GetStaticProps } from 'next';
import { TaxonomyIndexPage } from '../../components/TaxonomyPages';
import { getCategories, getLayoutProps, type Taxonomy } from '../../lib/notion';
import blogConfig from '../../blog.config';
import type { MenuItem, Post, SiteConfig } from '../../lib/types';

interface Props { categories: Taxonomy[]; menus: MenuItem[]; notices: Post[]; site: SiteConfig }

export default function CategoryIndex({ categories, ...rest }: Props) {
  return <TaxonomyIndexPage title="文章分类" items={categories} base="/category" {...rest} />;
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  const [categories, layout] = await Promise.all([getCategories(), getLayoutProps()]);
  return { props: { categories, ...layout }, revalidate: blogConfig.revalidate };
};
