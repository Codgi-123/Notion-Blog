import type { NextApiRequest, NextApiResponse } from 'next';
import { isFullBlock } from '@notionhq/client';
import { notion } from '../../../lib/notion';

// Proxy for Notion-hosted (signed) file URLs.
//
// Notion's `file`-type assets are signed S3 links that expire after ~1 hour.
// If we baked those URLs into static HTML they'd 403 once a cached page outlives
// the signature. Instead we point <img> at this route keyed by the block id; on
// each request we ask Notion for the block again — which returns a freshly
// signed URL — and redirect to it. The redirect is cached for less than the
// signature lifetime so a repeat view always re-signs before expiry.
//
// Only used for `file`-type assets; `external` URLs are rendered directly.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id;
  if (typeof id !== 'string') {
    res.status(400).send('Bad request');
    return;
  }

  try {
    const block = await notion.blocks.retrieve({ block_id: id });
    if (!isFullBlock(block)) {
      res.status(404).send('Not found');
      return;
    }

    const url = fileUrl(block);
    if (!url) {
      res.status(404).send('No file on block');
      return;
    }

    // Re-sign well before the ~1h signature expiry; let CDNs hold the redirect.
    res.setHeader('Cache-Control', 'public, max-age=3000, s-maxage=3000, stale-while-revalidate=600');
    res.redirect(307, url);
  } catch {
    res.status(502).send('Upstream error');
  }
}

// Extract the underlying file URL from any media block type Notion supports.
function fileUrl(block: { type: string } & Record<string, unknown>): string | null {
  const media = (block as Record<string, { type?: string; file?: { url: string }; external?: { url: string } }>)[
    block.type
  ];
  if (!media) return null;
  if (media.type === 'file' && media.file) return media.file.url;
  if (media.type === 'external' && media.external) return media.external.url;
  return null;
}
