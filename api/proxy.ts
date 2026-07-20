// Simple proxy for JS/CSS assets to make them same-origin.
// This helps in environments with restrictive CSP or network blocking of CDNs.

import type { VercelRequest, VercelResponse } from '@vercel/node';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — CDN JS/CSS assets are far smaller

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const url = req.query.url;
    if (!url || Array.isArray(url)) {
      res.status(400).json({ error: 'Missing url' });
      return;
    }
    const allowedHosts = new Set(['unpkg.com', 'cdn.jsdelivr.net']);
    const allowedContentTypes = ['text/javascript', 'application/javascript', 'text/css'];
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      res.status(400).json({ error: 'Only HTTPS URLs are allowed' });
      return;
    }
    if (!allowedHosts.has(parsed.hostname)) {
      res.status(400).json({ error: 'Host not allowed' });
      return;
    }

    // SSRF guard: the host allowlist is enforced on the initial URL ONLY, so we
    // must not follow redirects (a 3xx could send us to an arbitrary host).
    // Also bound the request with a timeout so a slow/hung upstream can't pin
    // the function.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let upstream: Response;
    let buf: Buffer;
    try {
      upstream = await fetch(url, { redirect: 'manual', signal: controller.signal });
      if (upstream.status >= 300 && upstream.status < 400) {
        res.status(400).json({ error: 'Redirects are not allowed' });
        return;
      }
      if (!upstream.ok) {
        res.status(upstream.status).send(`Upstream error: ${upstream.status}`);
        return;
      }
      const declaredLen = Number(upstream.headers.get('content-length') || '0');
      if (declaredLen && declaredLen > MAX_BYTES) {
        res.status(413).json({ error: 'Upstream response too large' });
        return;
      }
      buf = Buffer.from(await upstream.arrayBuffer());
      if (buf.length > MAX_BYTES) {
        res.status(413).json({ error: 'Upstream response too large' });
        return;
      }
    } finally {
      clearTimeout(timeout);
    }

    const contentType = upstream.headers.get('content-type') || '';
    const baseType = contentType.split(';')[0].trim().toLowerCase();
    if (!allowedContentTypes.some((t) => baseType === t)) {
      res.status(400).json({ error: 'Content-Type not allowed' });
      return;
    }
    const etag = upstream.headers.get('etag');
    res.setHeader('Content-Type', contentType);
    if (etag) res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, immutable');
    res.status(200).send(buf);
  } catch (e) {
    // Log details server-side; return a generic message (no internal detail).
    console.error('proxy failure', e);
    const aborted = e instanceof Error && e.name === 'AbortError';
    res.status(aborted ? 504 : 500).json({ error: aborted ? 'Upstream timeout' : 'Proxy failure' });
  }
}
