/**
 * POST /api/send-push
 * ---------------------------------------------------------------------------
 * Sends a Web Push notification to a user's subscribed devices. Two callers:
 *
 *   1. The signed-in user, to their OWN devices (e.g. the "Test" button or any
 *      future in-app trigger). Auth: `Authorization: Bearer <Firebase ID token>`.
 *      The target is always the token's uid — a user can't push to others.
 *
 *   2. Server/cron/admin, to ANY user. Auth: `Authorization: Bearer <CRON_SECRET>`
 *      (or `x-cron-secret: <CRON_SECRET>`). Body may include `userId`.
 *
 * Body: { userId?, title, body?, url?, tag?, requireInteraction?, data? }
 *
 * Responds 200 with delivery counts, 401/403 on auth failure, 501 when push or
 * Admin credentials aren't configured on the server.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyIdToken, isAdminConfigured } from './_lib/firebaseAdmin';
import { sendPushToUser, isPushConfigured, type NotificationPayload } from './_lib/push';

interface SendPushBody {
  userId?: string;
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
  requireInteraction?: boolean;
  data?: Record<string, unknown>;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
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

  const body: SendPushBody = (req.body && typeof req.body === 'object' ? req.body : {}) as SendPushBody;

  const cronSecret = process.env.CRON_SECRET || '';
  const headerToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const cronHeader = (req.headers['x-cron-secret'] as string) || '';

  // ---- Resolve who we're allowed to send to -------------------------------
  let targetUserId: string | null = null;

  const presentsCronSecret =
    !!cronSecret &&
    ((!!headerToken && timingSafeEqual(headerToken, cronSecret)) ||
      (!!cronHeader && timingSafeEqual(cronHeader, cronSecret)));

  if (presentsCronSecret) {
    // Privileged caller: may target any user.
    targetUserId = (body.userId || '').trim() || null;
    if (!targetUserId) {
      res.status(400).json({ error: 'invalid_request', message: 'Missing userId for admin send.' });
      return;
    }
  } else if (headerToken) {
    // Regular caller: must present a valid Firebase ID token; target = self.
    try {
      const decoded = await verifyIdToken(headerToken);
      targetUserId = decoded.uid;
    } catch {
      res.status(401).json({ error: 'invalid_token', message: 'Invalid or expired ID token.' });
      return;
    }
  } else {
    res.status(401).json({ error: 'unauthorized', message: 'Missing Authorization header.' });
    return;
  }

  // ---- Build + send --------------------------------------------------------
  const title = (body.title || 'EdLight Academy').toString().slice(0, 120);
  const payload: NotificationPayload = {
    title,
    body: (body.body || '').toString().slice(0, 300),
    url: (body.url || '/').toString().slice(0, 512),
    tag: body.tag ? String(body.tag).slice(0, 64) : undefined,
    requireInteraction: !!body.requireInteraction,
    data: body.data && typeof body.data === 'object' ? body.data : undefined,
  };

  try {
    const result = await sendPushToUser(targetUserId, payload);
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('[send-push] error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}
