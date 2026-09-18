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
import { CLAIM_WINDOW_MS } from './claim';

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
    if (to === 'live') {
      const total = typeof tournament.questionCount === 'number' ? tournament.questionCount : 0;
      const authored = await authoredCount(db, String(tid));
      if (total <= 0 || authored < total) {
        res.status(409).json({ error: 'questions_incomplete', authored, required: total });
        return;
      }
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

      const patch: Row = {
        state: to,
        [`${to}At`]: Timestamp.fromMillis(now),
        stateChangedBy: actor.label,
      };
      if (reason) patch.stateReason = reason;
      tx.update(ref, patch);

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

      return { ok: true as const, from: current };
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
    });
  } catch (err) {
    console.error('[arena/state] failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}
