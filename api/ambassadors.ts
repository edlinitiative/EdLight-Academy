/**
 * /api/ambassadors — school ambassador programme (shared/ambassadors.ts).
 *
 *   GET  ?view=directory       Public, CDN-cached: { uids } of active ambassadors, for the badge.
 *   POST { action: 'dashboard' }                       Active ambassador only.
 *   POST { action: 'designate', uid, school }          Admin.
 *   POST { action: 'revoke', uid }                     Admin.
 *   POST { action: 'report', period? }                 Admin: rows per ambassador (CSV built client-side).
 *   POST { action: 'recruits', uid }                   Admin: per-recruit states and fraud flags.
 *   POST { action: 'reward', uid, period, delivered, notes }  Admin: manual fulfilment record.
 *   POST ?action=ambassador-application                EdLight Apply webhook, HMAC-signed, no token
 *                                                      (protocol: _lib/ambassadorApplications.ts).
 * The caller is always the verified token's uid; admin = users/{uid}.role 'admin'.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthAdmin, getDb } from './_lib/firebaseAdmin';
import { requireAuth } from './_lib/requireAuth';
import { checkRateLimit } from './_lib/rateLimit';
import { isAdminUid } from './arena/_shared';
import { AmbassadorError } from '../shared/ambassadors';
import {
  ambassadorDashboard, ambassadorDirectory, ambassadorRecruitDetail, ambassadorReport, designateAmbassador, revokeAmbassador, setReward,
} from './_lib/ambassadors';

import { processAmbassadorApplication, verifyAmbassadorWebhook, WEBHOOK_STATUS } from './_lib/ambassadorApplications';

const ADMIN_ACTIONS = new Set(['designate', 'revoke', 'report', 'recruits', 'reward']);
const header = (req: VercelRequest, name: string) => {
  const v = req.headers?.[name];
  return Array.isArray(v) ? v[0] : v;
};

/**
 * The exact bytes Apply signed. Vercel parses `req.body` lazily, so the stream
 * is read first while it is untouched; a pre-parsed body (local dev servers,
 * tests) falls back to its JSON form, which is what Apply sends
 * (`JSON.stringify(payload)` round-trips byte for byte).
 */
async function rawBodyOf(req: VercelRequest): Promise<string> {
  const stream = req as unknown as NodeJS.ReadableStream & { readableEnded?: boolean; readable?: boolean };
  if (typeof stream.on === 'function' && stream.readable && !stream.readableEnded) {
    const chunks: Buffer[] = [];
    const read = await new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), 5000);
      stream.on('data', (c: Buffer | string) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      stream.on('end', () => { clearTimeout(timer); resolve(Buffer.concat(chunks).toString('utf8')); });
      stream.on('error', () => { clearTimeout(timer); resolve(null); });
    });
    if (read) return read;
  }
  const body = (req as { body?: unknown }).body;
  if (typeof body === 'string') return body;
  if (Buffer.isBuffer(body)) return body.toString('utf8');
  return body == null ? '' : JSON.stringify(body);
}

async function applicationWebhook(req: VercelRequest, res: VercelResponse) {
  const now = Date.now();
  const rawBody = await rawBodyOf(req);
  const failure = verifyAmbassadorWebhook({
    secret: process.env.AMBASSADOR_WEBHOOK_SECRET, rawBody, now,
    timestamp: header(req, 'x-edlight-timestamp'), signature: header(req, 'x-edlight-signature'),
  });
  if (failure) { res.status(WEBHOOK_STATUS[failure]).json({ error: failure }); return; }
  try {
    const out = await processAmbassadorApplication(getDb(), getAuthAdmin(), JSON.parse(rawBody), now);
    res.status(200).json(out);
  } catch (err) {
    if (err instanceof AmbassadorError) res.status(WEBHOOK_STATUS[err.code] || 400).json({ error: err.code });
    else if (err instanceof SyntaxError) res.status(400).json({ error: 'invalid_input' });
    else { console.error('[ambassadors] application webhook failed'); res.status(503).json({ error: 'unavailable' }); }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET' && req.query?.view === 'directory') {
    try {
      const out = await ambassadorDirectory(getDb());
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
      res.status(200).json(out);
    } catch {
      res.setHeader('Cache-Control', 'no-store');
      res.status(503).json({ error: 'unavailable' });
    }
    return;
  }
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'POST' && req.query?.action === 'ambassador-application') { await applicationWebhook(req, res); return; }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); res.status(405).json({ error: 'method_not_allowed' }); return; }
  const uid = await requireAuth(req, res);
  if (!uid) return;
  try {
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) || {};
    const action = String(body.action || '');
    const db = getDb(), now = Date.now();
    if (!(await checkRateLimit(uid, action === 'dashboard' ? 'ambassadors-read' : 'ambassadors-write')).allowed) {
      res.status(429).json({ error: 'rate_limit' }); return;
    }
    let out: unknown;
    if (action === 'dashboard') out = await ambassadorDashboard(db, uid, now);
    else if (ADMIN_ACTIONS.has(action)) {
      if (!(await isAdminUid(db, uid))) throw new AmbassadorError('forbidden');
      if (action === 'designate') out = await designateAmbassador(db, uid, body.uid, body.school, now);
      else if (action === 'revoke') out = await revokeAmbassador(db, uid, body.uid, now);
      else if (action === 'report') out = await ambassadorReport(db, body.period, now);
      else if (action === 'recruits') out = await ambassadorRecruitDetail(db, body.uid, now);
      else out = await setReward(db, uid, body.uid, body.period, body.delivered, body.notes, now);
    } else throw new AmbassadorError('invalid_input');
    res.status(200).json(out);
  } catch (err) {
    if (err instanceof AmbassadorError) res.status(err.code === 'forbidden' ? 403 : err.code === 'not_found' ? 404 : 400).json({ error: err.code });
    else if (err instanceof SyntaxError) res.status(400).json({ error: 'invalid_input' });
    else { console.error('[ambassadors] request failed'); res.status(503).json({ error: 'unavailable' }); }
  }
}
