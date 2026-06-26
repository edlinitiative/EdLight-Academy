// Upserts a user into public/data/edlight_users.csv by committing to GitHub using a token.
// Requires env GITHUB_TOKEN with repo scope.
// Requires a valid Firebase ID token — the caller may only upsert their own identity.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyIdToken, isAdminConfigured } from '../_lib/firebaseAdmin';

const OWNER = 'edlinitiative';
const REPO = 'EdLight-Academy';
const PATH = 'public/data/edlight_users.csv';

type CSVRow = Record<string, string>;

function parseCSV(text: string): { header: string[]; data: CSVRow[] } {
  const rows: string[][] = [];
  let i = 0, field = '', row: string[] = [], inQuotes = false;
  while (i <= text.length) {
    const c = text[i] || '\n';
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else { field += c; }
    } else {
      if (c === '"') inQuotes = true; else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') { if (field.length || row.length) { row.push(field); rows.push(row.map(s => s.trim())); } field = ''; row = []; if (c === '\r' && text[i + 1] === '\n') i++; }
      else { field += c; }
    }
    i++;
  }
  if (!rows.length) return { header: [], data: [] };
  const [header, ...data] = rows;
  return { header, data: data.map(r => Object.fromEntries(header.map((h, idx) => [h, r[idx] ?? ''])) as CSVRow) };
}

function toCSV(rows: CSVRow[], columns: string[]): string {
  const esc = (v: string = '') => {
    const s = String(v);
    if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const header = columns.join(',');
  const lines = rows.map(r => columns.map(c => esc(r[c] ?? '')).join(','));
  return [header, ...lines].join('\n');
}

interface UpsertBody {
  name?: string;
  email?: string;
  sub?: string;
  picture?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
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

  let callerUid: string;
  let callerEmail: string | undefined;
  try {
    const decoded = await verifyIdToken(idToken);
    callerUid = decoded.uid;
    callerEmail = decoded.email;
  } catch {
    res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired token.' });
    return;
  }

  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      res.status(501).json({ error: 'not_configured', message: 'Missing GITHUB_TOKEN env var on server. Add a repo-scoped token to enable user auto-population.' });
      return;
    }

    const bodyText = await new Promise<string>((resolve) => {
      let data = '';
      req.on('data', (chunk) => data += chunk);
      req.on('end', () => resolve(data));
    });
    const body: UpsertBody = bodyText ? JSON.parse(bodyText) : {};
    const now = new Date().toISOString();
    const { name = 'Student', email = '', sub = '' } = body || {};
    if (!email && !sub) {
      res.status(400).json({ error: 'invalid_request', message: 'Missing email or sub' });
      return;
    }

    // Enforce that the caller can only upsert their own record: the `sub`
    // must match the verified uid, and the `email` must match the token email.
    if (sub && sub !== callerUid) {
      res.status(403).json({ error: 'forbidden', message: 'sub must match the authenticated user uid.' });
      return;
    }
    if (email && callerEmail && email.toLowerCase() !== callerEmail.toLowerCase()) {
      res.status(403).json({ error: 'forbidden', message: 'email must match the authenticated user email.' });
      return;
    }

    const user_id = sub ? `g_${sub}` : `email:${String(email).toLowerCase()}`;

    // Fetch the current file metadata to get sha
    const metaUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`;
    const metaResp = await fetch(metaUrl, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json' } });
    if (!metaResp.ok) {
      const t = await metaResp.text();
      res.status(metaResp.status).json({ error: 'github_meta_failed', details: t });
      return;
    }
    const meta = await metaResp.json();
    const sha = meta.sha;
    const contentBuf = Buffer.from(meta.content, 'base64');
    const currentCSV = contentBuf.toString('utf8');

    // Parse, upsert
    const columns = ['user_id', 'name', 'email', 'role', 'enrolled_courses', 'created_at', 'last_seen'];
    let { header, data } = parseCSV(currentCSV);
    if (!header || header.length === 0) header = columns;
    const byId = new Map<string, CSVRow>();
    data.forEach(r => byId.set(r.user_id || r.email || '', r));
    const existing = byId.get(user_id) || Array.from(byId.values()).find(r => (r.email || '').toLowerCase() === String(email).toLowerCase());
    if (existing) {
      existing.name = name || existing.name || 'Student';
      existing.email = email || existing.email || '';
      existing.last_seen = now;
    } else {
      data.push({ user_id, name, email, role: 'student', enrolled_courses: '', created_at: now, last_seen: now });
    }

    const updatedCSV = toCSV(data, columns);

    // Commit back to GitHub
    const putResp = await fetch(metaUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `Users: upsert ${email || user_id}`,
        content: Buffer.from(updatedCSV, 'utf8').toString('base64'),
        sha,
        branch: 'main'
      })
    });

    const putText = await putResp.text();
    if (!putResp.ok) {
      let details: unknown = putText;
      try { details = JSON.parse(putText); } catch { /* keep raw text */ }
      res.status(putResp.status).json({ error: 'github_commit_failed', details });
      return;
    }

    res.status(200).json({ ok: true, user_id });
  } catch (e) {
    console.error('users/upsert error', e);
    res.status(500).json({ error: 'internal_error' });
  }
}
