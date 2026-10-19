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
 * The caller is always the verified token's uid; admin = users/{uid}.role 'admin'.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_lib/firebaseAdmin';
import { requireAuth } from './_lib/requireAuth';
import { checkRateLimit } from './_lib/rateLimit';
import { isAdminUid } from './arena/_shared';
import { AmbassadorError } from '../shared/ambassadors';
import {
  ambassadorDashboard, ambassadorDirectory, ambassadorRecruitDetail, ambassadorReport, designateAmbassador, revokeAmbassador, setReward,
} from './_lib/ambassadors';

const ADMIN_ACTIONS = new Set(['designate', 'revoke', 'report', 'recruits', 'reward']);

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
