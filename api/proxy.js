// Simple proxy for JS/CSS assets to make them same-origin.
// This helps in environments with restrictive CSP or network blocking of CDNs.

/** @type {import('@vercel/node').VercelRequestHandler} */
module.exports = async function handler(req, res) {
  try {
    const url = req.query.url;
    if (!url || Array.isArray(url)) {
      res.status(400).json({ error: 'Missing url' });
      return;
    }
    const allowedHosts = new Set(['unpkg.com', 'cdn.jsdelivr.net']);
    const parsed = new URL(url);
    if (!allowedHosts.has(parsed.hostname)) {
      res.status(400).json({ error: 'Host not allowed' });
      return;
    }
    const upstream = await fetch(url);
    if (!upstream.ok) {
      res.status(upstream.status).send(`Upstream error: ${upstream.status}`);
      return;
    }
    // Pass through content-type and cache headers for performance
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const etag = upstream.headers.get('etag');
    res.setHeader('Content-Type', contentType);
    if (etag) res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, immutable');
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.status(200).send(buf);
  } catch (e) {
    res.status(500).json({ error: 'Proxy failure', message: e && e.message });
  }
};
