/**
 * Vercel serverless function: POST /api/arena/state
 * ────────────────────────────────────────────────────────────────────────────
 * The door the run console was missing.
 *
 * `firestore.rules` denies every client write under `tournaments/**`, and
 * `advance` performs exactly one transition (`live → grading`) as a side effect
 * of the clock. That left six of the seven moves in the state machine — open
 * registration, open the doors, start, publish provisional, finalise, void —
 * with no way to happen at all, and no way to create the tournament document in
 * the first place. The console rendered those controls, gated them correctly,
 * and could not act on any of them.
 *
 * Three things this file refuses to do, each for a reason that cost somebody an
 * event somewhere:
 *
 *  · It never decides WHICH transition is legal. `canTransition` in
 *    shared/arena/state.ts is the only definition, and this route reads the
 *    current state inside the same transaction that writes the next one — so
 *    two admins pressing "start" at 18:00:00 produce one start and one 409,
 *    not two `ROUND_START` sequences over a live question.
 *  · It never starts a tournament whose questions are not all authored.
 *    `advance` treats a missing `questions/{index}` as `missing_question` and
 *    stops, which on a stream is a dead screen at question 14 with 300 students
 *    watching. Counting them here costs one small read before anything is live.
 *  · It never lets a browser hold `CRON_SECRET`. The console authenticates as
 *    a signed-in admin; `authorizeCronOrAdmin` is the single definition of who
 *    that is, shared with `advance`, `aggregate` and `doors-close`.
 *
 * ── The podium write ───────────────────────────────────────────────────────
 * Entering `provisional` is the moment the podium is announced, so it is also
 * the moment the published 72-hour claim window starts running. `rollDown` in
 * claim.ts reads a MISSING claim document as "no deadline has passed" and
 * leaves the prize where it is — correct in isolation, and a prize nobody ever
 * claims would sit there forever. So this route stamps a placeholder `open`
 * claim for each prize rank as the podium is published, which is the caller's
 * half of the contract claim.ts documents ("the window still runs from the
 * moment the podium was published, which the caller stamps onto a placeholder
 * claim"). Existing claims are never overwritten: re-running this must not
 * hand a student a fresh 72 hours or erase a verification.
 *
 * ── The three broadcast events only this file can see ─────────────────────
 * `shared/arena/events.ts` derives events from a change in the STANDINGS; it
 * never sees a STATE transition, so `TOURNAMENT_OPEN`, `CHAMPION_SCHOOL` and
 * `CHAMPION_INDIVIDUAL` have to be emitted from here, at the edges only this
 * route drives:
 *
 *  · `TOURNAMENT_OPEN` on `doors -> live` ("start"). Priority 10, a 60s hold
 *    -- the bridge moment where the pre-show (rendered directly, outside the
 *    director, while the state is `registration`/`doors`) hands off to the
 *    director for the rest of the night. `registrationCounts` is the one
 *    Firestore scan this file allows itself: bounded like every other scan in
 *    this engine, and safe here for the same reason it is unsafe everywhere
 *    else -- this runs once, on a transition an admin presses by hand, never
 *    on a tick.
 *  · `CHAMPION_SCHOOL` / `CHAMPION_INDIVIDUAL` on `grading -> provisional`,
 *    built from the SAME standings read that decides the placeholder claims
 *    two paragraphs up -- one board, one podium, one set of prizes, so the
 *    champion the broadcast reveals and the claims the students see can never
 *    name a different order. Provisional, not final: nothing here asserts a
 *    result. The scenes that render these payloads carry that line themselves.
 *
 * All three go through `appendEvents`, which will only accept a standings
 * snapshot read INSIDE the same transaction that writes them -- see
 * `api/arena/_events.ts` for why: a snapshot read anywhere else is the exact
 * race that let one writer's event silently overwrite another's.
 *
 * Requests (POST):
 *   { tournamentId, to, reason? }              → transition
 *   { action: 'create', tournamentId, … }      → create a `draft` tournament
 *
 * Responses: 200 { ok, from, to, … } · 400 invalid input · 401 unauthorized ·
 *   403 not_admin · 404 not_found · 409 illegal_transition / already_exists /
 *   questions_incomplete / no_standings · 429 rate limited · 500.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { getDb } from '../_lib/firebaseAdmin';
import { canTransition } from '../../shared/arena/state';
import {
  DEFAULT_MIN_PLAYERS,
  MAX_QUESTION_INDEX,
  asArenaState,
  authorizeCronOrAdmin,
  boundedInt,
  isValidTournamentId,
  parseBody,
  toMillis,
} from './_shared';
import { CLAIM_WINDOW_MS, loadClaims } from './claim';
import { blockersFor } from './review';
import { correctIndividuals, type FinalBlocker } from '../../shared/arena/review';
import {
  appendEvents,
  boardOf,
  championSchoolFrom,
  podiumFrom,
  registrationCounts,
  type ArenaEventDraft,
} from './_events';
import type {
  ChampionIndividualPayload,
  ChampionSchoolPayload,
  TournamentOpenPayload,
} from '../../shared/arena/events';

type Row = Record<string, unknown>;

/** Section C's defaults. A tournament may override each one at creation. */
export const DEFAULT_QUESTION_COUNT = 25;
export const DEFAULT_TEAM_SIZE = 5;
/** Cents USD, biggest first — $100 / $50 / $25. */
export const DEFAULT_PRIZES = [10_000, 5_000, 2_500];

const str = (v: unknown, max = 120): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// ── Creation ────────────────────────────────────────────────────────────────

export interface TournamentDraft {
  slug: string;
  title: string;
  titleHt: string;
  state: 'draft';
  startsAt: number;
  doorsAt: number;
  questionCount: number;
  teamSize: number;
  minPlayers: number;
  prizes: { individual: number[] };
  rounds: unknown[];
  currentRound: null;
  currentQuestion: null;
}

/**
 * A tournament document, validated.
 *
 * `doorsAt` defaults to ten minutes before `startsAt` rather than being
 * required: the doors screen IS the ten minutes before the first question, and
 * a creation form that makes you type both invites the pair that disagree.
 */
export function validateCreate(tid: string, body: Row): { ok: true; value: TournamentDraft } | { ok: false; reason: string } {
  const title = str(body.title, 80);
  if (title.length < 3) return { ok: false, reason: 'title' };

  const startsAt = toMillis(body.startsAt);
  if (startsAt === null || startsAt <= 0) return { ok: false, reason: 'startsAt' };

  const doorsAtRaw = toMillis(body.doorsAt);
  const doorsAt = doorsAtRaw === null || doorsAtRaw <= 0 ? startsAt - 10 * 60_000 : doorsAtRaw;
  if (doorsAt > startsAt) return { ok: false, reason: 'doorsAt' };

  const questionCount = boundedInt(body.questionCount ?? DEFAULT_QUESTION_COUNT, 1, MAX_QUESTION_INDEX + 1);
  if (questionCount === null) return { ok: false, reason: 'questionCount' };

  const teamSize = boundedInt(body.teamSize ?? DEFAULT_TEAM_SIZE, 1, 50);
  if (teamSize === null) return { ok: false, reason: 'teamSize' };

  const minPlayers = boundedInt(body.minPlayers ?? DEFAULT_MIN_PLAYERS, 1, 50);
  if (minPlayers === null) return { ok: false, reason: 'minPlayers' };
  // `rankSchools` reads qualification off the pool it is handed, so a
  // tournament needing fewer players present than it scores would report a
  // school as qualified on a pool that cannot fill its own counting five.
  if (minPlayers < teamSize) return { ok: false, reason: 'minPlayers' };

  const prizesRaw = Array.isArray(body.prizes) ? body.prizes : DEFAULT_PRIZES;
  const prizes: number[] = [];
  for (const p of prizesRaw) {
    const cents = boundedInt(p, 0, 10_000_00);
    if (cents === null) return { ok: false, reason: 'prizes' };
    prizes.push(cents);
  }
  if (prizes.length > 10) return { ok: false, reason: 'prizes' };

  return {
    ok: true,
    value: {
      slug: tid,
      title,
      titleHt: str(body.titleHt, 80) || title,
      state: 'draft',
      startsAt,
      doorsAt,
      questionCount,
      teamSize,
      minPlayers,
      prizes: { individual: prizes },
      rounds: Array.isArray(body.rounds) ? body.rounds.slice(0, 20) : [],
      currentRound: null,
      currentQuestion: null,
    },
  };
}

// ── The podium's placeholder claims ─────────────────────────────────────────

export interface PlaceholderClaim {
  uid: string;
  rank: number;
  prizeCents: number;
  state: 'open';
  expiresAt: number;
  finishRank: number;
}

/**
 * One placeholder per prize rank, from the board that was announced.
 *
 * Ranks are read from the standings rather than from array position, because
 * `rankSchools`/`rankIndividuals` may return a tie sharing a rank, and paying
 * the second row of a tie as though it finished second is the kind of error
 * that is discovered in public.
 */
export function podiumClaims(
  individuals: unknown,
  prizeCents: unknown,
  now: number,
): PlaceholderClaim[] {
  const rows = Array.isArray(individuals) ? individuals : [];
  const prizes = Array.isArray(prizeCents) ? prizeCents : [];
  const out: PlaceholderClaim[] = [];
  const seen = new Set<number>();

  for (const raw of rows) {
    const row = (raw ?? {}) as Row;
    const uid = str(row.uid, 128);
    const rank = typeof row.rank === 'number' ? Math.trunc(row.rank) : 0;
    if (!uid || rank < 1 || rank > prizes.length) continue;
    // A tie at a paying rank is a human decision, not an automatic double
    // payment: the first row keeps the placeholder and the rest are left for
    // the review queue, exactly as an unclaimed prize would be.
    if (seen.has(rank)) continue;
    const cents = prizes[rank - 1];
    if (typeof cents !== 'number' || !Number.isFinite(cents) || cents <= 0) continue;

    seen.add(rank);
    out.push({
      uid,
      rank,
      prizeCents: cents,
      state: 'open',
      expiresAt: now + CLAIM_WINDOW_MS,
      finishRank: rank,
    });
  }
  return out;
}

/**
 * How many questions are fully authored?
 *
 * `answerIndex >= 0` is the same test the authoring endpoint's `authored` flag
 * uses, so the console's "18 / 25 rédigées" and this gate cannot disagree.
 */
async function authoredCount(db: Firestore, tid: string): Promise<number> {
  const snap = await db.collection(`tournaments/${tid}/questions`).get();
  let n = 0;
  for (const doc of snap.docs) {
    const answerIndex = (doc.data() as Row).answerIndex;
    if (typeof answerIndex === 'number' && answerIndex >= 0) n += 1;
  }
  return n;
}

// ── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const db = getDb();
  const actor = await authorizeCronOrAdmin(req, res, db, 'arena-state');
  if (!actor) return;

  const body = parseBody(req);
  const tid = body.tournamentId ?? body.tid ?? req.query.tid;
  if (!isValidTournamentId(tid)) {
    res.status(400).json({ error: 'invalid_tournament_id' });
    return;
  }

  const ref = db.doc(`tournaments/${tid}`);
  const now = Date.now();

  try {
    // ── Create ────────────────────────────────────────────────────────────
    if (str(body.action, 20) === 'create') {
      const parsed = validateCreate(tid, body);
      if (!parsed.ok) {
        res.status(400).json({ error: 'invalid_tournament', field: parsed.reason });
        return;
      }

      const created = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists) return false;
        tx.set(ref, {
          ...parsed.value,
          counts: { schools: 0, players: 0, qualifiedSchools: 0 },
          createdAt: Timestamp.fromMillis(now),
          createdBy: actor.label,
        });
        return true;
      });

      if (!created) {
        res.status(409).json({ error: 'already_exists' });
        return;
      }
      res.status(200).json({ ok: true, created: true, tournamentId: tid, state: 'draft' });
      return;
    }

    // ── Transition ────────────────────────────────────────────────────────
    const to = asArenaState(body.to);
    if (!to) {
      res.status(400).json({ error: 'invalid_state' });
      return;
    }
    // A void is the one move that erases an event students were told was
    // happening, so it carries its reason into the document rather than living
    // only in somebody's memory of the night.
    const reason = str(body.reason, 300);
    if (to === 'void' && reason.length < 4) {
      res.status(400).json({ error: 'reason_required' });
      return;
    }

    // Read-before-write outside the transaction ONLY to answer cheaply; the
    // transaction below re-reads and is the one that decides.
    const pre = await ref.get();
    if (!pre.exists) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const tournament = pre.data() as Row;
    const from = asArenaState(tournament.state) ?? 'draft';

    if (!canTransition(from, to)) {
      res.status(409).json({ error: 'illegal_transition', from, to });
      return;
    }

    // Starting: every question must exist before the first one is delivered.
    // `roster` is TOURNAMENT_OPEN's payload — counted here, once, rather than
    // from inside the transaction below: it is a scan bounded by players, not
    // by schools, and this route allows itself that ONLY because it runs once
    // per tournament, on a transition an admin presses by hand.
    let roster: { players: number; schools: number } | null = null;
    if (to === 'live') {
      const total = typeof tournament.questionCount === 'number' ? tournament.questionCount : 0;
      const authored = await authoredCount(db, String(tid));
      if (total <= 0 || authored < total) {
        res.status(409).json({ error: 'questions_incomplete', authored, required: total });
        return;
      }
      // CORRECTION, from an external audit: starting used to have no
      // dependency on the qualification roster at all, so an admin who
      // pressed "start" before `api/arena/doors-close.ts` had run — or ran
      // early, ahead of it — sent the tournament live with no frozen roster.
      // Every school's `roster/{schoolKey}` doc, and the "N écoles qualifiées"
      // count the review flow reads, would then be reporting a freeze that
      // never happened. `rosterFrozenAt` is the one fact that can't be
      // reconstructed after the room has emptied, so starting without it is
      // refused rather than silently proceeding on an unfrozen roster.
      if (toMillis(tournament.rosterFrozenAt) === null) {
        res.status(409).json({
          error: 'roster_not_frozen',
          message: 'The qualification roster has not been frozen yet. Run doors-close before starting.',
        });
        return;
      }
      roster = await registrationCounts(db, String(tid));
    }

    // The podium: the board that will be announced must exist before we say it
    // has been. Publishing `provisional` with no standings would show a podium
    // of nobody and start three claim windows against it.
    let placeholders: PlaceholderClaim[] = [];
    if (to === 'provisional') {
      const standings = await db.doc(`tournaments/${tid}/standings/current`).get();
      if (!standings.exists) {
        res.status(409).json({ error: 'no_standings' });
        return;
      }
      placeholders = podiumClaims(
        (standings.data() as Row).individuals,
        ((tournament.prizes ?? {}) as Row).individual,
        now,
      );

      // Anything already on file stays on file. `create` on an existing
      // document would fail the whole transaction, so a student who claimed
      // early must not be able to block the podium from being published.
      const existing = await db.collection(`tournaments/${tid}/claims`).get();
      const claimed = new Set(existing.docs.map((d) => d.id));
      placeholders = placeholders.filter((c) => !claimed.has(c.uid));
    }

    /*
     * ── The finalisation gate ────────────────────────────────────────────
     *
     * CORRECTION, from an external audit (E8): `provisional -> final` had no
     * gate of any kind. `canTransition` allows it and nothing else looked, so
     * the button that RELEASES THE PRIZE MONEY could be pressed with a claim
     * window still running, a tie nobody had adjudicated, or a flagged
     * finisher nobody had ruled on.
     *
     * `finalBlockers` is scoped to the paying ranks — see the reasoning in
     * `shared/arena/review.ts`. A gate that fires on every flag in the
     * tournament is a gate that gets overridden every time, and therefore
     * protects nothing.
     *
     * The override is real, because a real night needs one: a prize nobody
     * can be paid, a claim the student has abandoned by phone, an event that
     * has to close tonight. It costs a stated reason, and the reason and the
     * exact list it overrode are written onto the tournament. An escape hatch
     * that cannot be used silently is a different object from no gate.
     */
    let blockers: FinalBlocker[] = [];
    let corrected: ReturnType<typeof correctIndividuals> | null = null;
    let announcedBoard: Row | null = null;

    if (to === 'final') {
      const [standingsSnap, claims, reviewsSnap] = await Promise.all([
        db.doc(`tournaments/${tid}/standings/current`).get(),
        loadClaims(db, String(tid)),
        db.collection(`tournaments/${tid}/reviews`).get(),
      ]);

      announcedBoard = standingsSnap.exists ? (standingsSnap.data() as Row) : null;
      const individuals = Array.isArray(announcedBoard?.individuals)
        ? (announcedBoard?.individuals as Array<Row & { uid: string; rank: number }>)
        : [];

      const reviews = reviewsSnap.docs.map((doc) => ({
        uid: doc.id,
        decision: (doc.data() as Row).decision as 'cleared' | 'disqualified',
        note: null,
        reviewedBy: '',
        reviewedAt: null,
        flags: [],
      })).filter((r) => r.decision === 'cleared' || r.decision === 'disqualified');

      // Flags come off the player rows of everyone who could be paid. Bounded
      // by the prize count and the claim list, never by the player count.
      const uids = [...new Set([
        ...individuals.slice(0, 25).map((row) => String(row.uid)),
        ...claims.map((claim) => claim.uid),
      ])].filter((uid) => uid !== '');
      const players = uids.length > 0
        ? await db.getAll(...uids.map((uid) => db.doc(`tournaments/${tid}/players/${uid}`)))
        : [];

      blockers = blockersFor({
        tournament,
        board: individuals.map((row) => ({
          uid: String(row.uid),
          rank: Math.trunc(Number(row.rank) || 0),
          displayName: '',
          schoolShort: '',
          schoolKey: typeof row.schoolKey === 'string' ? row.schoolKey : '',
          score: 0,
        })).filter((row) => row.uid !== '' && row.rank > 0),
        claims,
        reviews,
        players: players as unknown as Array<{ id: string; exists: boolean; data: () => Row | undefined }>,
        now,
      });

      const override = body.override === true;
      if (blockers.length > 0 && !override) {
        res.status(409).json({
          error: 'verification_incomplete',
          blockers,
          message: 'Resolve these, or finalise with `override` and a reason.',
        });
        return;
      }
      if (blockers.length > 0 && reason.length < 4) {
        res.status(400).json({ error: 'reason_required', blockers });
        return;
      }

      /*
       * The corrected official board. `aggregateOne` refuses to run in
       * `provisional` — that board has been read out on a stream — so the
       * correction is applied here, once, by removing the disqualified rows
       * and closing the gaps. The announced board is KEPT at
       * `standings/provisional` rather than overwritten into nothing: it is
       * what students watched, and a correction you cannot compare against
       * the original is not a correction anybody can check.
       */
      const disqualified = new Set(
        reviews.filter((r) => r.decision === 'disqualified').map((r) => r.uid),
      );
      if (disqualified.size > 0 && individuals.length > 0) {
        corrected = correctIndividuals(
          individuals as Array<{ uid: string; rank: number; schoolKey?: string }>,
          disqualified,
        );
      }
    }

    // Both event-emitting transitions need `standings/current` read INSIDE the
    // transaction that writes — `appendEvents` allocates `seq` from exactly
    // that snapshot, and a snapshot read anywhere else is the race
    // `api/arena/_events.ts` exists to close. Read unconditionally rather than
    // only when needed: a conditional read after a write aborts a Firestore
    // transaction, and every other branch here is a no-op read on a document
    // already open for this transaction.
    const standingsRef = db.doc(`tournaments/${tid}/standings/current`);

    const outcome = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { ok: false as const, error: 'not_found' as const };
      const current = asArenaState((snap.data() as Row).state) ?? 'draft';
      // The state may have moved between the read above and this transaction —
      // `advance` writes `grading` on its own schedule, and two admins share
      // one console.
      if (!canTransition(current, to)) {
        return { ok: false as const, error: 'illegal_transition' as const, from: current };
      }

      const standingsSnap = await tx.get(standingsRef);

      const patch: Row = {
        state: to,
        [`${to}At`]: Timestamp.fromMillis(now),
        stateChangedBy: actor.label,
      };
      if (reason) patch.stateReason = reason;
      tx.update(ref, patch);

      // ── The three events only this route can see ──────────────────────────
      //
      // Idempotence is inherited, not re-implemented: `canTransition(s, s)` is
      // false for every state (`shared/arena/state.ts`, tested exhaustively in
      // `src/utils/__tests__/arenaState.test.ts`), and the guard above already
      // ran before this line. A retry that finds the tournament already `live`
      // is refused as `illegal_transition` and never reaches this array — so
      // TOURNAMENT_OPEN cannot be emitted twice by a scheduler or a
      // double-pressed console button, for the same reason `ROUND_START`
      // cannot in `advance.ts`: the only path to the emitting code is the one
      // that actually performs the transition, and that transition happens
      // exactly once by construction.
      const drafts: ArenaEventDraft[] = [];

      if (to === 'live' && roster) {
        // Sequence 1's bridge moment — the pre-show hands off to the director
        // right here. Priority 10, a 60s hold: this is the only scene the
        // director shows before the first `ROUND_START`, so it earns the
        // screen rather than sharing it.
        drafts.push({
          type: 'TOURNAMENT_OPEN',
          payload: { schools: roster.schools, players: roster.players } satisfies TournamentOpenPayload,
          round: 0,
          questionIndex: -1,
        });
      }

      if (to === 'provisional') {
        // Read from the transaction's OWN fresh board, not from the
        // `standings` fetched above for the claim placeholders — a tick
        // could have moved the board in the gap between that read and this
        // transaction, and the champion this reveals must be the champion
        // the transaction is actually about to announce.
        const { schools, individuals } = boardOf(
          standingsSnap.exists ? (standingsSnap.data() as Row) : null,
        );
        const champion = championSchoolFrom(schools, individuals);
        if (champion) {
          drafts.push({
            type: 'CHAMPION_SCHOOL',
            payload: {
              school: champion.school,
              teamAvg: champion.teamAvg,
              top5: champion.top5,
            } satisfies ChampionSchoolPayload,
            round: 0,
            questionIndex: -1,
          });
        }
        const podium = podiumFrom(individuals, 3);
        if (podium.length > 0) {
          drafts.push({
            type: 'CHAMPION_INDIVIDUAL',
            // The full standing row, not a hand-picked subset: `podiumFrom`
            // already returns exactly ranks 1..3, and re-narrowing the fields
            // here is a second, driftable copy of what `IndividualStanding`
            // carries — the scene reads whatever fields it needs from it.
            payload: { podium } satisfies ChampionIndividualPayload,
            round: 0,
            questionIndex: -1,
          });
        }
        // A board with no ranked school or no ranked player at all is not an
        // error — `championSchoolFrom`/`podiumFrom` already refuse to invent
        // one — it is a tournament with no qualified competitors, and the
        // transition still completes: `to === 'provisional'` already checked
        // `standings/current` EXISTS above, which is the only thing that gates
        // this move.
      }

      if (drafts.length > 0) {
        appendEvents(tx, db, String(tid), standingsSnap, drafts, now);
      }

      // Placeholders are created, never overwritten: a student who already
      // claimed must not be handed a fresh 72 hours, and a verified claim must
      // not be reset to `open`.
      for (const claim of placeholders) {
        tx.create(db.doc(`tournaments/${tid}/claims/${claim.uid}`), {
          ...claim,
          expiresAt: Timestamp.fromMillis(claim.expiresAt),
          claimedAt: null,
          guardian: null,
          contact: null,
          reviewedBy: null,
          reviewNote: null,
          rolledDownFrom: null,
          createdAt: Timestamp.fromMillis(now),
        });
      }

      if (to === 'final') {
        if (blockers.length > 0) {
          // Overridden. What was overridden, by whom, and why — on the record.
          tx.update(ref, {
            finalOverride: {
              by: actor.label,
              reason,
              at: Timestamp.fromMillis(now),
              blockers: blockers.map((b) => ({ rank: b.rank, why: b.why, uids: b.uids })),
            },
          });
        }
        if (corrected && announcedBoard) {
          tx.set(db.doc(`tournaments/${tid}/standings/provisional`), {
            ...announcedBoard,
            archivedAt: Timestamp.fromMillis(now),
          });
          tx.update(standingsRef, {
            individuals: corrected.individuals,
            correctedAt: Timestamp.fromMillis(now),
            correctedRemoved: corrected.removed.map((row) => row.uid),
            // Named, not adjusted: a school's standing is the mean of a
            // best-five this board does not carry, so there is nothing here
            // to recompute it with. See `correctIndividuals`.
            schoolsNeedRecount: corrected.affectedSchools,
          });
        }
      }

      return { ok: true as const, from: current, eventsEmitted: drafts.length };
    });

    if (!outcome.ok) {
      const status = outcome.error === 'not_found' ? 404 : 409;
      res.status(status).json({ error: outcome.error, from: outcome.error === 'illegal_transition' ? outcome.from : undefined, to });
      return;
    }

    res.status(200).json({
      ok: true,
      tournamentId: tid,
      from: outcome.from,
      to,
      claimsOpened: placeholders.length,
      eventsEmitted: outcome.eventsEmitted,
      ...(to === 'final' ? {
        overrode: blockers.length > 0 ? blockers : undefined,
        removedFromBoard: corrected ? corrected.removed.map((row) => row.uid) : [],
        schoolsNeedRecount: corrected ? corrected.affectedSchools : [],
      } : {}),
    });
  } catch (err) {
    console.error('[arena/state] failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}
