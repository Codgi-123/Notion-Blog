import type { GetStaticProps } from 'next';
import { TaxonomyIndexPage } from '../../components/TaxonomyPages';
import { getTags, getLayoutProps, type Taxonomy } from '../../lib/notion';
import blogConfig from '../../blog.config';
import type { MenuItem, Post, SiteConfig } from '../../lib/types';

interface Props { tags: Taxonomy[]; menus: MenuItem[]; notices: Post[]; site: SiteConfig }

export default function TagIndex({ tags, ...rest }: Props) {
  return <TaxonomyIndexPage title="文章标签" items={tags} base="/tag" prefix="#" {...rest} />;
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  const [tags, layout] = await Promise.all([getTags(), getLayoutProps()]);
  return { props: { tags, ...layout }, revalidate: blogConfig.revalidate };
};
