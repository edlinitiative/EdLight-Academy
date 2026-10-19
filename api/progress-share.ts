/**
 * /api/progress-share — the student-shared progress record for parents.
 *
 *   GET  ?token=…            Public, signed-out. Rate-limited per hashed address.
 *                            200 { status: 'ok', progress } | { status: 'revoked'|'expired'|'not_found' }
 *   POST { action: 'create', days?: 7|30|90 }   → { token, id, expiresAt, days }
 *   POST { action: 'list' }                    → { shares: [...] } (active links + views)
 *   POST { action: 'revoke', id }              → { ok: true }
 * POST actions need the student's Firebase ID token; the owner is always the
 * token's uid. See shared/progressShare.ts for the public scope.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_lib/firebaseAdmin';
import { requireAuth } from './_lib/requireAuth';
import { checkRateLimit } from './_lib/rateLimit';
import { clientAddress, hashAddress } from './_lib/addressHash';
import { ShareError } from '../shared/progressShare';
import { createShare, listShares, revokeShare, viewShare } from './_lib/progressShare';

function logView(outcome: string) {
  // Same sink and shape as /api/telemetry: no token, uid or address.
  console.info(JSON.stringify({ service: 'student_diagnostics', receivedAt: Date.now(),
    event: { type: 'event', name: 'releve_link_viewed', timestamp: Date.now(), detail: { scope: 'progress', outcome } } }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method === 'GET') {
    const key = hashAddress(clientAddress(req as any), 'progress-share-view') || 'unknown';
    if (!(await checkRateLimit(`ip_${key}`, 'progress-share-view')).allowed) {
      res.setHeader('Retry-After', '600');
      res.status(429).json({ error: 'rate_limit' }); return;
    }
    try {
      const token = Array.isArray(req.query?.token) ? req.query.token[0] : req.query?.token;
      const out = await viewShare(getDb(), token, Date.now());
      logView(out.status);
      res.status(200).json(out);
    } catch {
      console.error('[progress-share] view failed');
      res.status(503).json({ error: 'unavailable' });
    }
    return;
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); res.status(405).json({ error: 'method_not_allowed' }); return; }
  const uid = await requireAuth(req, res);
  if (!uid) return;
  if (!(await checkRateLimit(uid, 'progress-share-write')).allowed) { res.status(429).json({ error: 'rate_limit' }); return; }
  try {
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) || {};
    const db = getDb(), now = Date.now();
    let out: unknown;
    if (body.action === 'create') out = await createShare(db, uid, body.days, now);
    else if (body.action === 'list') out = await listShares(db, uid, now);
    else if (body.action === 'revoke') out = await revokeShare(db, uid, body.id, now);
    else throw new ShareError('invalid_input');
    res.status(200).json(out);
  } catch (err) {
    if (err instanceof ShareError) res.status(err.code === 'not_found' ? 404 : 400).json({ error: err.code });
    else if (err instanceof SyntaxError) res.status(400).json({ error: 'invalid_input' });
    else { console.error('[progress-share] request failed'); res.status(503).json({ error: 'unavailable' }); }
  }
}
