// Returns the user roster as CSV for the Admin console. Built server-side from
// the access-controlled Firestore `users` collection (NOT a public file), and
// gated to admin callers only. Previously fetched a plaintext CSV from the
// public GitHub repo — that PII file has been removed.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyIdToken, getDb, isAdminConfigured } from '../_lib/firebaseAdmin';

const COLUMNS = ['user_id', 'name', 'email', 'role', 'enrolled_courses', 'created_at', 'last_seen'];

async function isAdminUser(uid: string): Promise<boolean> {
  try {
    const db = getDb();
    const doc = await db.collection('users').doc(uid).get();
    return doc.exists && doc.data()?.role === 'admin';
  } catch {
    return false;
  }
}

function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** Firestore Timestamp | ISO string | epoch ms → ISO string (best effort). */
function toIso(v: unknown): string {
  if (!v) return '';
  if (typeof v === 'object' && typeof (v as { toDate?: () => Date }).toDate === 'function') {
    try { return (v as { toDate: () => Date }).toDate().toISOString(); } catch { return ''; }
  }
  if (typeof v === 'number') return new Date(v).toISOString();
  return String(v);
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
    const snap = await getDb().collection('users').get();
    const rows = snap.docs.map((doc) => {
      const d = doc.data() || {};
      const enrolled = Array.isArray(d.enrolled_courses)
        ? d.enrolled_courses.join(';')
        : (d.enrolled_courses ?? d.enrollment ?? '');
      return {
        user_id: doc.id,
        name: d.full_name ?? d.name ?? '',
        email: d.email ?? '',
        role: d.role ?? 'student',
        enrolled_courses: enrolled,
        created_at: toIso(d.created_at),
        last_seen: toIso(d.last_seen),
      } as Record<string, unknown>;
    });

    const lines = [
      COLUMNS.join(','),
      ...rows.map((r) => COLUMNS.map((c) => csvEscape(r[c])).join(',')),
    ];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(lines.join('\n'));
  } catch (e) {
    console.error('users/export error', e);
    res.status(500).json({ error: 'internal_error' });
  }
}
