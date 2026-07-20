// Upserts the authenticated user's identity into Firestore `users/{uid}`.
// Requires a valid Firebase ID token — the caller may only upsert their OWN
// record. Identity fields (uid, email) are taken from the VERIFIED token, never
// from the request body; only the display name / picture are accepted from the
// body. The users doc is already access-controlled by firestore.rules, so this
// endpoint stores no data anywhere else (it used to commit a plaintext roster
// CSV to the public GitHub repo — removed for privacy).

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyIdToken, getDb, isAdminConfigured } from '../_lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

interface UpsertBody {
  name?: string;
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
    const bodyText = await new Promise<string>((resolve) => {
      let data = '';
      req.on('data', (chunk) => data += chunk);
      req.on('end', () => resolve(data));
    });
    let body: UpsertBody = {};
    try { body = bodyText ? JSON.parse(bodyText) : {}; } catch { body = {}; }

    // Only the non-identity display fields are accepted from the body, capped
    // to sane lengths. Identity (uid/email) always comes from the token.
    const fullName = typeof body.name === 'string' && body.name.trim()
      ? body.name.trim().slice(0, 120)
      : 'Student';
    const picture = typeof body.picture === 'string' ? body.picture.slice(0, 500) : '';

    const now = FieldValue.serverTimestamp();
    const userRef = getDb().collection('users').doc(callerUid);
    const snap = await userRef.get();

    // Merge so we never clobber server-controlled fields (e.g. `role`) set by an
    // admin, or an existing `created_at`. Field names mirror the client-side
    // upsertUserDocument (src/services/firebase.ts).
    const data: Record<string, unknown> = {
      full_name: fullName,
      last_seen: now,
    };
    if (callerEmail) data.email = callerEmail.toLowerCase();
    if (picture) data.profile_picture = picture;
    if (!snap.exists) data.created_at = now;

    await userRef.set(data, { merge: true });

    res.status(200).json({ ok: true, uid: callerUid });
  } catch (e) {
    console.error('users/upsert error', e);
    res.status(500).json({ error: 'internal_error' });
  }
}
