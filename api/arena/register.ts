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
 * The player row also carries WHERE THE STUDENT IS — `city` and `department`,
 * read server-side off their own leaderboard entry. See `playerGeography()`.
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
import type { Firestore } from 'firebase-admin/firestore';
import { requireAuthDecoded } from '../_lib/requireAuth';
import { getDb } from '../_lib/firebaseAdmin';
import { findCommune, findDepartment } from '../../shared/haitiCommunes';
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

/** Where a student is, as THEY stated it. Null is the common, honest answer. */
interface PlayerGeography {
  /** Their ville, folded onto the canonical spelling in haitiGeo.ts. */
  city: string | null;
  /** Their département, canonical. Present when the ville is, and sometimes
   *  alone — the Diaspora entry has no ville list to pick from. */
  department: string | null;
}

/**
 * The registering student's own geography, read server-side.
 *
 * ── WHY IT IS COPIED ONTO THE PLAYER ROW AND NOT JOINED AT RENDER TIME ──────
 *
 * The broadcast reads ONE collection per tick — `tournaments/{tid}/players` —
 * and turns it into a board and a map. Joining geography at render time means a
 * per-uid read of `leaderboards/all-time/entries/*` for every player on every
 * tick: a few hundred players at one tick a second is a fan-out that costs real
 * money for the length of the tournament and adds a round-trip to the one part
 * of the product that cannot be late. The row is written once, at registration,
 * and read for free forever after.
 *
 * ── WHY IT IS READ HERE AND NOT ACCEPTED FROM THE CLIENT ────────────────────
 *
 * This goes on a public stream. A client-supplied `city` is a client-supplied
 * caption on a broadcast, and the whole Arena is server-authoritative for
 * exactly that reason. The student already chose this ville in their profile;
 * we read what they chose rather than what their app says they chose.
 *
 * ── WHY NULL IS KEPT AS NULL ────────────────────────────────────────────────
 *
 * Most students have no ville on their profile — it is an optional field on the
 * leaderboard form — and absent has to stay absent all the way to the map. The
 * neighbouring temptation, filling a school's commune in from where its
 * students live, is the mistake this product already shipped once and rebuilt
 * `schools-seed.json` to undo. The inverse is just as wrong: a student's ville
 * is never inferred from their school either. Unknown is a value.
 *
 * A free-typed legacy value ("Port au Prince", from before the picker existed)
 * is FOLDED onto the canonical spelling rather than dropped or stored raw — the
 * map joins on spelling, so an unfolded name is a pin that lands nowhere. A
 * value that resolves to nothing at all stays null rather than travelling on as
 * a name no map can place.
 *
 * Costs one document read. `publicDisplayName()` reads the same document a few
 * lines above; the duplicate read is deliberate rather than reaching into
 * `_shared.ts` to fuse them, because the alias rule is shared by four surfaces
 * and must keep being written in exactly one place.
 */
async function playerGeography(db: Firestore, uid: string): Promise<PlayerGeography> {
  try {
    const entry = (await db.doc(`leaderboards/all-time/entries/${uid}`).get()).data();
    if (!entry) return { city: null, department: null };

    const resolved = findCommune(typeof entry.city === 'string' ? entry.city : null);
    if (resolved) return { city: resolved.commune, department: resolved.department };

    // No usable ville, but the département may still be stated — and for a
    // student abroad it is the only geography there will ever be.
    return { city: null, department: findDepartment(typeof entry.department === 'string' ? entry.department : null) };
  } catch (err) {
    // Best-effort, exactly like publicDisplayName: a student must never fail to
    // register because the board entry we wanted to decorate their pin with
    // could not be read.
    console.error('[arena/register] geography lookup failed:', err);
    return { city: null, department: null };
  }
}

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

    const [displayName, label, geo] = await Promise.all([
      publicDisplayName(db, uid, tokenName),
      schoolLabel(db, schoolKey),
      playerGeography(db, uid),
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
          // Where the STUDENT is — never where their school is, and never the
          // other way round. Written explicitly as null when unknown so the
          // field exists on every row and the map's "unplaced" count is read
          // off the data instead of off a missing key.
          city: geo.city,
          department: geo.department,
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
        // Geography is refreshed too: a student who fills in their ville and
        // then re-submits the sheet during `doors` should appear on the map,
        // and a stale null here would leave them off it all night.
        tx.update(playerRef, {
          displayName,
          schoolKey,
          schoolLabel: label,
          grade,
          city: geo.city,
          department: geo.department,
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
