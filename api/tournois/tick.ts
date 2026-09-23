/**
 * Vercel serverless function: /api/tournois/tick
 * ────────────────────────────────────────────────────────────────────────────
 * Two callers, one idempotent step (`advanceTournament` in _shared):
 *
 *   POST { tid }   — any open page (player, creator or spectator) calls this
 *                    when its local countdown reaches the next deadline. No
 *                    sign-in needed: it can only move a tournament to where
 *                    the stored schedule already says it is, and does nothing
 *                    when it is already there. Rate-limited by caller address.
 *                    → { ok, steps, state }
 *
 *   GET (cron, CRON_SECRET) — the per-minute fallback in vercel.json for
 *                    rooms nobody has open: sweeps every tournament whose
 *                    `nextDeadlineAt` has passed.
 *                    → { ok, swept, advanced }
 *
 * Lazy advancing is why a live room is exact to the second while the cron is
 * only exact to the minute: the clients in the room tick it on time, and the
 * cron only has to catch the rooms that are empty.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, isAdminConfigured } from '../_lib/firebaseAdmin';
import { isValidTid } from '../../shared/tournois/config';
import { COLLECTION, advanceTournament, clientKey, cronAuthorized, enforceRateLimit, parseBody } from './_shared';

const SWEEP_LIMIT = 40;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!isAdminConfigured()) {
    res.status(503).json({ error: 'server_misconfigured' });
    return;
  }
  const db = getDb();
  const now = Date.now();

  if (req.method === 'GET') {
    if (!cronAuthorized(req)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const due = await db.collection(COLLECTION)
      .where('nextDeadlineAt', '<=', now)
      .orderBy('nextDeadlineAt', 'asc')
      .limit(SWEEP_LIMIT)
      .get();
    let advanced = 0;
    for (const d of due.docs) {
      try {
        const r = await advanceTournament(db, d.id, now);
        if (r.steps > 0) advanced += 1;
      } catch (err) {
        console.error('[tournois/tick] sweep failed for', d.id, err);
      }
    }
    res.status(200).json({ ok: true, swept: due.size, advanced });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  const body = parseBody(req);
  if (!isValidTid(body.tid)) {
    res.status(400).json({ error: 'invalid_tid' });
    return;
  }
  if (!(await enforceRateLimit(res, clientKey(req), 'tournois-tick'))) return;
  const r = await advanceTournament(db, body.tid, now);
  res.status(200).json({ ok: true, steps: r.steps, state: r.state, serverNow: now });
}
