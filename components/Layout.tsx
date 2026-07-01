import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import blogConfig from '../blog.config';
import { useTheme } from '../lib/useTheme';
import { SearchOverlay } from './SearchOverlay';
import { BackToTop } from './BackToTop';
import type { MenuItem, Post, SiteConfig } from '../lib/types';

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  menus?: MenuItem[];
  notices?: Post[];
  site?: SiteConfig;
  // Posts made searchable via the Cmd/Ctrl+K palette (home page passes these).
  searchPosts?: Post[];
}

function NavLink({ item }: { item: MenuItem }) {
  const external = /^https?:\/\//.test(item.href);
  if (item.children.length > 0) {
    return (
      <div className="nav-item nav-dropdown">
        <span className="nav-link">
          {item.icon && <i className={item.icon} />}
          {item.title}
        </span>
        <div className="nav-dropdown-menu">
          {item.children.map((c) => (
            <NavLink key={c.id} item={c} />
          ))}
        </div>
      </div>
    );
  }
  return (
    <Link
      href={item.href}
      className="nav-link"
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
    >
      {item.icon && <i className={item.icon} />}
      {item.title}
    </Link>
  );
}

export function Layout({
  children,
  title,
  description,
  menus = [],
  notices = [],
  site,
  searchPosts = [],
}: LayoutProps) {
  const siteTitle = site?.title ?? blogConfig.title;
  const siteDesc = site?.description ?? blogConfig.description;
  const author = site?.author ?? blogConfig.author;

  const pageTitle = title ? `${title} · ${siteTitle}` : siteTitle;
  const desc = description ?? siteDesc;

  // "Kiwi." style wordmark: first word of the site title with a trailing dot.
  const brand = siteTitle.split(/\s+/)[0] || siteTitle;

  const { dark, toggle } = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((s) => !s);
      }
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Condense the fixed nav once the page is scrolled; hover (handled in CSS)
  // expands it back. Hysteresis (100 / 50) avoids flicker around the threshold.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    let condensed = false;
    const onScroll = () => {
      const y = window.scrollY;
      if (!condensed && y > 100) {
        condensed = true;
        nav.classList.add('is-condensed');
      } else if (condensed && y < 50) {
        condensed = false;
        nav.classList.remove('is-condensed');
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={desc} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={desc} />
        {site?.keywords && <meta name="keywords" content={site.keywords} />}
        {site?.favicon && <link rel="icon" href={site.favicon} />}
        {site?.globalCss && <style dangerouslySetInnerHTML={{ __html: site.globalCss }} />}
      </Head>

      <nav className="site-nav-bar" ref={navRef}>
        <Link href="/" className="brand" data-magnetic>
          <span data-scramble>{brand}</span>
          <span className="brand-dot">.</span>
        </Link>
        <div className="nav-right">
          <div className="nav-links">
            {menus.map((m) => (
              <NavLink key={m.id} item={m} />
            ))}
          </div>
          <button
            className="icon-btn"
            aria-label="搜索"
            onClick={() => setSearchOpen(true)}
            type="button"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
          <button
            className="icon-btn"
            aria-label="切换主题"
            onClick={toggle}
            type="button"
          >
            <span className="theme-icon" suppressHydrationWarning>
              {dark ? (
                // Sun (switch to light)
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                </svg>
              ) : (
                // Moon (switch to dark)
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
                </svg>
              )}
            </span>
          </button>
          {menus.length > 0 && (
            <button
              className="icon-btn nav-burger"
              aria-label="菜单"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((s) => !s)}
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {menuOpen ? (
                  <path d="M6 6l12 12M18 6L6 18" />
                ) : (
                  <path d="M3 6h18M3 12h18M3 18h18" />
                )}
              </svg>
            </button>
          )}
        </div>
      </nav>

      {menuOpen && menus.length > 0 && (
        <div className="mobile-menu" onClick={() => setMenuOpen(false)}>
          <div className="mobile-menu-inner" onClick={(e) => e.stopPropagation()}>
            {menus.map((m) =>
              m.children.length > 0 ? (
                <div key={m.id} className="mobile-menu-group">
                  <span className="mobile-menu-head">
                    {m.icon && <i className={m.icon} />} {m.title}
                  </span>
                  {m.children.map((c) => (
                    <Link
                      key={c.id}
                      href={c.href}
                      className="mobile-menu-link mobile-menu-sub"
                      onClick={() => setMenuOpen(false)}
                      {...(/^https?:\/\//.test(c.href) ? { target: '_blank', rel: 'noreferrer' } : {})}
                    >
                      {c.title}
                    </Link>
                  ))}
                </div>
              ) : (
                <Link
                  key={m.id}
                  href={m.href}
                  className="mobile-menu-link"
                  onClick={() => setMenuOpen(false)}
                  {...(/^https?:\/\//.test(m.href) ? { target: '_blank', rel: 'noreferrer' } : {})}
                >
                  {m.icon && <i className={m.icon} />} {m.title}
                </Link>
              ),
            )}
          </div>
        </div>
      )}

      {notices.length > 0 && (
        <div className="notice-bar">
          <div className="notice-inner">
            {notices.map((n) => (
              <span key={n.id} className="notice-item">
                <span className="notice-dot" aria-hidden="true" />
                {n.title}
                {n.summary ? `：${n.summary}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      <main>{children}</main>

      <footer className="site-footer">
        <span suppressHydrationWarning>© {new Date().getFullYear()} {author}</span>
        <div className="footer-links">
          <span className="footer-link footer-muted">Powered by Notion</span>
        </div>
      </footer>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} posts={searchPosts} />
      <BackToTop />
    </>
  );
}
