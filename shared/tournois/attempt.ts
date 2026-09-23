/**
 * tournois/attempt — one player's timed run through a round (window, manches,
 * bracket). Pure: the API loads the attempt, calls these, writes the result.
 *
 * The clock for each question starts when the SERVER served it (`servedAt`),
 * not when a client says it painted: a round is played alone, at any hour, so
 * there is no shared "opensAt" to clamp a report against, and trusting the
 * client here would mean trusting the client entirely.
 *
 * A question left open past its time (the tab closed, the phone died) is
 * closed as unanswered the next time the attempt is touched — so walking away
 * and coming back tomorrow never buys thinking time.
 */
import { attemptAnswerLate } from './schedule';
import { scoreAnswer } from './scoring';

export const PENDING = -2;
export const SKIPPED = -1;

export interface Attempt {
  uid: string;
  round: number;
  /** Indexes into the round's question pool, in this player's order. */
  order: number[];
  /** 0 = not served yet. */
  servedAt: number[];
  /** PENDING, SKIPPED, or the option index chosen. */
  choices: number[];
  points: number[];
  correct: boolean[];
  elapsedMs: number[];
  pos: number;
  done: boolean;
  startedAt: number;
  finishedAt: number | null;
}

export function newAttempt(uid: string, round: number, order: number[], now: number): Attempt {
  const n = order.length;
  return {
    uid,
    round,
    order,
    servedAt: Array(n).fill(0),
    choices: Array(n).fill(PENDING),
    points: Array(n).fill(0),
    correct: Array(n).fill(false),
    elapsedMs: Array(n).fill(0),
    pos: 0,
    done: false,
    startedAt: now,
    finishedAt: null,
  };
}

const copy = (a: Attempt): Attempt => ({
  ...a,
  servedAt: [...a.servedAt],
  choices: [...a.choices],
  points: [...a.points],
  correct: [...a.correct],
  elapsedMs: [...a.elapsedMs],
});

/**
 * Bring an attempt up to `now`: close every served question whose time ran
 * out, then serve the next one — unless the round has closed, in which case
 * the attempt ends where it is.
 */
export function catchUp(a0: Attempt, now: number, questionMs: number, roundClosesAt: number): Attempt {
  const a = copy(a0);
  if (a.done) return a;
  const n = a.order.length;
  while (a.pos < n && a.servedAt[a.pos] > 0 && attemptAnswerLate(a.servedAt[a.pos], questionMs, now)) {
    a.choices[a.pos] = SKIPPED;
    a.elapsedMs[a.pos] = questionMs;
    a.pos += 1;
  }
  if (a.pos < n && a.servedAt[a.pos] === 0) {
    if (now < roundClosesAt) a.servedAt[a.pos] = now;
    else a.pos = n; // the round closed before this question was served
  }
  if (a.pos >= n) {
    a.done = true;
    a.finishedAt = a.finishedAt ?? now;
  }
  return a;
}

export type AnswerRefusal = 'done' | 'wrong_position' | 'not_served';

/**
 * Record the answer to question `pos`. `answerKey` is the correct option for
 * that question (the API reads it from the server-only pool). The caller must
 * never echo `correct` or `points` back — the corrections wait for the close.
 */
export function answerAttempt(
  a0: Attempt,
  pos: number,
  choice: number,
  answerKey: number,
  now: number,
  questionMs: number,
  roundClosesAt: number,
): { attempt: Attempt; refused: AnswerRefusal | null; duplicate: boolean } {
  if (a0.done) return { attempt: a0, refused: 'done', duplicate: false };
  // A retry of an answer that already landed: idempotent, not an error.
  if (pos < a0.pos && a0.choices[pos] !== PENDING) {
    return { attempt: a0, refused: null, duplicate: true };
  }
  if (pos !== a0.pos) return { attempt: a0, refused: 'wrong_position', duplicate: false };
  if (!a0.servedAt[pos]) return { attempt: a0, refused: 'not_served', duplicate: false };
  const a = copy(a0);
  const late = attemptAnswerLate(a.servedAt[pos], questionMs, now);
  const isChoice = Number.isInteger(choice) && choice >= 0;
  const correct = isChoice && choice === answerKey;
  const scored = scoreAnswer({ correct, startedAt: a.servedAt[pos], receivedAt: now, questionMs, late });
  a.choices[pos] = isChoice ? choice : SKIPPED;
  a.correct[pos] = correct && !late;
  a.points[pos] = scored.points;
  a.elapsedMs[pos] = Math.min(scored.elapsedMs, questionMs);
  a.pos = pos + 1;
  return { attempt: catchUp(a, now, questionMs, roundClosesAt), refused: null, duplicate: false };
}

/** The round score the standings and the bracket read. */
export function attemptTotals(a: Attempt): { points: number; correct: number; answered: number; totalMs: number; played: boolean } {
  let points = 0;
  let correct = 0;
  let answered = 0;
  let totalMs = 0;
  a.choices.forEach((c, i) => {
    if (c === PENDING) return;
    points += a.points[i] || 0;
    if (a.correct[i]) correct += 1;
    if (c >= 0) answered += 1;
    totalMs += a.elapsedMs[i] || 0;
  });
  return { points, correct, answered, totalMs, played: true };
}
