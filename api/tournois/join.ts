/**
 * Vercel serverless function: POST /api/tournois/join
 * ────────────────────────────────────────────────────────────────────────────
 *   { tid?: string, pin?: string, displayName?, school?, grade? }
 *     → 200 { ok, tid, already }
 *     · 404 not_found · 403 pin_required · 409 closed | full
 *     · 400 school_required | grade_required | name_required
 *
 * A PIN always works. A bare tid works for public and unlisted tournaments —
 * the link IS the invitation — but a private one must be joined with its PIN,
 * so a tid that leaks out of a screenshot does not open the room.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuthDecoded } from '../_lib/requireAuth';
import { getDb } from '../_lib/firebaseAdmin';
import { isValidPin, isValidTid } from '../../shared/tournois/config';
import {
  PINS,
  enforceRateLimit,
  joinTournament,
  parseBody,
  readTournament,
  resolveIdentity,
} from './_shared';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  const decoded = await requireAuthDecoded(req, res);
  if (!decoded) return;
  const { uid } = decoded;
  if (!(await enforceRateLimit(res, uid, 'tournois-join'))) return;

  const body = parseBody(req);
  const db = getDb();
  const now = Date.now();

  let tid: string | null = isValidTid(body.tid) ? body.tid : null;
  const pin = typeof body.pin === 'string' ? body.pin.replace(/\D/g, '') : '';
  let viaPin = false;
  if (isValidPin(pin)) {
    const p = await db.doc(`${PINS}/${pin}`).get();
    const pinTid = p.exists ? p.data()?.tid : null;
    if (!pinTid || (tid && pinTid !== tid)) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    tid = pinTid;
    viaPin = true;
  }
  if (!tid) {
    res.status(400).json({ error: 'invalid_tid' });
    return;
  }

  const t = await readTournament(db, tid);
  if (!t || t.state === 'cancelled') {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  if (t.visibility === 'private' && !viaPin && t.creatorUid !== uid) {
    res.status(403).json({ error: 'pin_required' });
    return;
  }

  const identity = await resolveIdentity(db, uid, decoded.name, body);
  if (!identity) {
    res.status(400).json({ error: 'name_required' });
    return;
  }

  const out = await joinTournament(db, tid, identity, now);
  if (out.ok) {
    res.status(200).json({ ok: true, tid, already: out.already });
    return;
  }
  const status = out.error === 'not_found' ? 404 : out.error === 'closed' || out.error === 'full' ? 409 : 400;
  res.status(status).json({ error: out.error });
}
