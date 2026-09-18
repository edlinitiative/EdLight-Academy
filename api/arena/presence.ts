/**
 * Vercel serverless function: POST /api/arena/presence
 * ────────────────────────────────────────────────────────────────────────────
 * "I am in the room." The player marks themselves present once the doors open.
 *
 * This is the endpoint qualification actually rests on. Decision 3 of
 * 2026-09-18: a registered no-show does NOT count toward a school's five —
 * qualification is evaluated at doors close, on players present. Registration
 * still matters (it makes a school visible, drives the invite loop, and seeds
 * the push list) but it is not the test.
 *
 * Which makes the response the interesting part: a school can LOSE
 * qualification on the night — five registered in the lobby, three present at
 * 18:00 — and discovering that at kick-off is a bad surprise and a bad story.
 * So this returns both counts, every time, so the lobby can show
 * "CODOSA · 5 inscrits · 3 présents" with the present count as the one that
 * matters, and the invite copy can shift from "register" to "come now".
 *
 * Request body (Authorization: Bearer <Firebase ID token>):
 *   { tournamentId: string }
 *
 * Response 200:
 *   { ok: true, present, registered, needed, qualified, minPlayers,
 *     schoolKey, presentAt, duringDoors }
 *
 * Errors: 400 invalid input · 403 not_registered · 404 tournament_not_found ·
 *         409 doors_not_open · 429 rate limited · 500 write_failed.
 *
 * Rate limiting: the `arena-presence` bucket, which FAILS CLOSED. Its cap is
 * the most generous of the three because this is a heartbeat — a client on a
 * flaky connection re-sends it, and a heartbeat that gets throttled into
 * silence would un-qualify a school that was standing in the room.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Timestamp } from 'firebase-admin/firestore';
import { requireAuth } from '../_lib/requireAuth';
import { getDb } from '../_lib/firebaseAdmin';
import {
  DEFAULT_MIN_PLAYERS,
  asArenaState,
  enforceRateLimit,
  isValidTournamentId,
  parseBody,
  schoolCounts,
} from './_shared';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const uid = await requireAuth(req, res);
  if (!uid) return;

  if (!(await enforceRateLimit(res, uid, 'arena-presence'))) return;

  const body = parseBody(req);
  const tournamentId = body.tournamentId;
  if (!isValidTournamentId(tournamentId)) {
    res.status(400).json({ error: 'invalid_tournament_id' });
    return;
  }

  const db = getDb();

  try {
    const tSnap = await db.doc(`tournaments/${tournamentId}`).get();
    if (!tSnap.exists) {
      res.status(404).json({ error: 'tournament_not_found' });
      return;
    }
    const tournament = tSnap.data() ?? {};
    const state = asArenaState(tournament.state);

    // `doors` is what presence is FOR. `live` is accepted too, because the
    // client keeps the heartbeat running across the transition and rejecting it
    // the instant the first question opens would spam errors at every player in
    // the tournament. A player first seen during `live` still gets a
    // `presentAt` — they are in the room — but `duringDoors: false` records
    // that they missed the qualification cut-off, so the aggregator can apply
    // Decision 3 exactly ("evaluated at doors close") without re-deriving it
    // from timestamps against a doorsAt that an admin may have moved.
    if (state !== 'doors' && state !== 'live') {
      res.status(409).json({ error: 'doors_not_open', state: state ?? null });
      return;
    }

    const minPlayers = typeof tournament.minPlayers === 'number' && tournament.minPlayers > 0
      ? tournament.minPlayers
      : DEFAULT_MIN_PLAYERS;

    const playerRef = db.doc(`tournaments/${tournamentId}/players/${uid}`);

    // ── Mark present, once ────────────────────────────────────────────────
    //
    // Transactional and first-write-wins. `presentAt` is when the student
    // ARRIVED, and a heartbeat that overwrote it every thirty seconds would
    // turn the arrival time into "the last time their phone had signal" —
    // which is the wrong number for a tiebreaker and the wrong number for the
    // "SLDG vient d'entrer" moment the doors screen is built around.
    const marked = await db.runTransaction(async (tx) => {
      const snap = await tx.get(playerRef);
      if (!snap.exists) return null;

      const player = snap.data() ?? {};
      const existingPresentAt = player.presentAt ?? null;

      if (!existingPresentAt) {
        const now = Timestamp.now();
        tx.update(playerRef, {
          presentAt: now,
          duringDoors: state === 'doors',
          lastSeenAt: now,
        });
        return { schoolKey: String(player.schoolKey ?? ''), presentAt: now, duringDoors: state === 'doors' };
      }

      tx.update(playerRef, { lastSeenAt: Timestamp.now() });
      return {
        schoolKey: String(player.schoolKey ?? ''),
        presentAt: existingPresentAt as Timestamp,
        duringDoors: player.duringDoors === true,
      };
    });

    if (!marked) {
      // Presence is meaningless without a registration: there is no school to
      // count them toward and no row to score them on.
      res.status(403).json({ error: 'not_registered' });
      return;
    }

    const counts = marked.schoolKey
      ? await schoolCounts(db, tournamentId, marked.schoolKey)
      : { registered: 0, present: 0 };

    res.status(200).json({
      ok: true,
      schoolKey: marked.schoolKey,
      // PRESENT is the number that decides. It is returned first and named
      // plainly so no client has to guess which of the two qualifies a school.
      present: counts.present,
      registered: counts.registered,
      needed: Math.max(0, minPlayers - counts.present),
      qualified: counts.present >= minPlayers,
      minPlayers,
      presentAt: marked.presentAt.toMillis(),
      duringDoors: marked.duringDoors,
    });
  } catch (err) {
    console.error('[arena/presence] error:', err);
    res.status(500).json({ error: 'write_failed' });
  }
}
