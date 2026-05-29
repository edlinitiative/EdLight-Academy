// Serverless function to exchange Google OAuth authorization code for tokens.
// Uses client_secret stored in Vercel environment variables.
// Expected env vars:
// - GOOGLE_CLIENT_ID
// - GOOGLE_CLIENT_SECRET

import type { VercelRequest, VercelResponse } from '@vercel/node';

interface TokenPayload {
  code?: string;
  code_verifier?: string;
  redirect_uri?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
    }
    const raw = Buffer.concat(chunks).toString('utf8');

    let payload: TokenPayload = {};
    const contentType = (req.headers['content-type'] || '').toLowerCase();
    if (contentType.includes('application/json')) {
      payload = raw ? JSON.parse(raw) : {};
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(raw);
      payload = Object.fromEntries(params.entries()) as TokenPayload;
    } else {
      // try JSON by default
      payload = raw ? JSON.parse(raw) : {};
    }

    const { code, code_verifier, redirect_uri } = payload;
    if (!code || !code_verifier || !redirect_uri) {
      res.status(400).json({ error: 'invalid_request', error_description: 'Missing code, code_verifier, or redirect_uri' });
      return;
    }

    const client_id = process.env.GOOGLE_CLIENT_ID;
    const client_secret = process.env.GOOGLE_CLIENT_SECRET;
    if (!client_id || !client_secret) {
      res.status(500).json({ error: 'server_misconfigured', error_description: 'Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET' });
      return;
    }

    const body = new URLSearchParams({
      client_id,
      client_secret,
      code,
      code_verifier,
      redirect_uri,
      grant_type: 'authorization_code',
    });

    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const text = await resp.text();
    if (!resp.ok) {
      let details: unknown = text;
      try { details = JSON.parse(text); } catch { /* keep raw text */ }
      res.status(resp.status).json({ error: 'token_exchange_failed', details });
      return;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.status(200).send(text);
  } catch (e) {
    console.error('oauth token exchange error', e);
    res.status(500).json({ error: 'internal_error' });
  }
}
