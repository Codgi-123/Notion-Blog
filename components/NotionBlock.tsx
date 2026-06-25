import React, { createContext, useContext } from 'react';
import Image from 'next/image';
import type { BlockWithChildren } from '../lib/types';
import { buildToc, type Toc } from '../lib/toc';
import { RichText } from './RichText';

// ---------------------------------------------------------------------------
// Heading anchors + table of contents.
//
// A `table_of_contents` block needs every heading on the page, but blocks render
// one at a time. So the *top-level* <NotionBlocks> walks the whole tree once
// (via lib/toc.buildToc), assigns each heading a stable anchor id, and shares
// the result via context; headings read their id from it, the TOC block reads
// the full list. The sidebar (components/ArticleToc) reuses the same builder.
// ---------------------------------------------------------------------------
const TocContext = createContext<Toc>({ items: [], anchorOf: new Map() });
// True inside any nested <NotionBlocks>, so only the outermost builds the TOC.
const NestedContext = createContext(false);

// Render a list of blocks. List items are grouped into <ul>/<ol> wrappers.
//
// `reveal` (passed only for the top-level article body) wraps each top-level
// block in a .reveal-block box so the re-arming scroll observer in lib/fx eases
// it in every time it (re-)enters the viewport — a progressive, non-linear
// "push-in" as you read down the page. Nested blocks are never wrapped, so they
// don't double-animate inside a revealing parent.
export function NotionBlocks({
  blocks,
  reveal = false,
}: {
  blocks: BlockWithChildren[];
  reveal?: boolean;
}) {
  const out: React.ReactNode[] = [];
  let i = 0;

  const wrap = (key: string, node: React.ReactElement) =>
    reveal ? (
      <div className="reveal-block" key={key}>
        {node}
      </div>
    ) : (
      React.cloneElement(node, { key })
    );

  while (i < blocks.length) {
    const block = blocks[i];

    if (block.type === 'bulleted_list_item' || block.type === 'numbered_list_item') {
      const ordered = block.type === 'numbered_list_item';
      const items: BlockWithChildren[] = [];
      while (i < blocks.length && blocks[i].type === block.type) {
        items.push(blocks[i]);
        i++;
      }
      const Tag = ordered ? 'ol' : 'ul';
      out.push(
        wrap(
          items[0].id,
          <Tag>
            {items.map((it) => (
              <li key={it.id}>
                <NotionBlock block={it} />
              </li>
            ))}
          </Tag>,
        ),
      );
      continue;
    }

    out.push(wrap(block.id, <NotionBlock block={block} />));
    i++;
  }

  return <BlocksOutput nodes={out} blocks={blocks} />;
}

// Splits hook usage out of the imperative loop above. The outermost instance
// builds the TOC and provides both contexts; nested instances just pass through.
function BlocksOutput({
  nodes,
  blocks,
}: {
  nodes: React.ReactNode[];
  blocks: BlockWithChildren[];
}) {
  const nested = useContext(NestedContext);
  if (nested) return <>{nodes}</>;
  const toc = buildToc(blocks);
  return (
    <TocContext.Provider value={toc}>
      <NestedContext.Provider value={true}>{nodes}</NestedContext.Provider>
    </TocContext.Provider>
  );
}

function Children({ block }: { block: BlockWithChildren }) {
  if (!block.children?.length) return null;
  return <NotionBlocks blocks={block.children} />;
}

// Render a single block by type.
export function NotionBlock({ block }: { block: BlockWithChildren }) {
  const { items, anchorOf } = useContext(TocContext);
  const anchor = anchorOf.get(block.id);

  switch (block.type) {
    case 'paragraph':
      return (
        <p>
          <RichText rich={block.paragraph.rich_text} />
          <Children block={block} />
        </p>
      );

    case 'heading_1':
      return (
        <h2 id={anchor}>
          <RichText rich={block.heading_1.rich_text} />
        </h2>
      );
    case 'heading_2':
      return (
        <h3 id={anchor}>
          <RichText rich={block.heading_2.rich_text} />
        </h3>
      );
    case 'heading_3':
      return (
        <h4 id={anchor}>
          <RichText rich={block.heading_3.rich_text} />
        </h4>
      );

    case 'bulleted_list_item':
      return (
        <>
          <RichText rich={block.bulleted_list_item.rich_text} />
          <Children block={block} />
        </>
      );
    case 'numbered_list_item':
      return (
        <>
          <RichText rich={block.numbered_list_item.rich_text} />
          <Children block={block} />
        </>
      );

    case 'to_do':
      return (
        <div className="todo">
          <input type="checkbox" checked={block.to_do.checked} readOnly />
          <span>
            <RichText rich={block.to_do.rich_text} />
          </span>
        </div>
      );

    case 'toggle':
      return (
        <details>
          <summary>
            <RichText rich={block.toggle.rich_text} />
          </summary>
          <Children block={block} />
        </details>
      );

    case 'quote':
      return (
        <blockquote>
          <RichText rich={block.quote.rich_text} />
          <Children block={block} />
        </blockquote>
      );

    case 'callout':
      return (
        <div className="callout">
          {block.callout.icon?.type === 'emoji' && (
            <span className="callout-icon">{block.callout.icon.emoji}</span>
          )}
          <div>
            <RichText rich={block.callout.rich_text} />
            <Children block={block} />
          </div>
        </div>
      );

    case 'code': {
      const caption = block.code.caption?.map((c) => c.plain_text).join('');
      const raw = block.code.rich_text.map((t) => t.plain_text).join('');
      return (
        <figure className="code-block">
          <pre className={`hljs language-${block.code.language}`}>
            {/* __codeHtml is highlight.js output rendered at build time. */}
            {block.__codeHtml ? (
              <code dangerouslySetInnerHTML={{ __html: block.__codeHtml }} />
            ) : (
              <code>{raw}</code>
            )}
          </pre>
          {caption && <figcaption>{caption}</figcaption>}
        </figure>
      );
    }

    case 'divider':
      return <hr />;

    case 'image': {
      // External URLs are stable; Notion `file` URLs are signed + expire, so we
      // route those through /api/notion-image/[id], which re-signs per request.
      const src =
        block.image.type === 'external'
          ? block.image.external.url
          : `/api/notion-image/${block.id}`;
      const caption = block.image.caption?.map((c) => c.plain_text).join('');
      return (
        <figure className="block-image">
          {/* unoptimized: the proxy 307-redirects to a signed S3 URL, which the
              Next optimizer can't cache reliably. */}
          <Image src={src} alt={caption || ''} width={1200} height={800} unoptimized />
          {caption && <figcaption>{caption}</figcaption>}
        </figure>
      );
    }

    case 'video': {
      const v = block.video;
      if (v.type === 'external') {
        const embed = toEmbedUrl(v.external.url);
        return embed ? (
          <div className="video-embed">
            <iframe src={embed} title="video" loading="lazy" allowFullScreen />
          </div>
        ) : (
          <video className="block-video" src={v.external.url} controls />
        );
      }
      return <video className="block-video" src={`/api/notion-image/${block.id}`} controls />;
    }

    case 'audio': {
      const src =
        block.audio.type === 'external'
          ? block.audio.external.url
          : `/api/notion-image/${block.id}`;
      return <audio className="block-audio" src={src} controls />;
    }

    case 'file': {
      const f = block.file;
      const src = f.type === 'external' ? f.external.url : `/api/notion-image/${block.id}`;
      const name = f.name || f.caption?.map((c) => c.plain_text).join('') || 'Download';
      return (
        <a className="file-block" href={src} target="_blank" rel="noreferrer">
          <span aria-hidden="true">📎</span> {name}
        </a>
      );
    }

    case 'pdf': {
      const src =
        block.pdf.type === 'external' ? block.pdf.external.url : `/api/notion-image/${block.id}`;
      return (
        <div className="pdf-block">
          <iframe src={src} title="PDF" loading="lazy" />
        </div>
      );
    }

    case 'table_of_contents':
      if (!items.length) return null;
      return (
        <nav className="toc" aria-label="Table of contents">
          <ul>
            {items.map((it) => (
              <li key={it.blockId} className={`toc-l${it.level}`}>
                <a href={`#${it.id}`}>{it.text}</a>
              </li>
            ))}
          </ul>
        </nav>
      );

    // A synced block is just a container — render its mirrored children inline.
    case 'synced_block':
      return <Children block={block} />;

    case 'child_page':
      return <p className="child-page">📄 {block.child_page.title}</p>;

    case 'bookmark':
      return (
        <a className="bookmark" href={block.bookmark.url} target="_blank" rel="noreferrer">
          {block.bookmark.url}
        </a>
      );

    case 'embed':
      return (
        <a className="bookmark" href={block.embed.url} target="_blank" rel="noreferrer">
          {block.embed.url}
        </a>
      );

    case 'link_preview':
      return (
        <a className="bookmark" href={block.link_preview.url} target="_blank" rel="noreferrer">
          {block.link_preview.url}
        </a>
      );

    case 'equation':
      // __eqHtml is KaTeX (display mode) rendered at build time.
      return block.__eqHtml ? (
        <div className="equation" dangerouslySetInnerHTML={{ __html: block.__eqHtml }} />
      ) : (
        <pre className="equation">{block.equation.expression}</pre>
      );

    case 'column_list':
      return (
        <div className="columns">
          <Children block={block} />
        </div>
      );
    case 'column':
      return (
        <div className="column">
          <Children block={block} />
        </div>
      );

    case 'table':
      return (
        <table className="notion-table">
          <tbody>
            <Children block={block} />
          </tbody>
        </table>
      );
    case 'table_row':
      return (
        <tr>
          {block.table_row.cells.map((cell, idx) => (
            <td key={idx}>
              <RichText rich={cell} />
            </td>
          ))}
        </tr>
      );

    default:
      // Unsupported block — render nothing rather than crash.
      if (process.env.NODE_ENV !== 'production') {
        return <div className="unsupported">[unsupported block: {block.type}]</div>;
      }
      return null;
  }
}

// Turn a YouTube/Vimeo watch URL into its embeddable form (so a Notion video
// block that points at one renders an inline player). Returns null otherwise,
// and the caller falls back to a <video> element.
function toEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const id = u.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (host === 'vimeo.com') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
    return null;
  } catch {
    return null;
  }
}
