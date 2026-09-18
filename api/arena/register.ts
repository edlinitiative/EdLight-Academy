/**
 * Vercel serverless function: POST /api/arena/register
 * ────────────────────────────────────────────────────────────────────────────
 * A student enters an Arena tournament: picks the school they are playing for,
 * attests their grade, and gets a player row.
 *
 * Server-authoritative like every other /api/arena/* route — the client posts
 * and the server decides. Firestore rules deny all client writes under
 * `tournaments/*` and `tournamentRegistrations/*`, because this is the one
 * feature in the product where being wrong costs somebody money.
 *
 * Two documents, deliberately separate (section C):
 *   `tournamentRegistrations/{tid}_{uid}` — the auditable claim: school, grade,
 *       attestation time, device hash. Independent of play.
 *   `tournaments/{tid}/players/{uid}`     — the scoreboard row: zeroed, eligible.
 *
 * Both ids are composite and derived, never generated. Re-registering therefore
 * overwrites one row instead of minting a second — the idempotency is in the
 * key, not in a check that could race with itself.
 *
 * Request body (Authorization: Bearer <Firebase ID token>):
 *   { tournamentId: string, schoolKey: string, grade: string, deviceHash?: string }
 *
 * Response 200:
 *   { ok: true, qualified, playersAtSchool, needed, basis, present, registered }
 *   `basis` says WHICH count `qualified` was computed from — see below, it is
 *   the difference between a promise and a lie.
 *
 * Errors: 400 invalid input · 403 grade_not_eligible · 404 tournament_not_found ·
 *         409 registration_closed · 429 rate limited · 500 write_failed.
 *
 * Rate limiting: the `arena-register` bucket, which FAILS CLOSED.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { requireAuthDecoded } from '../_lib/requireAuth';
import { getDb } from '../_lib/firebaseAdmin';
import {
  DEFAULT_MIN_PLAYERS,
  asArenaState,
  enforceRateLimit,
  isEligibleGrade,
  isRegistrationOpen,
  isValidSchoolKey,
  isValidTournamentId,
  normalizeDeviceHash,
  parseBody,
  publicDisplayName,
  schoolCounts,
  schoolLabel,
} from './_shared';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const decoded = await requireAuthDecoded(req, res);
  if (!decoded) return;
  const { uid, name: tokenName } = decoded;

  if (!(await enforceRateLimit(res, uid, 'arena-register'))) return;

  // ── Validate input ──────────────────────────────────────────────────────
  const body = parseBody(req);

  const tournamentId = body.tournamentId;
  if (!isValidTournamentId(tournamentId)) {
    res.status(400).json({ error: 'invalid_tournament_id' });
    return;
  }

  const schoolKey = body.schoolKey;
  if (!isValidSchoolKey(schoolKey)) {
    res.status(400).json({ error: 'invalid_school_key' });
    return;
  }

  const grade = body.grade;
  if (typeof grade !== 'string' || !grade) {
    res.status(400).json({ error: 'invalid_grade' });
    return;
  }
  if (!isEligibleGrade(grade)) {
    // POSTBAC is the case this exists for: the Arena is a primary-and-secondary
    // tournament, so a préfac student is not eligible. ATTESTED, NOT PROVEN —
    // nothing here verifies the grade, the student asserts it. What makes the
    // assertion carry weight is that it is RECORDED (`attestedAt` below) and
    // that verification happens at claim, for winners only. Recording the claim
    // is what turns a later removal into the published rule working, rather
    // than an argument about what somebody said in September.
    res.status(403).json({
      error: 'grade_not_eligible',
      message: 'Konkou sa a se pou elèv primè ak segondè.',
    });
    return;
  }

  const deviceHash = normalizeDeviceHash(body.deviceHash);

  const db = getDb();

  try {
    // ── The tournament must be open ───────────────────────────────────────
    const tSnap = await db.doc(`tournaments/${tournamentId}`).get();
    if (!tSnap.exists) {
      res.status(404).json({ error: 'tournament_not_found' });
      return;
    }
    const tournament = tSnap.data() ?? {};
    const state = asArenaState(tournament.state);
    if (!state) {
      // A tournament whose state is not one of ours is a broken document, and
      // guessing would open registration on something an admin has not published.
      console.error('[arena/register] unknown state on', tournamentId, ':', tournament.state);
      res.status(409).json({ error: 'registration_closed' });
      return;
    }
    if (!isRegistrationOpen(state)) {
      res.status(409).json({ error: 'registration_closed', state });
      return;
    }

    const minPlayers = typeof tournament.minPlayers === 'number' && tournament.minPlayers > 0
      ? tournament.minPlayers
      : DEFAULT_MIN_PLAYERS;

    const [displayName, label] = await Promise.all([
      publicDisplayName(db, uid, tokenName),
      schoolLabel(db, schoolKey),
    ]);

    const regRef = db.doc(`tournamentRegistrations/${tournamentId}_${uid}`);
    const playerRef = db.doc(`tournaments/${tournamentId}/players/${uid}`);

    // ── Write both rows in one transaction ────────────────────────────────
    //
    // Transactional because the player row must be created ONLY if it does not
    // already exist. A student who re-opens the sheet and re-submits — to
    // correct their school, or because the first response was lost — must not
    // have their score zeroed. During `doors`, and for the seconds either side
    // of the first question, that is not hypothetical: it would delete points
    // a student had already earned, silently, on a request that looked like it
    // succeeded.
    await db.runTransaction(async (tx) => {
      const playerSnap = await tx.get(playerRef);
      const now = Timestamp.now();

      tx.set(
        regRef,
        {
          uid,
          tid: tournamentId,
          schoolKey,
          grade,
          eligible: true,
          deviceHash,
          // The attestation is stamped on every submission. The student is
          // re-asserting the claim each time they change it, and a stale
          // `attestedAt` beside a changed grade would misdate the claim we
          // would later be defending.
          attestedAt: now,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      if (!playerSnap.exists) {
        tx.set(playerRef, {
          uid,
          displayName,
          schoolKey,
          schoolLabel: label,
          grade,
          score: 0,
          correct: 0,
          answered: 0,
          totalMs: 0,
          // Tiebreaker 3 for individuals in shared/arena/scoring.ts. Not listed
          // in section C's player shape, but rankIndividuals reads it, and a
          // podium tie broken by an absent field is a tie broken by `undefined`.
          fullTierCount: 0,
          streak: 0,
          bestStreak: 0,
          rank: 0,
          schoolRank: 0,
          eligible: true,
          flags: [],
          presentAt: null,
          registeredAt: now,
          lastAnswerAt: null,
        });
      } else {
        // Identity may change; the scoreboard never does on this path.
        tx.update(playerRef, {
          displayName,
          schoolKey,
          schoolLabel: label,
          grade,
        });
      }
    });

    // ── Qualification progress, computed AFTER the write ──────────────────
    //
    // So the student sees themselves in the number. "CODOSA · 3/5" that does
    // not count the person reading it is the kind of off-by-one that makes a
    // student register twice.
    const counts = await schoolCounts(db, tournamentId, schoolKey);

    // WHICH number qualifies is the point of Decision 3 (2026-09-18): a
    // registered no-show does NOT count toward a school's five. During
    // `registration` nobody is present yet, so registrations are the only
    // progress there is to show and `basis` says so. Once the doors open,
    // presence is the test, and reporting the registered count as
    // "qualified" would tell a school it was safe on the strength of five
    // students who may not turn up. `basis` travels in the response so the
    // lobby can render the honest label — "5 inscrits · 3 présents" — rather
    // than a single number that means something different before and after 18:00.
    const basis: 'registered' | 'present' = state === 'doors' ? 'present' : 'registered';
    const playersAtSchool = basis === 'present' ? counts.present : counts.registered;

    res.status(200).json({
      ok: true,
      qualified: playersAtSchool >= minPlayers,
      playersAtSchool,
      needed: Math.max(0, minPlayers - playersAtSchool),
      basis,
      registered: counts.registered,
      present: counts.present,
      minPlayers,
      displayName,
      schoolLabel: label,
    });
  } catch (err) {
    console.error('[arena/register] error:', err);
    res.status(500).json({ error: 'write_failed' });
  }
}
