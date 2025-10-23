// Serverless function to exchange Google OAuth authorization code for tokens.
// Uses client_secret stored in Vercel environment variables.
// Expected env vars:
// - GOOGLE_CLIENT_ID
// - GOOGLE_CLIENT_SECRET

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');

    let payload = {};
    const contentType = (req.headers['content-type'] || '').toLowerCase();
    if (contentType.includes('application/json')) {
      payload = raw ? JSON.parse(raw) : {};
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(raw);
      payload = Object.fromEntries(params.entries());
    } else {
      // try JSON by default
      payload = raw ? JSON.parse(raw) : {};
    }

    const { code, code_verifier, redirect_uri } = payload;
    if (!code || !code_verifier || !redirect_uri) {
      return res.status(400).json({ error: 'invalid_request', error_description: 'Missing code, code_verifier, or redirect_uri' });
    }

    const client_id = process.env.GOOGLE_CLIENT_ID;
    const client_secret = process.env.GOOGLE_CLIENT_SECRET;
    if (!client_id || !client_secret) {
      return res.status(500).json({ error: 'server_misconfigured', error_description: 'Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET' });
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
      let details = text;
      try { details = JSON.parse(text); } catch {}
      return res.status(resp.status).json({ error: 'token_exchange_failed', details });
    }

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.status(200).send(text);
  } catch (e) {
    console.error('oauth token exchange error', e);
    res.status(500).json({ error: 'internal_error' });
  }
};
