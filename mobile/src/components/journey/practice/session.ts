/**
 * session — the pure model behind every practice surface on mobile: the quiz
 * bank tab (QuizzesScreen), a lesson's Exercices sheet and Révision.
 *
 * One item shape, one status vocabulary, one tally, one "what next?" rule, so
 * the three surfaces cannot drift apart (LJ-08, LJ-09). Nothing here touches
 * React, the store or the network; the screens feed it what they have.
 */
import { resolveCorrectIndex, type PracticeCard } from '../../../utils/practiceCards';

/** One question as a session plays it. */
export interface SessionItem {
  /** Quiz-bank id. Positional `q${n}` ids are parser fallbacks, never stored. */
  id: string;
  question: string;
  options: string[];
  /** -1 when the row's key matches no option: shown, never marked. */
  correctIndex: number;
  hint?: string;
  /** Authored explanation, when the bank has one. */
  explanation?: string;
  subjectCode?: string;
  unitNo?: number;
  lessonNo?: number | null;
}

/** What the student did with one item. */
export interface LogEntry {
  /** Option index the student checked; null when never checked. */
  selected: number | null;
}

/**
 * The one vocabulary for an answer's outcome. Each status has its own words
 * and icon (see AnswerStatus) so "unanswered" and "not auto-corrected" are
 * never read as "wrong".
 *
 *   correct     right
 *   incorrect   wrong
 *   partial     part-credit — no bank question produces it today; reserved
 *               so a future grader has a word instead of borrowing "wrong"
 *   unanswered  shown (or never reached) and not checked
 *   ungraded    checked, but the bank has no key to compare with
 */
export type AnswerStatusKind = 'correct' | 'incorrect' | 'partial' | 'unanswered' | 'ungraded';

const SYNTHETIC_ID = /^q\d+$/;

export const isGradable = (item: Pick<SessionItem, 'correctIndex' | 'options'> | null | undefined): boolean =>
  !!item && Array.isArray(item.options) && item.correctIndex >= 0 && item.correctIndex < item.options.length;

/** A grouped quiz-bank question (dataService.groupQuestionsIntoQuizzes) → item. */
export function itemFromQuizQuestion(q: any): SessionItem | null {
  const question = String(q?.question ?? q?.stem ?? '').trim();
  const options: string[] = (q?.options ?? q?.choices ?? []).map(String);
  if (!question || options.length < 2) return null;
  const raw = q?.answer ?? q?.correct_answer ?? q?.correctAnswer;
  const unitNo = Number(q?.unitNo);
  return {
    id: String(q?.id ?? ''),
    question,
    options,
    correctIndex: resolveCorrectIndex(raw, options),
    hint: q?.hint ? String(q.hint) : undefined,
    explanation: q?.explanation ? String(q.explanation) : undefined,
    subjectCode: q?.subjectCode ? String(q.subjectCode) : undefined,
    unitNo: Number.isFinite(unitNo) && unitNo > 0 ? unitNo : undefined,
  };
}

/** A practice card (utils/practiceCards) → item. */
export function itemFromCard(c: PracticeCard, meta?: { subjectCode?: string; unitNo?: number }): SessionItem {
  return {
    id: c.id,
    question: c.question,
    options: c.options,
    correctIndex: c.gradable === false ? -1 : c.correctIndex,
    hint: c.hint,
    explanation: c.explanation,
    subjectCode: meta?.subjectCode,
    unitNo: meta?.unitNo,
    lessonNo: c.lessonNo,
  };
}

export function statusOf(item: SessionItem, entry?: LogEntry | null): AnswerStatusKind {
  if (!entry || entry.selected == null) return 'unanswered';
  if (!isGradable(item)) return 'ungraded';
  return entry.selected === item.correctIndex ? 'correct' : 'incorrect';
}

/**
 * Should this outcome touch the Révision map? Only a real bank id, only a
 * question that was actually graded. Unanswered and ungraded items are never
 * sent — nothing was learned about them.
 */
export function reviewOutcomeOf(item: SessionItem, entry?: LogEntry | null): boolean | null {
  if (!item.id || SYNTHETIC_ID.test(item.id)) return null;
  const s = statusOf(item, entry);
  if (s === 'correct') return true;
  if (s === 'incorrect') return false;
  return null;
}

export interface Tally {
  total: number;
  correct: number;
  incorrect: number;
  partial: number;
  unanswered: number;
  ungraded: number;
  /** Items a score can count: everything except the ungraded ones. */
  scored: number;
}

export function tally(items: SessionItem[], log: Array<LogEntry | null | undefined>): Tally {
  const t: Tally = { total: items.length, correct: 0, incorrect: 0, partial: 0, unanswered: 0, ungraded: 0, scored: 0 };
  items.forEach((item, i) => {
    const s = statusOf(item, log[i]);
    t[s] += 1;
    // An ungradable item is out of the score whether or not it was answered.
    if (isGradable(item)) t.scored += 1;
  });
  return t;
}

/** Bank ids this session put into Révision (a graded miss on a real id). */
export function reviewIdsOf(items: SessionItem[], log: Array<LogEntry | null | undefined>): string[] {
  const ids: string[] = [];
  items.forEach((item, i) => {
    if (reviewOutcomeOf(item, log[i]) === false && !ids.includes(item.id)) ids.push(item.id);
  });
  return ids;
}

/** How many entries need a correction read: misses, partials, and ungraded answers. */
export function correctionCount(t: Tally): number {
  return t.incorrect + t.partial + t.ungraded;
}

export type SessionMode = 'quiz' | 'practice';

/** Questions the scored quiz holds at most — the size mobile already used. */
export const QUIZ_LENGTH = 20;

/**
 * Build the deck. A quiz holds only gradable questions (a score over questions
 * nobody can mark would be a lie) and at most QUIZ_LENGTH; open practice draws
 * from everything, ungradable included, shown as such.
 * `shuffle` is injected so tests stay deterministic.
 */
export function buildDeck(
  pool: SessionItem[],
  mode: SessionMode,
  shuffle: <T>(items: T[]) => T[] = (items) => items,
): SessionItem[] {
  const seen = new Set<string>();
  const unique = pool.filter((it) => {
    if (!it.id) return true;
    if (seen.has(it.id)) return false;
    seen.add(it.id);
    return true;
  });
  if (mode === 'quiz') return shuffle(unique.filter(isGradable)).slice(0, QUIZ_LENGTH);
  return shuffle(unique);
}

export function fisherYates<T>(items: T[], rand: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── What next? (LJ-09: one dominant action from real state) ─────────────────

export type NextActionKind = 'review' | 'nextLesson' | 'replay' | 'otherChapter';

export interface NextActionInput {
  /** Questions due in Révision within this session's scope (this session's misses included). */
  dueInScope: number;
  /** The scope knows the lesson after the one the student came from. */
  hasNextLesson: boolean;
  /** Gradable questions the scope can still offer. 0 = nothing to replay. */
  poolSize: number;
}

export interface NextActionChoice {
  primary: NextActionKind;
  secondary: NextActionKind | null;
  /** Nothing due here and nothing missed: say so instead of inventing a weakness. */
  caughtUp: boolean;
}

export function chooseNextAction(input: NextActionInput, t: Tally): NextActionChoice {
  const caughtUp = input.dueInScope === 0 && t.incorrect === 0 && t.partial === 0;
  const canReplay = input.poolSize > 0;
  if (input.dueInScope > 0) {
    return { primary: 'review', secondary: canReplay ? 'replay' : 'otherChapter', caughtUp };
  }
  if (input.hasNextLesson) {
    return { primary: 'nextLesson', secondary: canReplay ? 'replay' : 'otherChapter', caughtUp };
  }
  if (canReplay) return { primary: 'replay', secondary: 'otherChapter', caughtUp };
  return { primary: 'otherChapter', secondary: null, caughtUp };
}

// ── What is saved? (LJ-09: never claim a write that is not confirmed) ───────

export type ReviewConfirmState = 'idle' | 'pending' | 'confirmed' | 'unconfirmed';

export type SavedLineKind =
  | 'guest-none' // signed out, no new error
  | 'guest-local' // signed out, errors kept on this phone only
  | 'none' // signed in, no new error to add
  | 'pending' // signed in, write in flight
  | 'confirmed' // signed in, server acknowledged the write
  | 'unconfirmed'; // signed in, write not acknowledged (offline / failed)

export function savedLineKind(signedIn: boolean, newErrors: number, confirm: ReviewConfirmState): SavedLineKind {
  if (!signedIn) return newErrors > 0 ? 'guest-local' : 'guest-none';
  if (newErrors === 0) return 'none';
  if (confirm === 'confirmed') return 'confirmed';
  if (confirm === 'unconfirmed') return 'unconfirmed';
  return 'pending';
}

/**
 * The part of a session a result talks about. A quiz reports its whole deck
 * (unreached questions are "sans réponse"); open practice ends where the
 * student stopped — later draws were never asked.
 */
export function sessionSlice(
  items: SessionItem[],
  log: Array<LogEntry | null | undefined>,
  mode: SessionMode,
): { items: SessionItem[]; log: Array<LogEntry | null> } {
  if (mode === 'quiz') return { items, log: items.map((_, i) => log[i] ?? null) };
  let last = -1;
  log.forEach((e, i) => { if (e?.selected != null) last = i; });
  const n = last + 1;
  return { items: items.slice(0, n), log: items.slice(0, n).map((_, i) => log[i] ?? null) };
}
