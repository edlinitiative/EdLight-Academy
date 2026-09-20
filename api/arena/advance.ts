/**
 * POST /api/arena/advance — the round clock.
 * ──────────────────────────────────────────
 * Opens the next question and closes the current one. Per Decision 2
 * (2026-09-18) the advance is AUTOMATED, with a deliberate pause between
 * questions; the run console keeps a manual override for the nights when the
 * host is still talking.
 *
 *     open ──20s── close ───── pause (10s) ───── open next
 *            │                  │
 *            │                  ├─ late answers still land and are shown
 *            │                  ├─ the correct answer is revealed
 *            │                  └─ standings settle, events emit
 *            └─ answers accepted
 *
 * Three decisions this file encodes, each with the failure it avoids:
 *
 *  · THE WINDOW ALWAYS CLOSES ON ITS TIMER, NEVER EARLY. Closing once
 *    "everyone" has answered is unworkable with thousands of players — someone
 *    is always disconnected, so the round would never close — and closing on a
 *    high percentile punishes exactly the slow connections the tier scoring
 *    exists to protect. The answer rate flattening is a BROADCAST signal, not a
 *    control signal.
 *  · THE LIVE DOCUMENT NEVER CARRIES `answerIndex`. Getting this wrong hands
 *    every client the answer key — `live/{index}` is readable by any signed-in
 *    player — and there is no recovering from it mid-tournament, so the payload
 *    is built field by field and then ASSERTED before it is written.
 *  · EVERY TRANSITION IS A TRANSACTION. This endpoint is driven by a scheduler
 *    AND by a human pressing a button; two calls arriving together must not
 *    open a question twice or skip one, so each step reads the document it is
 *    about to change inside the same transaction that changes it.
 *
 * Security: two doors, one decision (`authorizeCronOrAdmin` in `_shared`).
 * The scheduler presents `Authorization: Bearer <CRON_SECRET>` or
 * `x-cron-secret`; the run console's "force close" / "force next" present a
 * signed-in admin's ID token. The console cannot be given the cron secret — a
 * browser holding it hands the whole engine to whoever reads localStorage.
 *
 * ── WHAT ACTUALLY DRIVES THIS, AND WHAT DOES NOT ──────────────────────────
 *
 * CORRECTION, from an external audit (E3: "the interface promises automation
 * but no working runner is present in repository configuration"). Everything
 * above was written for a scheduler — the cron auth door, the transactional
 * steps that tolerate a scheduler and a human arriving together — and the run
 * console tells the host in as many words that "l'avance est automatique".
 * There was no scheduler. `vercel.json` listed crons for `aggregate`,
 * `doors-close` and the claim sweep and none for this endpoint, so the round
 * clock only ever moved when an admin pressed a button: twenty-five questions,
 * fifty clicks, timed by hand, live.
 *
 * `vercel.json` now schedules it every minute. Be precise about what that
 * buys, because it is NOT the cadence drawn above: Vercel's scheduler has a
 * one-minute floor, and one tick performs one transition, so a minute-granular
 * cron alone paces a question at about two minutes rather than thirty seconds.
 * What it guarantees is that a tournament CANNOT STALL unattended — the
 * watchdog Phase 1 asks for — and that every question eventually opens,
 * closes, reveals and settles without a human in the loop.
 *
 * Driving the real 20s/10s cadence needs a sub-minute runner, which is a
 * deployment decision with a running cost attached (an external scheduler, or
 * making one invocation hold the clock for its whole minute) rather than
 * something this file can settle on its own. Until that is chosen, the host
 * drives the pace from the console and this cron is the floor beneath them.
 *
 * Request  (POST): { tid: string, force?: boolean }
 * Response (200):  { ok: true, action, index?, state?, pauseMs }
 *   action ∈ waiting | opened | closed | finished | noop
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue, Timestamp, type Transaction } from 'firebase-admin/firestore';
import { getDb } from '../_lib/firebaseAdmin';
import { canTransition, type ArenaState } from '../../shared/arena/state';
import { authorizeCronOrAdmin } from './_shared';
import { aggregateOne } from './aggregate';
import {
  appendEvents,
  atStakeFrom,
  boardOf,
  emitKeyedEvents,
  loadQuestionStats,
  nameFastest,
  type ArenaEventDraft,
} from './_events';
import type {
  FinalQuestionPayload,
  GradingPayload,
  QuestionClosedPayload,
  RoundStartPayload,
} from '../../shared/arena/events';

// ── The cycle's two clocks ──────────────────────────────────────────────────

/**
 * How long a question accepts answers at full attention. The tier boundaries in
 * `shared/arena/scoring` (12s full, 20s half) are sized against this window.
 */
export const QUESTION_WINDOW_MS = 20_000;

/**
 * The gap between a question closing and the next one opening.
 *
 * This is where late answers land — a student on a bad connection whose answer
 * arrives at 21s is still submitting in good faith, and the pause makes that
 * visible instead of invisible — and it is where the broadcast plays its
 * moments. A guaranteed gap means the director never has to interrupt a live
 * question to show an overtake, which removes the hardest scheduling problem in
 * the whole broadcast design.
 */
export const PAUSE_MS = 10_000;

/**
 * INVARIANT: this must never be SHORTER than `LATE_GRACE_MS` in
 * api/arena/_shared.ts (also 10s). That constant is how long after `closesAt` a
 * submission is still accepted; a shorter pause would open the next question
 * while answers to the previous one were still landing, and a student would be
 * answering two questions at once on one screen.
 */

/**
 * Fields that must NEVER reach `tournaments/{tid}/live/*`.
 *
 * `answerIndex` is the whole integrity model. The others are authoring metadata
 * that leaks the same thing indirectly — an explanation written as "B is
 * correct because…" is an answer key with extra steps.
 */
export const FORBIDDEN_LIVE_FIELDS = ['answerIndex', 'answer', 'correctAnswer', 'explanation'] as const;

type Row = Record<string, unknown>;

const num = (v: unknown, fallback = 0): number =>
  (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

const str = (v: unknown, fallback = ''): string =>
  (typeof v === 'string' && v !== '' ? v : fallback);

const millis = (v: unknown): number => {
  if (v instanceof Timestamp) return v.toMillis();
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return 0;
};

// ── Pure logic (unit-tested in api/__tests__/arenaAggregate.test.ts) ─────────

export interface LiveQuestion {
  index: number;
  /** Monotonic across the tournament — how many questions have been opened. */
  seq: number;
  prompt: string;
  promptHt: string;
  options: unknown[];
  optionsHt: unknown[];
  opensAt: number;
  closesAt: number;
  state: 'pending' | 'open' | 'closed';
}

/**
 * The last line of defence before the answer key is published to every client.
 *
 * Deliberately a runtime check on the OBJECT ABOUT TO BE WRITTEN rather than a
 * type: the payload is assembled from a Firestore document whose shape the
 * compiler never sees, so a spread that someone "simplifies" into
 * `{ ...question, state: 'open' }` would type-check perfectly and ship the
 * answers. This throws instead, and a question that cannot be published
 * safely is not published at all.
 */
export function assertNoAnswerKey(payload: Row): void {
  for (const field of FORBIDDEN_LIVE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      throw new Error(`arena/advance: refusing to publish a live question carrying "${field}"`);
    }
  }
}

/**
 * Build the delivery document from an authored question.
 *
 * Field by field, never by spread — see `assertNoAnswerKey`. The assertion runs
 * on the result anyway, because the value of a belt is that it does not depend
 * on the braces having been fastened correctly.
 */
export function toLiveQuestion(
  question: Row,
  meta: { index: number; seq: number; opensAt: number; closesAt: number },
): LiveQuestion {
  const payload: LiveQuestion = {
    index: meta.index,
    seq: meta.seq,
    prompt: str(question.prompt),
    promptHt: str(question.promptHt),
    options: Array.isArray(question.options) ? question.options : [],
    optionsHt: Array.isArray(question.optionsHt) ? question.optionsHt : [],
    opensAt: meta.opensAt,
    closesAt: meta.closesAt,
    state: 'open',
  };
  assertNoAnswerKey(payload as unknown as Row);
  return payload;
}

export type AdvanceAction = 'waiting' | 'open' | 'close' | 'finish' | 'noop';

export interface AdvanceInput {
  now: number;
  /** Index of the question the tournament is currently on; -1 before the first. */
  index: number;
  /** `live/{index}.state`. Absent when nothing has been opened yet. */
  liveState: 'pending' | 'open' | 'closed' | null;
  closesAt: number;
  /** When `live/{index}` was closed, 0 if it is not closed. Gates the pause. */
  closedAt: number;
  totalQuestions: number;
  /** The run console's override. Bypasses the TIMERS — never the sequence. */
  force: boolean;
  /** Defaults to `PAUSE_MS`; a tournament may widen it for a longer show. */
  pauseMs?: number;
}

/**
 * What this invocation should do, from the clock alone.
 *
 * ONE transition per call, deliberately, and `force` does not change that. It
 * only lifts the two timer gates (the question's own window, and the pause), so
 * a host pressing "next" on a live question closes it, and pressing again opens
 * the following one. Collapsing both into a single forced call would erase the
 * pause — which is the slot where the correct answer is revealed and where the
 * late answers this design goes out of its way to accept actually land.
 *
 * Idempotence lives here too: every branch is decided from the CURRENT state of
 * `live/{index}`, so calling twice for the same index asks the same question
 * twice and gets `waiting` the second time rather than a double open.
 */
export function planAdvance(input: AdvanceInput): AdvanceAction {
  const { now, index, liveState, closesAt, closedAt, totalQuestions, force } = input;
  const pauseMs = typeof input.pauseMs === 'number' && Number.isFinite(input.pauseMs)
    ? Math.max(0, input.pauseMs)
    : PAUSE_MS;
  if (totalQuestions <= 0) return 'noop';

  // Nothing opened yet: the first question is simply the next one.
  if (index < 0) return 'open';

  // A `currentQuestion` pointing at a delivery document that does not exist is
  // corruption, not a state. Guessing costs either a skipped question or a
  // reopened one whose answers are already tiered against the old window, so
  // this refuses and leaves it for a human.
  if (liveState === null) return 'noop';

  if (liveState === 'open' || liveState === 'pending') {
    if (!force && now < closesAt) return 'waiting';
    return 'close';
  }

  // Closed. The last question closing ends the playing part of the tournament.
  if (index >= totalQuestions - 1) return 'finish';
  if (!force && now < closedAt + pauseMs) return 'waiting';
  return 'open';
}

// ── Firestore plumbing ──────────────────────────────────────────────────────

/** The round a question belongs to, from the tournament's `rounds` schedule. */
export function roundOf(rounds: unknown, index: number): number {
  if (!Array.isArray(rounds) || rounds.length === 0) return 0;
  let seen = 0;
  for (let i = 0; i < rounds.length; i += 1) {
    seen += num((rounds[i] as Row)?.questionCount, 0);
    if (index < seen) return num((rounds[i] as Row)?.index, i);
  }
  return num((rounds[rounds.length - 1] as Row)?.index, rounds.length - 1);
}

/**
 * The topic word the transition scene puts on screen.
 *
 * The authored question first, the round's own label second. Neither reveals
 * anything: a category is "Histoire", not an answer. Empty is fine — the scene
 * renders the index alone rather than an empty line.
 */
export function categoryOf(rounds: unknown, index: number, question: Row | null): string {
  const fromQuestion = str(question?.category);
  if (fromQuestion) return fromQuestion;
  if (!Array.isArray(rounds) || rounds.length === 0) return '';
  let seen = 0;
  for (const raw of rounds) {
    const round = (raw ?? {}) as Row;
    seen += num(round.questionCount, 0);
    if (index < seen) return str(round.category, str(round.label));
  }
  return '';
}

/** How many contenders `FINAL_QUESTION` names. More than this is a list, not a stake. */
const AT_STAKE_LIMIT = 5;

interface Outcome {
  action: 'waiting' | 'opened' | 'closed' | 'finished' | 'noop';
  index?: number;
  state?: ArenaState;
  /** The round the affected question belongs to — the event envelope needs it. */
  round?: number;
  error?: 'not_found' | 'missing_question' | 'illegal_transition';
}

/**
 * `QUESTION_CLOSED`, after the close has committed.
 *
 * The one event that cannot be emitted inside the transaction that produced its
 * edge: its payload summarises every answer to the question, and a transaction
 * holding the standings lock while it read ten thousand documents would fight
 * the aggregate tick for the whole pause. So it is emitted immediately
 * afterwards, under an idempotence key, and a failure here is swallowed — the
 * round clock is the one thing on this endpoint that must never stop, and a
 * missing scene is recoverable where a stalled tournament is not.
 */
async function emitQuestionClosed(
  db: FirebaseFirestore.Firestore,
  tid: string,
  index: number,
  round: number,
): Promise<void> {
  const stats = await loadQuestionStats(db, tid, index);
  // Null means the scan hit its cap: a percentage from an arbitrary page of the
  // submissions would be a made-up statistic on a projector. No event instead.
  if (!stats) return;

  const standingsSnap = await db.doc(`tournaments/${tid}/standings/current`).get();
  const { individuals } = boardOf(standingsSnap.exists ? (standingsSnap.data() as Row) : null);
  const fastest = stats.fastest
    ? await nameFastest(db, tid, stats.fastest.uid, individuals)
    : null;

  const payload: QuestionClosedPayload = {
    index,
    correctPct: stats.correctPct,
    // Zero only ever travels WITH `fastest: null`, which the scene renders as
    // "aucune bonne réponse" — a true sentence. A duration with no name beside
    // it would be a number nobody can check.
    fastestMs: fastest && stats.fastest ? stats.fastest.elapsedMs : 0,
    fastest,
  };

  await emitKeyedEvents(
    db,
    tid,
    `QUESTION_CLOSED__${index}`,
    [{ type: 'QUESTION_CLOSED', payload, round, questionIndex: index }],
    Date.now(),
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  // The scheduler drives this endpoint every few seconds; the run console's
  // "force close" / "force next" drive the same code by hand. Both doors, one
  // decision — see `authorizeCronOrAdmin`.
  const db = getDb();
  const actor = await authorizeCronOrAdmin(req, res, db, 'arena-control');
  if (!actor) return;

  const body: Row = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const tid = str(body.tid, str(req.query.tid));
  if (!tid) {
    res.status(400).json({ error: 'invalid_tid' });
    return;
  }
  const force = body.force === true;

  const tournamentRef = db.doc(`tournaments/${tid}`);

  try {
    const outcome = await db.runTransaction(async (tx: Transaction): Promise<Outcome> => {
      const snap = await tx.get(tournamentRef);
      if (!snap.exists) return { action: 'noop', error: 'not_found' };
      const tournament = snap.data() as Row;

      const state = str(tournament.state) as ArenaState;
      // Only a `live` tournament has a clock. `doors → live` is the admin's
      // "start", and anything after `grading` is a board that has been
      // announced — advancing either from a scheduler would be a surprise
      // nobody pressed a button for.
      if (state !== 'live') return { action: 'noop', state };

      const totalQuestions = Math.max(0, num(tournament.questionCount, 0));
      const windowMs = Math.max(1_000, num(tournament.questionWindowMs, QUESTION_WINDOW_MS));
      const pauseMs = Math.max(0, num(tournament.pauseMs, PAUSE_MS));

      const current = (tournament.currentQuestion || null) as Row | null;
      const index = current ? num(current.index, -1) : -1;

      // The live document is the authority on where the cycle is, not the
      // tournament document: it is what the clients actually read, so a
      // divergence between the two must resolve in favour of what was shown.
      const liveRef = index >= 0 ? db.doc(`tournaments/${tid}/live/${index}`) : null;
      const liveSnap = liveRef ? await tx.get(liveRef) : null;
      const live = liveSnap && liveSnap.exists ? (liveSnap.data() as Row) : null;

      // Read the key BEFORE any write in this transaction — Firestore requires
      // every read up front, and the close path below needs it. Read
      // unconditionally rather than inside the branch: a conditional read after
      // a write aborts the transaction, and this costs one document.
      const closingQuestionSnap = index >= 0
        ? await tx.get(db.doc(`tournaments/${tid}/questions/${index}`))
        : null;
      const revealAnswerIndex = closingQuestionSnap && closingQuestionSnap.exists
        ? num((closingQuestionSnap.data() as Row).answerIndex, -1)
        : -1;

      // The board, read INSIDE this transaction — unconditionally, and before
      // any write, for the two reasons Firestore and `_events` respectively
      // require. It is where event seqs are allocated from, and allocating from
      // a value read anywhere else is the race that loses an event; it is also
      // FINAL_QUESTION's payload. One document, on a call that already reads
      // three.
      const standingsRef = db.doc(`tournaments/${tid}/standings/current`);
      const standingsSnap = await tx.get(standingsRef);

      const now = Date.now();
      const action = planAdvance({
        now,
        index,
        liveState: live ? (str(live.state, 'pending') as 'pending' | 'open' | 'closed') : null,
        closesAt: live ? millis(live.closesAt) : 0,
        closedAt: live ? millis(live.closedAt) : 0,
        totalQuestions,
        force,
        pauseMs,
      });

      if (action === 'noop') return { action: 'noop', state };
      if (action === 'waiting') return { action: 'waiting', index, state };

      if (action === 'close') {
        // Close only. The next open happens on a later call, after the pause.
        /*
         * Closing is where the answer key becomes public — and the ONLY place.
         *
         * While the window is open nothing tells a player whether they were
         * right: the response says only that it was recorded, and their own
         * row is unreadable. That is what stops five friends submitting five
         * different options and reading the key off whichever score moved.
         *
         * Once the window is shut the key is harmless and withholding it is
         * just worse: everyone finds out at the same moment, which is both the
         * fair way to do it and the better broadcast — a room full of students
         * reacting together rather than in a ragged wave.
         */
        tx.update(liveRef!, {
          state: 'closed',
          closedAt: Timestamp.fromMillis(now),
          // A question with no readable key still closes. Writing -1 as "the
          // answer" would mark every student wrong on a screen; omitting it
          // shows no reveal, which is recoverable.
          //
          // KNOWN RESIDUAL, recorded because the fix is not in this file: the
          // key becomes public at `close`, and api/arena/_shared.ts accepts
          // late submissions for LATE_GRACE_MS after that. A late answer scores
          // ZERO by tier, so nothing rides on it except the `correct` counter —
          // which is school tiebreaker 3. Closing it means answer.ts not
          // counting `correct` on a submission past `closesAt`.
          ...(revealAnswerIndex >= 0 ? { answerIndex: revealAnswerIndex } : {}),
        });
        // QUESTION_CLOSED is emitted after this commits — see
        // `emitQuestionClosed`. Its figures come from `answers/*`, which cannot
        // be read from inside a transaction at that scale.
        return { action: 'closed', index, state, round: roundOf(tournament.rounds, index) };
      }

      if (action === 'finish') {
        // The last window has passed: submissions are over and the aggregates
        // settle. Routed through the shared machine so this endpoint cannot
        // invent a transition the rest of the product disagrees with.
        if (!canTransition(state, 'grading')) return { action: 'noop', error: 'illegal_transition', state };
        // `currentQuestion` is deliberately left in place: the aggregator keeps
        // ticking through `grading` and still needs to know which question the
        // board it is settling belongs to.
        const round = roundOf(tournament.rounds, index);
        tx.update(tournamentRef, {
          state: 'grading' satisfies ArenaState,
          gradingAt: FieldValue.serverTimestamp(),
        });
        // Sequence 16, the deliberate withholding. Emitted from inside the
        // transaction that performs `live → grading`, so it happens exactly as
        // often as that transition does: once.
        appendEvents(tx, db, tid, standingsSnap, [{
          type: 'GRADING',
          payload: { startedAt: now } satisfies GradingPayload,
          round,
          questionIndex: index,
        }], now);
        return { action: 'finished', index, state: 'grading', round };
      }

      // ── open ──────────────────────────────────────────────────────────────
      const nextIndex = index + 1;
      if (nextIndex >= totalQuestions) return { action: 'noop', state };

      const nextLiveRef = db.doc(`tournaments/${tid}/live/${nextIndex}`);
      const nextLiveSnap = await tx.get(nextLiveRef);
      // Idempotence: a second caller that raced us finds the document already
      // open and must not re-stamp `opensAt`, which would silently extend the
      // window and re-tier every answer already submitted against it.
      if (nextLiveSnap.exists && str((nextLiveSnap.data() as Row).state, 'pending') !== 'pending') {
        return { action: 'waiting', index: nextIndex, state };
      }

      const nextQuestionSnap = await tx.get(db.doc(`tournaments/${tid}/questions/${nextIndex}`));
      if (!nextQuestionSnap.exists) return { action: 'noop', error: 'missing_question', state };

      const opensAt = now;
      const closesAt = opensAt + windowMs;
      const payload = toLiveQuestion(nextQuestionSnap.data() as Row, {
        index: nextIndex,
        // 1-based count of questions opened, so a client can tell a stale
        // delivery document from the current one without comparing clocks.
        seq: nextIndex + 1,
        opensAt,
        closesAt,
      });

      tx.set(nextLiveRef, {
        ...payload,
        opensAt: Timestamp.fromMillis(opensAt),
        closesAt: Timestamp.fromMillis(closesAt),
      });
      const round = roundOf(tournament.rounds, nextIndex);
      tx.update(tournamentRef, {
        currentRound: round,
        currentQuestion: {
          index: nextIndex,
          seq: payload.seq,
          opensAt: Timestamp.fromMillis(opensAt),
          closesAt: Timestamp.fromMillis(closesAt),
        },
      });

      /*
       * Sequences 3 and 4 — the opening, and every question transition.
       *
       * `index` IS ZERO-BASED, matching `currentQuestion.index` (which is why
       * `useStage` defaults it to -1: 0 is a real question). The scenes add the
       * one — `questionNumber()` in src/broadcast/rhythm.ts turns index 0 into
       * "QUESTION 1 / 25" — and it has to be added in exactly one place. Emit a
       * 1-based index here and the projector reads "QUESTION 2 / 25" over the
       * first question of the night.
       *
       * Emitted inside the transaction that opens the question, so a retry that
       * finds the question already open cannot emit a second opening: the only
       * path to this line is the one that actually writes `live/{index}`.
       */
      const drafts: ArenaEventDraft[] = [{
        type: 'ROUND_START',
        payload: {
          index: nextIndex,
          total: totalQuestions,
          category: categoryOf(tournament.rounds, nextIndex, nextQuestionSnap.data() as Row),
        } satisfies RoundStartPayload,
        round,
        questionIndex: nextIndex,
      }];

      if (nextIndex === totalQuestions - 1) {
        // Sequence 15. Priority 10, so it takes the screen from the transition
        // it rides with — the last question is the only one that earns it.
        const { schools } = boardOf(standingsSnap.exists ? (standingsSnap.data() as Row) : null);
        drafts.push({
          type: 'FINAL_QUESTION',
          payload: { atStake: atStakeFrom(schools, AT_STAKE_LIMIT) } satisfies FinalQuestionPayload,
          round,
          questionIndex: nextIndex,
        });
      }

      appendEvents(tx, db, tid, standingsSnap, drafts, now);
      return { action: 'opened', index: nextIndex, state, round };
    });

    if (outcome.error === 'not_found') {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (outcome.error) {
      res.status(409).json({ error: outcome.error, state: outcome.state });
      return;
    }

    // Sequence 5. Deliberately outside the transaction that closed the
    // question — see `emitQuestionClosed`'s own comment for why its payload
    // cannot be gathered inside one. A failure here is swallowed: the round
    // clock advancing is the one thing this endpoint must never stop for, and
    // a missing round-results scene is recoverable where a stalled tournament
    // is not.
    if (outcome.action === 'closed' && typeof outcome.index === 'number') {
      try {
        await emitQuestionClosed(db, tid, outcome.index, outcome.round ?? 0);
      } catch (err) {
        console.error('[arena/advance] emitQuestionClosed failed:', err);
      }

      /*
       * CORRECTION, from an external audit: this call did not exist. A
       * comment on aggregate.ts's own handler already claimed "advance calls
       * this at every question close" — it never did, and the once-a-minute
       * cron was the ONLY thing computing standings, with no relationship to
       * question boundaries. That gap is what let `standings/current`
       * publish mid-question in the first place; `aggregateOne` now refuses
       * to publish while the live document it reads says the question is
       * still open, but a tournament still needs SOMETHING to trigger the
       * settle the moment it legitimately can, rather than waiting up to a
       * minute for the next blind cron tick. This is that trigger — called
       * after the close transaction has committed, so the read inside it
       * already sees `live/{index}.state = 'closed'` and proceeds.
       *
       * Same failure posture as emitQuestionClosed: swallowed on error. The
       * round clock advancing is the one thing this endpoint must never stop
       * for, and a board that settles a minute late on the next cron tick is
       * recoverable where a stalled tournament is not.
       */
      try {
        await aggregateOne(db, tid, Date.now());
      } catch (err) {
        console.error('[arena/advance] aggregateOne failed:', err);
      }
    }

    res.status(200).json({ ok: true, ...outcome, pauseMs: PAUSE_MS });
  } catch (err) {
    console.error('[arena/advance] error:', err);
    res.status(500).json({ error: 'advance_failed' });
  }
}
