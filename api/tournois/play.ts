/**
 * Vercel serverless function: POST /api/tournois/play
 * ────────────────────────────────────────────────────────────────────────────
 * Everything a PLAYER sends. One endpoint, four actions:
 *
 *   live-answer  { tid, index, choice, clientShownAt? }
 *     → { ok, recorded, duplicate }            — nothing about correctness
 *   start        { tid }                        — round formats
 *     → { ok, round, pos, count, question, servedAt, deadline, done, serverNow }
 *   answer       { tid, round, pos, choice }    — round formats (choice -1 = time ran out)
 *     → { ok, recorded, duplicate, pos, count, question, servedAt, deadline, done, serverNow }
 *   review       { tid, round? }                — after the round (or live) closed
 *     → { ok, items: [{ q, qHt, options, optionsHt, answer, explanation, explanationHt, choice, points }] }
 *
 * THE RESPONSE REVEALS NOTHING mid-question — no `correct`, no `points` — for
 * the Arène's reason: a player who learns their result the instant they tap
 * can relay the key to the room before it closes. Live, the reveal lands on
 * live/state for everyone at once; in a round, the corrections open when the
 * round closes (`review`), so the friend who played at 8:00 cannot hand the
 * answers to the one who plays at 9:00. Each player also draws their own
 * subset of a pool three times larger, in their own order.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Firestore } from 'firebase-admin/firestore';
import { requireAuthDecoded } from '../_lib/requireAuth';
import { getDb } from '../_lib/firebaseAdmin';
import { isValidTid } from '../../shared/tournois/config';
import { ANSWER_GRACE_MS, livePositionAt, roundAt } from '../../shared/tournois/schedule';
import { clampLiveStart, scoreAnswer } from '../../shared/tournois/scoring';
import { attemptOrder, toPublicQuestion, type StoredQuestion } from '../../shared/tournois/questions';
import { answerAttempt, attemptTotals, catchUp, newAttempt, PENDING, type Attempt } from '../../shared/tournois/attempt';
import { playersInRound, type Match } from '../../shared/tournois/bracket';
import {
  advanceTournament,
  boundedInt,
  enforceRateLimit,
  parseBody,
  readTournament,
  recomputeStandings,
  sub,
  subCol,
  tRef,
  withRound,
  type PlayerDoc,
  type TournamentDoc,
} from './_shared';

/** Rebuild the public board at most this often from finished attempts; the tick catches the rest. */
const STANDINGS_THROTTLE_MS = 15_000;
const PROGRESS_THROTTLE_MS = 1_000;

function fail(res: VercelResponse, status: number, error: string): void {
  res.status(status).json({ error });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const receivedAt = Date.now();
  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
  const decoded = await requireAuthDecoded(req, res);
  if (!decoded) return;
  const { uid } = decoded;
  if (!(await enforceRateLimit(res, uid, 'tournois-play'))) return;

  const body = parseBody(req);
  if (!isValidTid(body.tid)) return fail(res, 400, 'invalid_tid');
  const tid = body.tid;
  const db = getDb();

  switch (body.action) {
    case 'live-answer':
      return liveAnswer(db, res, tid, uid, body, receivedAt);
    case 'start':
      return roundStep(db, res, tid, uid, null, receivedAt);
    case 'answer':
      return roundStep(db, res, tid, uid, body, receivedAt);
    case 'review':
      return review(db, res, tid, uid, body, receivedAt);
    default:
      return fail(res, 400, 'invalid_action');
  }
}

// ── Live ────────────────────────────────────────────────────────────────────

async function liveAnswer(
  db: Firestore, res: VercelResponse, tid: string, uid: string, body: Record<string, unknown>, receivedAt: number,
): Promise<void> {
  const index = boundedInt(body.index, 0, 99);
  const choice = boundedInt(body.choice, 0, 11);
  if (index === null || choice === null) return fail(res, 400, 'invalid_input');
  const t = await readTournament(db, tid);
  if (!t) return fail(res, 404, 'not_found');
  if (t.format !== 'live') return fail(res, 400, 'not_live');
  if (t.state === 'cancelled') return fail(res, 409, 'cancelled');

  // Where the SCHEDULE says the room is at the instant this request arrived.
  // Not the live doc: that is lazily advanced and may lag the clock.
  const pos = livePositionAt(t.schedule, receivedAt);
  const inQuestion = pos.index === index && pos.phase === 'question';
  const inGrace = pos.index === index && pos.phase === 'reveal' && receivedAt <= pos.closesAt + ANSWER_GRACE_MS;
  if (!inQuestion && !inGrace) return fail(res, 409, 'answers_closed');
  const late = !inQuestion;

  const answerRef = sub(db, tid, `answers/${index}_${uid}`);
  const playerRef = sub(db, tid, `players/${uid}`);
  const out = await db.runTransaction(async (tx) => {
    const [pSnap, aSnap, qSnap] = await Promise.all([
      tx.get(playerRef), tx.get(answerRef), tx.get(sub(db, tid, 'questions/live')),
    ]);
    if (!pSnap.exists) return 'not_joined' as const;
    if (aSnap.exists) return 'duplicate' as const;
    const q = ((qSnap.data()?.items || []) as StoredQuestion[])[index];
    if (!q) return 'question_not_found' as const;
    const opensAt = pos.opensAt;
    const startedAt = clampLiveStart(opensAt, body.clientShownAt);
    const correct = choice === q.answer;
    const scored = scoreAnswer({ correct, startedAt, receivedAt, questionMs: t.schedule.questionMs, late });
    tx.create(answerRef, {
      uid, index, choice, correct: correct && !late, late,
      points: scored.points, tier: scored.tier, elapsedMs: scored.elapsedMs, receivedAt,
    });
    // Live is one round (0) whose running totals ARE the player's row.
    const p = pSnap.data() as PlayerDoc;
    const prev = p.rounds?.['0'] || { points: 0, correct: 0, answered: 0, totalMs: 0, played: true };
    tx.set(playerRef, withRound(p, 0, {
      points: prev.points + scored.points,
      correct: prev.correct + (correct && !late ? 1 : 0),
      answered: prev.answered + 1,
      totalMs: prev.totalMs + Math.min(scored.elapsedMs, t.schedule.questionMs),
      played: true,
    }));
    return 'ok' as const;
  });
  if (out === 'not_joined') return fail(res, 403, 'not_joined');
  if (out === 'question_not_found') return fail(res, 404, 'question_not_found');

  // "N/M ont validé": a count over this question's answers, rebuilt at most
  // once a second — never a counter every answer increments.
  if (out === 'ok') {
    try {
      const progRef = sub(db, tid, 'live/progress');
      const prog = (await progRef.get()).data();
      if (!prog || prog.index !== index || receivedAt - (prog.updatedAt || 0) >= PROGRESS_THROTTLE_MS) {
        const agg = await subCol(db, tid, 'answers').where('index', '==', index).count().get();
        await progRef.set({ index, answered: agg.data().count, updatedAt: Date.now() });
      }
    } catch (err) {
      console.warn('[tournois] progress update failed:', err);
    }
  }
  res.status(200).json({ ok: true, recorded: true, duplicate: out === 'duplicate' });
}

// ── Rounds (window / manches / bracket) ────────────────────────────────────

function publicStep(a: Attempt, pool: StoredQuestion[], questionMs: number, now: number) {
  const count = a.order.length;
  const q = !a.done && a.pos < count ? pool[a.order[a.pos]] : null;
  return {
    round: a.round,
    pos: a.pos,
    count,
    question: q ? toPublicQuestion(q) : null,
    servedAt: q ? a.servedAt[a.pos] : null,
    deadline: q ? a.servedAt[a.pos] + questionMs : null,
    done: a.done,
    serverNow: now,
  };
}

async function roundStep(
  db: Firestore, res: VercelResponse, tid: string, uid: string, body: Record<string, unknown> | null, now: number,
): Promise<void> {
  // Catch the tournament up first: a bracket round must be resolved (and the
  // next pairings drawn) before anybody can start it.
  await advanceTournament(db, tid, now);
  const t = await readTournament(db, tid);
  if (!t) return fail(res, 404, 'not_found');
  if (t.format === 'live') return fail(res, 400, 'live_format');
  const round = roundAt(t.schedule.rounds, now);

  if (!body) {
    // START (or resume)
    if (t.state !== 'running' || !round) return fail(res, 409, 'no_open_round');
    if (t.format === 'bracket') {
      const ms = await subCol(db, tid, 'matches').where('round', '==', round.index).get();
      const inRound = playersInRound(ms.docs.map((d) => d.data() as Match));
      if (!inRound.includes(uid)) return fail(res, 403, 'not_in_this_round');
    }
  }

  const roundIndex = body ? boundedInt(body.round, 0, 20) : round?.index ?? null;
  if (roundIndex === null) return fail(res, 400, 'invalid_round');
  const win = t.schedule.rounds[roundIndex];
  if (!win) return fail(res, 400, 'invalid_round');
  const pos = body ? boundedInt(body.pos, 0, 99) : null;
  const choice = body ? boundedInt(body.choice, -1, 11) : null;
  if (body && (pos === null || choice === null)) return fail(res, 400, 'invalid_input');

  const attemptRef = sub(db, tid, `attempts/${roundIndex}_${uid}`);
  const playerRef = sub(db, tid, `players/${uid}`);
  const poolRef = sub(db, tid, `questions/r${roundIndex}`);
  const questionMs = t.schedule.questionMs;

  const out = await db.runTransaction(async (tx) => {
    const [pSnap, aSnap, poolSnap] = await Promise.all([tx.get(playerRef), tx.get(attemptRef), tx.get(poolRef)]);
    if (!pSnap.exists) return { error: 'not_joined' as const };
    const pool = (poolSnap.data()?.items || []) as StoredQuestion[];
    if (!pool.length) return { error: 'question_not_found' as const };
    let a: Attempt;
    let duplicate = false;
    let recorded = false;
    if (!aSnap.exists) {
      if (body) return { error: 'not_started' as const };
      if (now >= win.closesAt || now < win.opensAt) return { error: 'no_open_round' as const };
      a = catchUp(newAttempt(uid, roundIndex, attemptOrder(pool.length, t.questionCount, Math.random), now), now, questionMs, win.closesAt);
    } else {
      const stored = aSnap.data() as Attempt;
      if (body) {
        const q = pool[stored.order[pos as number]];
        const r = answerAttempt(stored, pos as number, choice as number, q ? q.answer : -99, now, questionMs, win.closesAt);
        if (r.refused === 'wrong_position' || r.refused === 'not_served') {
          // The client's view is stale (a timeout closed that question). Hand back where it really is.
          a = catchUp(stored, now, questionMs, win.closesAt);
        } else {
          a = r.attempt;
          duplicate = r.duplicate;
          recorded = !r.refused && !r.duplicate;
        }
      } else {
        a = catchUp(stored, now, questionMs, win.closesAt);
      }
    }
    tx.set(attemptRef, a);
    const p = pSnap.data() as PlayerDoc;
    const anyAnswered = a.choices.some((c) => c !== PENDING);
    const nextPlayer = anyAnswered || a.done ? withRound(p, roundIndex, attemptTotals(a)) : p;
    tx.set(playerRef, nextPlayer);
    const finishedNow = a.done && !(aSnap.exists && (aSnap.data() as Attempt).done);
    if (finishedNow) {
      tx.update(tRef(db, tid), {
        standingsDirty: true,
        nextDeadlineAt: Math.min(t.nextDeadlineAt ?? Infinity, now + STANDINGS_THROTTLE_MS),
        updatedAt: now,
      });
    }
    return { a, pool, duplicate, recorded, finishedNow };
  });

  if ('error' in out) {
    const status = out.error === 'not_joined' ? 403 : out.error === 'question_not_found' ? 404 : 409;
    return fail(res, status, out.error as string);
  }
  if (out.finishedNow) {
    try {
      const st = (await sub(db, tid, 'standings/current').get()).data();
      if (!st || now - (st.updatedAt || 0) >= STANDINGS_THROTTLE_MS) await recomputeStandings(db, tid, now);
    } catch (err) {
      console.warn('[tournois] standings refresh failed:', err);
    }
  }
  res.status(200).json({
    ok: true,
    recorded: out.recorded,
    duplicate: out.duplicate,
    ...publicStep(out.a, out.pool, questionMs, now),
  });
}

// ── Review ─────────────────────────────────────────────────────────────────

async function review(
  db: Firestore, res: VercelResponse, tid: string, uid: string, body: Record<string, unknown>, now: number,
): Promise<void> {
  const t: TournamentDoc | null = await readTournament(db, tid);
  if (!t) return fail(res, 404, 'not_found');

  if (t.format === 'live') {
    // Every question is revealed on live/state as it closes; the full sheet
    // (with the player's own choices) once the room is over.
    if (now < t.schedule.endsAt) return fail(res, 409, 'not_closed');
    const [qSnap, mine] = await Promise.all([
      sub(db, tid, 'questions/live').get(),
      subCol(db, tid, 'answers').where('uid', '==', uid).get(),
    ]);
    const items = (qSnap.data()?.items || []) as StoredQuestion[];
    const byIndex = new Map(mine.docs.map((d) => [d.data().index as number, d.data()]));
    res.status(200).json({
      ok: true,
      items: items.map((q, i) => ({
        ...toPublicQuestion(q),
        answer: q.answer,
        explanation: q.explanation,
        explanationHt: q.explanationHt,
        choice: byIndex.has(i) ? byIndex.get(i)!.choice : null,
        points: byIndex.has(i) ? byIndex.get(i)!.points : 0,
      })),
    });
    return;
  }

  const r = boundedInt(body.round, 0, 20);
  if (r === null || !t.schedule.rounds[r]) return fail(res, 400, 'invalid_round');
  if (now < t.schedule.rounds[r].closesAt) return fail(res, 409, 'not_closed');
  const [aSnap, poolSnap] = await Promise.all([
    sub(db, tid, `attempts/${r}_${uid}`).get(),
    sub(db, tid, `questions/r${r}`).get(),
  ]);
  if (!aSnap.exists) return fail(res, 404, 'no_attempt');
  const a = aSnap.data() as Attempt;
  const pool = (poolSnap.data()?.items || []) as StoredQuestion[];
  res.status(200).json({
    ok: true,
    items: a.order.map((qi, i) => {
      const q = pool[qi];
      return {
        ...toPublicQuestion(q),
        answer: q.answer,
        explanation: q.explanation,
        explanationHt: q.explanationHt,
        choice: a.choices[i] >= 0 ? a.choices[i] : null,
        points: a.points[i] || 0,
      };
    }),
  });
}

