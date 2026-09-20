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
 * BEING HERE AND COUNTING ARE DIFFERENT THINGS, and `decidePresence()`
 * (`_shared.ts`) is where the two are kept apart. This endpoint keeps
 * accepting heartbeats into `live` on purpose, so a client that crosses the
 * transition is not spammed with errors — but `duringDoors` is stamped true
 * only while the state is `doors` AND `doors-close.ts` has not yet frozen the
 * roster. The freeze is the cut-off, not the state and not a clock: once the
 * roster is a stored fact, a row claiming to have made a cut-off that has
 * already passed would contradict the document qualification is actually
 * judged on.
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
  decidePresence,
  enforceRateLimit,
  isValidTournamentId,
  parseBody,
  schoolCounts,
  toMillis,
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

  const tournamentRef = db.doc(`tournaments/${tournamentId}`);
  const playerRef = db.doc(`tournaments/${tournamentId}/players/${uid}`);

  try {
    // ── Mark present, once ────────────────────────────────────────────────
    //
    // Transactional and first-write-wins. `presentAt` is when the student
    // ARRIVED, and a heartbeat that overwrote it every thirty seconds would
    // turn the arrival time into "the last time their phone had signal" —
    // which is the wrong number for a tiebreaker and the wrong number for the
    // "SLDG vient d'entrer" moment the doors screen is built around.
    //
    // CORRECTION, from an external audit: the tournament used to be read
    // BEFORE this transaction and only the player row inside it, so the state
    // and roster-freeze this write depends on were a snapshot of the past by
    // the time it landed. `doors-close.ts` freezes the roster on a cron tick
    // and `advance.ts` moves the state on another — both can fire in that gap,
    // and a presence write stamping `duringDoors: true` from a stale read is a
    // row claiming it made a cut-off that had already passed. Reading the
    // tournament in the same transaction that writes closes the gap the way
    // every other write in this codebase already does.
    const outcome = await db.runTransaction(async (tx) => {
      // Both reads before any write — Firestore's rule, and the ordering here
      // also preserves the response precedence: a missing tournament is a 404
      // before an unregistered player is a 403.
      const tSnap = await tx.get(tournamentRef);
      if (!tSnap.exists) return { kind: 'not_found' as const };

      const tournament = tSnap.data() ?? {};
      const state = asArenaState(tournament.state);
      const decision = decidePresence({
        state,
        rosterFrozenAt: toMillis(tournament.rosterFrozenAt),
      });

      const minPlayers = typeof tournament.minPlayers === 'number' && tournament.minPlayers > 0
        ? tournament.minPlayers
        : DEFAULT_MIN_PLAYERS;

      if (!decision.accept) return { kind: 'doors_not_open' as const, state };

      const pSnap = await tx.get(playerRef);
      // Presence is meaningless without a registration: there is no school to
      // count them toward and no row to score them on.
      if (!pSnap.exists) return { kind: 'not_registered' as const };

      const player = pSnap.data() ?? {};
      const existingPresentAt = player.presentAt ?? null;
      const now = Timestamp.now();
      const schoolKey = String(player.schoolKey ?? '');

      if (!existingPresentAt) {
        tx.update(playerRef, {
          presentAt: now,
          duringDoors: decision.countsTowardQualification,
          lastSeenAt: now,
        });
        return {
          kind: 'ok' as const,
          schoolKey,
          presentAt: now,
          duringDoors: decision.countsTowardQualification,
          minPlayers,
        };
      }

      tx.update(playerRef, { lastSeenAt: now });
      return {
        kind: 'ok' as const,
        schoolKey,
        presentAt: existingPresentAt as Timestamp,
        duringDoors: player.duringDoors === true,
        minPlayers,
      };
    });

    if (outcome.kind === 'not_found') {
      res.status(404).json({ error: 'tournament_not_found' });
      return;
    }

    if (outcome.kind === 'doors_not_open') {
      res.status(409).json({ error: 'doors_not_open', state: outcome.state ?? null });
      return;
    }

    if (outcome.kind === 'not_registered') {
      res.status(403).json({ error: 'not_registered' });
      return;
    }

    const marked = outcome;
    const minPlayers = outcome.minPlayers;

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
