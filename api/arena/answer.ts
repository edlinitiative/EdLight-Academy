/**
 * Vercel serverless function: POST /api/arena/answer
 * ────────────────────────────────────────────────────────────────────────────
 * One submission to one live Arena question. This is the endpoint the money
 * runs through, so every decision it makes is the server's:
 *
 *  - The ANSWER KEY is read from `tournaments/{tid}/questions/{index}`, which
 *    Firestore rules make unreadable by every client including an admin one.
 *    It is never echoed in a response. The whole integrity model rests on the
 *    key existing only here — the bundled trivia bank ships inside the app with
 *    its answers, and that is exactly what a tournament cannot do.
 *  - The CLOCK is the server's. `clientShownAt` is a report, clamped by
 *    shared/arena/scoring.ts into [opensAt, opensAt + 3s]; the lie is bounded at
 *    three seconds and can never gain more.
 *  - TIERING and the clamp come from scoreAnswer(). Not re-implemented here.
 *    A scoring rule written twice is a rule that disagrees with itself at 18:40
 *    on a live stream.
 *
 * Request body (Authorization: Bearer <Firebase ID token>):
 *   { tournamentId: string, questionIndex: number, choice: number,
 *     clientShownAt?: number, focusLosses?: number }
 *
 * Response 200:
 *   { ok: true, correct, tier, points, score, streak, late, duplicate }
 *
 * Errors: 400 invalid input · 403 not_registered / not_eligible ·
 *         404 tournament_not_found / question_not_found ·
 *         409 answers_closed / window_closed / no_window ·
 *         429 rate limited · 500 write_failed.
 *
 * Rate limiting: the `arena-answer` bucket, which FAILS CLOSED. Its cap is
 * generous because a retry after a network timeout is normal AND idempotent —
 * the cap exists to stop a script, not a bad connection.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { DocumentData } from 'firebase-admin/firestore';
import { requireAuthDecoded } from '../_lib/requireAuth';
import { getDb } from '../_lib/firebaseAdmin';
import { acceptsAnswers } from '../../shared/arena/state';
import { isImpossible, scoreAnswer } from '../../shared/arena/scoring';
import {
  MAX_FOCUS_LOSSES,
  MAX_QUESTION_INDEX,
  asArenaState,
  boundedInt,
  decideSubmission,
  enforceRateLimit,
  integrityFlags,
  isAlreadyExists,
  isValidTournamentId,
  parseBody,
  replayAnswer,
  toMillis,
  type AnswerResult,
} from './_shared';

/** An MCQ has options; 12 is far past anything the authoring tool produces. */
const MAX_CHOICES = 12;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const decoded = await requireAuthDecoded(req, res);
  if (!decoded) return;
  const { uid } = decoded;

  if (!(await enforceRateLimit(res, uid, 'arena-answer'))) return;

  // The server's receipt time, taken as early as possible. Everything after
  // this line — a slow Firestore read, a cold start — must not be charged to
  // the student's tier, because none of it is their connection.
  const serverReceivedAt = Date.now();

  // ── Validate input ──────────────────────────────────────────────────────
  const body = parseBody(req);

  const tournamentId = body.tournamentId;
  if (!isValidTournamentId(tournamentId)) {
    res.status(400).json({ error: 'invalid_tournament_id' });
    return;
  }

  const questionIndex = boundedInt(body.questionIndex, 0, MAX_QUESTION_INDEX);
  if (questionIndex === null) {
    res.status(400).json({ error: 'invalid_question_index' });
    return;
  }

  const choice = boundedInt(body.choice, 0, MAX_CHOICES - 1);
  if (choice === null) {
    res.status(400).json({ error: 'invalid_choice' });
    return;
  }

  // Untrusted by design — scoreAnswer() clamps it. A missing or nonsense value
  // falls back to `opensAt` inside clampShownAt, so failing to report is never
  // a way to buy time.
  const clientShownAt = typeof body.clientShownAt === 'number' && Number.isFinite(body.clientShownAt)
    ? body.clientShownAt
    : NaN;

  // Evidence, not a control. Clamped rather than rejected: a client reporting
  // a broken number should still have its ANSWER recorded.
  const rawFocusLosses = boundedInt(body.focusLosses, 0, MAX_FOCUS_LOSSES);
  const focusLosses = rawFocusLosses ?? 0;

  const db = getDb();

  try {
    // ── The tournament must be scoring ────────────────────────────────────
    const tSnap = await db.doc(`tournaments/${tournamentId}`).get();
    if (!tSnap.exists) {
      res.status(404).json({ error: 'tournament_not_found' });
      return;
    }
    const state = asArenaState((tSnap.data() ?? {}).state);
    if (!state || !acceptsAnswers(state)) {
      // ONLY `live` accepts answers, and the narrowness is the point: an answer
      // accepted in `grading` lands after aggregates have begun settling, and
      // one accepted in `provisional` rewrites a standing already announced on
      // a stream. The ~10s pause between questions is INSIDE `live`, which is
      // exactly why late submissions still land here.
      res.status(409).json({ error: 'answers_closed', state: state ?? null });
      return;
    }

    // ── The window, and the key ───────────────────────────────────────────
    //
    // Two documents, both server-side. `live/{index}` carries the window and is
    // the only one a client ever sees; `questions/{index}` carries
    // `answerIndex` and is read HERE and nowhere else in the product.
    const [liveSnap, questionSnap] = await db.getAll(
      db.doc(`tournaments/${tournamentId}/live/${questionIndex}`),
      db.doc(`tournaments/${tournamentId}/questions/${questionIndex}`),
    );

    if (!liveSnap.exists || !questionSnap.exists) {
      res.status(404).json({ error: 'question_not_found' });
      return;
    }

    const live = liveSnap.data() ?? {};
    const opensAt = toMillis(live.opensAt);
    const closesAt = toMillis(live.closesAt);

    const decision = decideSubmission({ opensAt, closesAt, serverReceivedAt });
    if (!decision.accept) {
      // `too_late` is past `closesAt + LATE_GRACE_MS` — by then the next
      // question is open, and accepting would let a client bank answers and
      // submit them against whichever window it liked. `no_window` is our bug
      // on the live document; we cannot score against a clock that isn't there.
      res.status(409).json({ error: decision.reason === 'too_late' ? 'window_closed' : 'no_window' });
      return;
    }

    const question = questionSnap.data() ?? {};
    const answerIndex = typeof question.answerIndex === 'number' ? question.answerIndex : -1;
    const correct = answerIndex >= 0 && choice === answerIndex;

    // A choice outside the delivered options is not an answer to this question.
    const options = Array.isArray(live.options) ? live.options : [];
    if (options.length && choice >= options.length) {
      res.status(400).json({ error: 'invalid_choice' });
      return;
    }

    // ── Score ─────────────────────────────────────────────────────────────
    // opensAt is non-null here: decideSubmission rejected the alternative.
    const scoreInput = {
      correct,
      opensAt: opensAt as number,
      clientShownAt,
      serverReceivedAt,
    };
    const scored = scoreAnswer(scoreInput);
    const impossible = isImpossible(scoreInput);

    // FLAG, DO NOT BLOCK (section M principle 2). Nothing below stops the
    // request: disqualifying a real student live, on a stream, is far worse
    // than catching a cheat in review two days later.
    const flags = integrityFlags({
      questionIndex,
      elapsedMs: scored.elapsedMs,
      impossible,
      focusLosses,
    });

    const answerRef = db.doc(`tournaments/${tournamentId}/answers/${uid}_${questionIndex}`);
    const playerRef = db.doc(`tournaments/${tournamentId}/players/${uid}`);

    const appVersion = typeof req.headers['x-app-version'] === 'string'
      ? String(req.headers['x-app-version']).slice(0, 40)
      : null;

    type Outcome =
      | { kind: 'ok'; result: AnswerResult }
      | { kind: 'duplicate'; result: AnswerResult }
      | { kind: 'error'; status: number; code: string };

    // ── Record and apply, atomically ──────────────────────────────────────
    //
    // `tx.create()` on the composite id `{uid}_{index}` is the idempotency: the
    // second submission for the same question cannot write, by construction,
    // rather than by a check that races with itself. Both the answer and the
    // player update live in ONE transaction so they cannot half-happen — an
    // answer recorded whose points were never applied is a student who answered
    // correctly and scored nothing, and a player updated twice from one
    // submission is a student who scored a question twice.
    const runOnce = async (): Promise<Outcome> => db.runTransaction(async (tx): Promise<Outcome> => {
      const [existing, playerSnap] = await tx.getAll(answerRef, playerRef);

      if (existing.exists) {
        // A retry after a network timeout is normal and must be idempotent:
        // return what the first submission decided, with 200, not an error.
        // Re-scoring would use a fresh `serverReceivedAt` and could hand the
        // same submission a different tier — the one thing a record that has to
        // survive a public dispute cannot do.
        return { kind: 'duplicate', result: replayAnswer(existing.data() as DocumentData, playerSnap.data()) };
      }

      if (!playerSnap.exists) {
        return { kind: 'error', status: 403, code: 'not_registered' };
      }
      const player = playerSnap.data() ?? {};
      if (player.eligible === false) {
        // An admin has marked this player ineligible in review. Their
        // submissions stop counting, but this is a decision a human already
        // made off-stream — not the live engine deciding anything.
        return { kind: 'error', status: 403, code: 'not_eligible' };
      }

      const prevScore = typeof player.score === 'number' ? player.score : 0;
      const prevStreak = typeof player.streak === 'number' ? player.streak : 0;
      const prevBest = typeof player.bestStreak === 'number' ? player.bestStreak : 0;
      const streak = correct ? prevStreak + 1 : 0;

      tx.create(answerRef, {
        uid,
        index: questionIndex,
        choice,
        // Both ends of the span, plus what the clamp actually used, because the
        // tournament must be re-scorable from `answers/*` alone. Storing only
        // the result would make a post-hoc disqualification a judgement call.
        clientShownAt: Number.isFinite(clientShownAt) ? clientShownAt : null,
        clampedShownAt: scored.clampedShownAt,
        serverReceivedAt,
        elapsedMs: scored.elapsedMs,
        tier: scored.tier,
        correct,
        points: scored.points,
        late: decision.late,
        early: decision.early,
        impossible,
        // The RAW count, always — the flag threshold is a display decision and
        // a reviewer must be able to apply a different one to the full record.
        focusLosses,
        flags,
        appVersion,
        deviceHash: typeof player.deviceHash === 'string' ? player.deviceHash : null,
        createdAt: Timestamp.now(),
      });

      /*
       * A LATE ANSWER COUNTS FOR NOTHING IT COULD NOT HAVE EARNED HONESTLY.
       *
       * The key is published when the window closes (advance writes it onto
       * `live/{index}`), and this endpoint deliberately keeps accepting for
       * LATE_GRACE_MS afterwards so a student on a bad connection is recorded
       * rather than erased — Decision 2.
       *
       * Those two facts together are a hole: after the close, anyone can read
       * the revealed key and submit it. The tier already scores that zero, so
       * no points ride on it — but `correct` is school tiebreaker 3 and
       * `fullTierCount` is individual tiebreaker 3, and a stream of "correct"
       * late answers would move a school up a podium it did not earn.
       *
       * So a late submission is recorded in full, with its own flag, and
       * contributes to nothing that ranks. It appears; it does not count.
       */
      const countsTowardRanking = !decision.late;

      tx.update(playerRef, {
        score: prevScore + scored.points,
        correct: FieldValue.increment(correct && countsTowardRanking ? 1 : 0),
        answered: FieldValue.increment(1),
        // Math.max(0, …) matters: an impossible submission carries a NEGATIVE
        // elapsed span (the negative IS the finding, per scoreAnswer). Adding it
        // raw would LOWER the player's total response time, and total response
        // time is tiebreaker 2 for both the individual podium and the school
        // standings — an impossible answer would literally buy a better rank.
        totalMs: FieldValue.increment(Math.max(0, scored.elapsedMs)),
        fullTierCount: FieldValue.increment(
          scored.tier === 'full' && correct && countsTowardRanking ? 1 : 0,
        ),
        // A streak built on answers submitted after the reveal is not a
        // streak, and PLAYER_STREAK puts it on the broadcast.
        streak: countsTowardRanking ? streak : 0,
        bestStreak: countsTowardRanking ? Math.max(prevBest, streak) : prevBest,
        lastAnswerAt: Timestamp.now(),
        ...(flags.length ? { flags: FieldValue.arrayUnion(...flags) } : {}),
      });

      return {
        kind: 'ok',
        result: {
          correct,
          tier: scored.tier,
          points: scored.points,
          score: prevScore + scored.points,
          streak,
          late: decision.late,
        },
      };
    });

    let outcome: Outcome;
    try {
      outcome = await runOnce();
    } catch (err) {
      if (!isAlreadyExists(err)) throw err;
      // Two requests raced past the read and both reached `create`. Firestore
      // rejected the loser with ALREADY_EXISTS and rolled its whole transaction
      // back, so nothing was double-applied; the winner's record is the record.
      const [existing, playerSnap] = await db.getAll(answerRef, playerRef);
      outcome = existing.exists
        ? { kind: 'duplicate', result: replayAnswer(existing.data() as DocumentData, playerSnap.data()) }
        : { kind: 'error', status: 500, code: 'write_failed' };
    }

    if (outcome.kind === 'error') {
      res.status(outcome.status).json({ error: outcome.code });
      return;
    }

    // NOTE — what is NOT in this response: `answerIndex`, the option text, or
    // anything else that would tell a client which choice was right. `correct`
    // is about the caller's own submission and nothing else.
    //
    // KNOWN RESIDUAL VECTOR, recorded here because the fix is not in this file:
    // five colluding accounts can each submit a different option and infer the
    // key from who was told `correct: true`, then feed it to a sixth. Suppressing
    // `correct` here would not close it — Firestore rules let a player read
    // their own `players/{uid}` row, so the score increment reveals the same bit
    // in real time. Closing it means deferring the visible score until the
    // window shuts (a rules/aggregation change, out of scope for these three
    // endpoints). Priced, meanwhile, by the tier boundary: the round trip
    // through five accounts lands well past 12s.
    /*
     * THE RESPONSE REVEALS NOTHING. Not whether the answer was right, not the
     * tier, not the points, not the running score.
     *
     * Five accounts can each submit a different option and read the key off
     * whichever one comes back correct, then hand it to a sixth — inside the
     * same open window. That is not theoretical; it is the cheapest attack on
     * this whole design, it needs no tooling, and a group of friends would
     * find it on the first night.
     *
     * Suppressing these fields is only half of it: the player's own row used to
     * be readable, so the score increment leaked the same bit. That read is now
     * denied too (firestore.rules). The correct answer becomes public exactly
     * once, for everybody at the same moment, when the question closes and
     * `advance` writes the key into `live/{index}`.
     *
     * Which is also better television: the whole room finds out together.
     */
    res.status(200).json({
      ok: true,
      recorded: true,
      duplicate: outcome.kind === 'duplicate',
    });
  } catch (err) {
    console.error('[arena/answer] error:', err);
    res.status(500).json({ error: 'write_failed' });
  }
}
