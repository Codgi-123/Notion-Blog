import type { GetStaticProps } from 'next';
import { Layout } from '../components/Layout';
import { PostCard } from '../components/PostCard';
import { getPosts, getLayoutProps } from '../lib/notion';
import blogConfig from '../blog.config';
import type { MenuItem, Post, SiteConfig } from '../lib/types';

interface Props {
  posts: Post[];
  menus: MenuItem[];
  notices: Post[];
  site: SiteConfig;
}

export default function Archive({ posts, menus, notices, site }: Props) {
  return (
    <Layout title="历史归档" menus={menus} notices={notices} site={site} searchPosts={posts}>
      <div className="page-head">
        <h1 className="post-title">
          历史归档 <span className="taxonomy-count">{posts.length}</span>
        </h1>
      </div>
      {posts.length === 0 && <p className="empty">还没有已发布的文章。</p>}
      <div className="post-grid">
        {posts.map((post) => <PostCard key={post.id} post={post} />)}
      </div>
    </Layout>
  );
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  // getPosts returns every published article, newest first (no home-page limit).
  const [posts, layout] = await Promise.all([getPosts(), getLayoutProps()]);
  return { props: { posts, ...layout }, revalidate: blogConfig.revalidate };
};
