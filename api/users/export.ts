// Returns the latest Users CSV from GitHub main branch so Admin sees up-to-date data without redeploy.

import type { VercelRequest, VercelResponse } from '@vercel/node';

const OWNER = 'edlinitiative';
const REPO = 'EdLight-Academy';
const PATH = 'public/data/edlight_users.csv';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  try {
    const url = `https://raw.githubusercontent.com/${OWNER}/${REPO}/main/${PATH}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      const text = await resp.text();
      res.status(resp.status).json({ error: 'upstream_fetch_failed', details: text });
      return;
    }
    const csv = await resp.text();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(csv);
  } catch (e) {
    console.error('users/export error', e);
    res.status(500).json({ error: 'internal_error' });
  }
}
