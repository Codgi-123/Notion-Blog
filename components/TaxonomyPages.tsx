import { Layout } from './Layout';
import { PostCard } from './PostCard';
import { BackLink } from './BackLink';
import { TaxonomyCloud } from './TaxonomyCloud';
import type { Taxonomy } from '../lib/notion';
import type { MenuItem, Post, SiteConfig } from '../lib/types';

interface LayoutProps {
  menus: MenuItem[];
  notices: Post[];
  site: SiteConfig;
}

export function TaxonomyListPage({
  kind, prefix = '', backHref, backLabel, name, posts, menus, notices, site,
}: LayoutProps & { kind: string; prefix?: string; backHref: string; backLabel: string; name: string; posts: Post[] }) {
  return (
    <Layout title={`${kind}：${name}`} menus={menus} notices={notices} site={site}>
      <div className="page-head">
        <BackLink href={backHref} label={backLabel} />
        <h1 className="post-title">
          {kind}：{prefix}{name} <span className="taxonomy-count">{posts.length}</span>
        </h1>
      </div>
      <div className="post-grid">
        {posts.map((post, i) => (
          <PostCard key={post.id} post={post} delay={0.05 * i} />
        ))}
      </div>
    </Layout>
  );
}

export function TaxonomyIndexPage({
  title, items, base, prefix, menus, notices, site,
}: LayoutProps & { title: string; items: Taxonomy[]; base: string; prefix?: string }) {
  return (
    <Layout title={title} menus={menus} notices={notices} site={site}>
      <div className="page-head">
        <h1 className="post-title">{title}</h1>
      </div>
      <TaxonomyCloud items={items} base={base} prefix={prefix} />
    </Layout>
  );
}
