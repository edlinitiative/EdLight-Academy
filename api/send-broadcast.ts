/**
 * POST /api/send-broadcast
 * ---------------------------------------------------------------------------
 * Admin announcement broadcast: pushes a single notification to EVERY
 * subscribed device across all users (e.g. "Nouveaux examens blancs ajoutés !").
 *
 * Authorized callers (either is sufficient):
 *   1. A signed-in ADMIN — `Authorization: Bearer <Firebase ID token>` where the
 *      token's user has `role: 'admin'` in `users/{uid}` (same rule the
 *      Firestore security rules use).
 *   2. Server/cron — `Authorization: Bearer <CRON_SECRET>` (or `x-cron-secret`).
 *
 * Body: { title, body?, url?, tag?, requireInteraction?, data?, maxDevices? }
 *
 * Responds 200 with aggregate counts (and `truncated: true` when the audience
 * exceeded the per-run cap, meaning another call is needed to finish).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyIdToken, getDb, isAdminConfigured } from './_lib/firebaseAdmin';
import { sendPushToAllUsers, isPushConfigured, type NotificationPayload } from './_lib/push';

interface BroadcastBody {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
  requireInteraction?: boolean;
  data?: Record<string, unknown>;
  maxDevices?: number;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function isAdminUser(uid: string): Promise<boolean> {
  try {
    const snap = await getDb().collection('users').doc(uid).get();
    return snap.exists && snap.data()?.role === 'admin';
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  if (!isPushConfigured() || !isAdminConfigured()) {
    res.status(501).json({
      error: 'not_configured',
      message:
        'Server push is not configured. Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and FIREBASE_SERVICE_ACCOUNT_JSON.',
    });
    return;
  }

  // ---- Authorize: cron secret OR admin ID token ---------------------------
  const cronSecret = process.env.CRON_SECRET || '';
  const headerToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const cronHeader = (req.headers['x-cron-secret'] as string) || '';

  const presentsCronSecret =
    !!cronSecret &&
    ((!!headerToken && timingSafeEqual(headerToken, cronSecret)) ||
      (!!cronHeader && timingSafeEqual(cronHeader, cronSecret)));

  if (!presentsCronSecret) {
    if (!headerToken) {
      res.status(401).json({ error: 'unauthorized', message: 'Missing Authorization header.' });
      return;
    }
    let uid: string;
    try {
      uid = (await verifyIdToken(headerToken)).uid;
    } catch {
      res.status(401).json({ error: 'invalid_token', message: 'Invalid or expired ID token.' });
      return;
    }
    if (!(await isAdminUser(uid))) {
      res.status(403).json({ error: 'forbidden', message: 'Admin privileges required.' });
      return;
    }
  }

  // ---- Build + broadcast ---------------------------------------------------
  const body: BroadcastBody = (req.body && typeof req.body === 'object' ? req.body : {}) as BroadcastBody;
  const title = (body.title || '').toString().trim();
  if (!title) {
    res.status(400).json({ error: 'invalid_request', message: 'A "title" is required.' });
    return;
  }

  const payload: NotificationPayload = {
    title: title.slice(0, 120),
    body: (body.body || '').toString().slice(0, 300),
    url: (body.url || '/').toString().slice(0, 512),
    tag: body.tag ? String(body.tag).slice(0, 64) : 'edlight-announcement',
    requireInteraction: !!body.requireInteraction,
    data: body.data && typeof body.data === 'object' ? body.data : { kind: 'announcement' },
  };

  try {
    const result = await sendPushToAllUsers(payload, {
      maxDevices: typeof body.maxDevices === 'number' ? body.maxDevices : undefined,
    });
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('[send-broadcast] error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}
