import React, { useMemo, useState } from 'react';
import type { GetStaticProps } from 'next';
import Link from 'next/link';
import { Layout } from '../components/Layout';
import { PostCard, formatMonthDay } from '../components/PostCard';
import { NotionBlocks } from '../components/NotionBlock';
import { getPosts, getLayoutProps, getHomeSections, type HomeSections } from '../lib/notion';
import { enrichBlocks } from '../lib/notion-render';
import blogConfig from '../blog.config';
import type { Post, MenuItem, SiteConfig } from '../lib/types';

interface HomeProps {
  posts: Post[];
  menus: MenuItem[];
  notices: Post[];
  site: SiteConfig;
  sections: HomeSections;
}

const ALL = '全部';
const TOP_TAGS = 7;

export default function Home({ posts, menus, notices, site, sections }: HomeProps) {
  const [activeTag, setActiveTag] = useState(ALL);
  const [showAllTags, setShowAllTags] = useState(false);

  // First (most recent) post is featured; the rest fill the grid.
  const featured = posts[0];
  const rest = posts.slice(1);

  // Tags ranked by how many posts use them, so the most useful filters surface
  // first instead of dumping every tag into the bar.
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    rest.forEach((p) => p.tags.forEach((t) => m.set(t, (m.get(t) || 0) + 1)));
    return m;
  }, [rest]);
  const sortedTags = useMemo(
    () =>
      Array.from(tagCounts.keys()).sort(
        // Tiebreak by raw code point (not localeCompare) so the order is
        // identical on server and client — locale-aware sorting differs
        // between Node and the browser and causes hydration mismatches.
        (a, b) => (tagCounts.get(b)! - tagCounts.get(a)!) || (a < b ? -1 : a > b ? 1 : 0),
      ),
    [tagCounts],
  );

  // Show the top N; the currently-selected tag is always kept visible even if
  // it's outside the top N and the list is collapsed.
  const shownTags = useMemo(() => {
    if (showAllTags) return sortedTags;
    const top = sortedTags.slice(0, TOP_TAGS);
    if (activeTag !== ALL && !top.includes(activeTag)) top.push(activeTag);
    return top;
  }, [sortedTags, showAllTags, activeTag]);
  const hiddenCount = sortedTags.length - shownTags.length;

  const filtered = useMemo(
    () => (activeTag === ALL ? rest : rest.filter((p) => p.tags.includes(activeTag))),
    [rest, activeTag],
  );

  return (
    <Layout menus={menus} notices={notices} site={site} searchPosts={posts}>
      {/* Hero */}
      <header className="hero">
        <h1 className="hero-line" data-split>{site?.hero.line1 ?? blogConfig.hero.line1}</h1>
        <h1 className="hero-line hero-italic" data-split>{site?.hero.line2 ?? blogConfig.hero.line2}</h1>
        <div className="hero-meta">
          <p className="hero-desc">
            {site?.bio || site?.description || blogConfig.description}
          </p>
          <span className="hero-est">
            EST. {blogConfig.since} · {posts.length} POSTS
          </span>
        </div>
        <div className="hero-rule" />
      </header>

      {posts.length === 0 && <p className="empty">还没有已发布的文章。</p>}

      {/* Featured */}
      {featured && (
        <section className="featured-wrap">
          <Link
            href={`/${blogConfig.articlePrefix}/${featured.slug}`}
            className="featured-card"
            data-tilt
          >
            <div className="featured-orb" data-parallax="0.12" />
            <div className="featured-label">
              <span className="featured-dot" />
              <span>New</span>
            </div>
            <div className="featured-title">{featured.title}</div>
            {featured.summary && <div className="featured-desc">{featured.summary}</div>}
            <div className="featured-foot">
              <span className="featured-meta">{formatMonthDay(featured.date)}</span>
              {featured.category && (
                <>
                  <span className="dot-sep">·</span>
                  <span className="featured-meta">{featured.category}</span>
                </>
              )}
              <span className="featured-read">
                阅读 <span className="arrow">→</span>
              </span>
            </div>
          </Link>
        </section>
      )}

      {/* Filter */}
      {rest.length > 0 && (
        <section className="filter-bar">
          <span className="filter-label">Recent</span>
          <div className="filter-tags">
            <button
              type="button"
              className={`filter-tag${activeTag === ALL ? ' is-active' : ''}`}
              onClick={() => setActiveTag(ALL)}
            >
              {ALL}
            </button>
            {shownTags.map((t) => (
              <button
                key={t}
                type="button"
                className={`filter-tag${t === activeTag ? ' is-active' : ''}`}
                onClick={() => setActiveTag(t)}
              >
                {t}
                <span className="filter-tag-count">{tagCounts.get(t)}</span>
              </button>
            ))}
            {!showAllTags && hiddenCount > 0 && (
              <button
                type="button"
                className="filter-tag filter-tag-more"
                onClick={() => setShowAllTags(true)}
              >
                +{hiddenCount} 更多
              </button>
            )}
            {showAllTags && sortedTags.length > TOP_TAGS && (
              <button
                type="button"
                className="filter-tag filter-tag-more"
                onClick={() => setShowAllTags(false)}
              >
                收起
              </button>
            )}
          </div>
        </section>
      )}

      {/* Grid */}
      <section className="post-grid">
        {filtered.map((post, i) => (
          <PostCard key={post.id} post={post} delay={0.05 * i} />
        ))}
      </section>

      {/* Special sections sourced from Notion rows */}
      <HomeSectionBlock label="公告" section={sections.notice} variant="notice" />
      <HomeSectionBlock label="关于我" section={sections.about} variant="about" />
      <HomeSectionBlock label="友情链接" section={sections.friends} variant="friends" />
    </Layout>
  );
}

// One home section rendered from a Notion row's body. Renders nothing if the
// matching row is missing or empty.
function HomeSectionBlock({
  label,
  section,
  variant,
}: {
  label: string;
  section: HomeSections[keyof HomeSections];
  variant: string;
}) {
  if (!section.meta || section.blocks.length === 0) return null;
  return (
    <section className={`home-section home-section-${variant} reveal`}>
      <span className="home-section-label">{label}</span>
      <h2 className="home-section-title">{section.meta.title}</h2>
      <div className="home-section-body notion-content">
        <NotionBlocks blocks={section.blocks} />
      </div>
    </section>
  );
}

export const getStaticProps: GetStaticProps<HomeProps> = async () => {
  const [posts, layout, sections] = await Promise.all([
    getPosts(),
    getLayoutProps(),
    getHomeSections(),
  ]);
  // Enrich section bodies (code highlight / KaTeX) the same way articles are.
  for (const key of Object.keys(sections) as (keyof HomeSections)[]) {
    sections[key].blocks = enrichBlocks(sections[key].blocks);
  }
  return {
    props: { posts, ...layout, sections },
    revalidate: blogConfig.revalidate,
  };
};
