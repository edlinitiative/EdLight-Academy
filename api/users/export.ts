// Returns the latest Users CSV from GitHub main branch so Admin sees up-to-date data without redeploy.
// Requires a valid Firebase ID token from an admin user.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyIdToken, getDb, isAdminConfigured } from '../_lib/firebaseAdmin';

const OWNER = 'edlinitiative';
const REPO = 'EdLight-Academy';
const PATH = 'public/data/edlight_users.csv';

async function isAdminUser(uid: string): Promise<boolean> {
  try {
    const db = getDb();
    const doc = await db.collection('users').doc(uid).get();
    return doc.exists && doc.data()?.role === 'admin';
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  if (!isAdminConfigured()) {
    res.status(503).json({ error: 'server_misconfigured', message: 'Firebase Admin is not configured.' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!idToken) {
    res.status(401).json({ error: 'unauthorized', message: 'Missing Authorization header.' });
    return;
  }

  let uid: string;
  try {
    const decoded = await verifyIdToken(idToken);
    uid = decoded.uid;
  } catch {
    res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired token.' });
    return;
  }

  const admin = await isAdminUser(uid);
  if (!admin) {
    res.status(403).json({ error: 'forbidden', message: 'Admin role required.' });
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
