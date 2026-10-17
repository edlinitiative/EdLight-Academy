/**
 * Facts about a finished trivia round, computed ONLY from the answers array
 * the quiz recorded (brief #17: "the decisive moment only when the data
 * supports it"). Nothing here guesses: a fact that the round cannot prove is
 * returned as null and the results screen simply leaves it out.
 *
 * An answer is { question, selected, correct, ms? } — `selected === -1` is a
 * timeout, `ms` is the time from the question appearing to the answer
 * (absent on rounds recorded before timing existed).
 */

export interface RoundAnswer {
  question: any;
  selected: number;
  correct: boolean;
  ms?: number;
}

export type Tick = 'correct' | 'wrong' | 'timeout';

/** One mark per question, in order: the round told as it happened. */
export function answerTicks(answers: RoundAnswer[]): Tick[] {
  return answers.map((a) => (a.correct ? 'correct' : a.selected === -1 ? 'timeout' : 'wrong'));
}

/** Longest run of consecutive correct answers, with 1-based question numbers. */
export function longestStreak(answers: RoundAnswer[]): { length: number; from: number; to: number } | null {
  let best = { length: 0, from: 0, to: 0 };
  let run = 0;
  answers.forEach((a, i) => {
    run = a.correct ? run + 1 : 0;
    if (run > best.length) best = { length: run, from: i - run + 2, to: i + 1 };
  });
  return best.length > 0 ? best : null;
}

/** Correct-answer streak ending at the latest answer (live, during play). */
export function currentStreak(answers: RoundAnswer[]): number {
  let n = 0;
  for (let i = answers.length - 1; i >= 0 && answers[i].correct; i -= 1) n += 1;
  return n;
}

/** The quickest CORRECT answer — a fast wrong answer is not an achievement. */
export function fastestCorrect(answers: RoundAnswer[]): { ms: number; index: number; question: any } | null {
  let best: { ms: number; index: number; question: any } | null = null;
  answers.forEach((a, index) => {
    if (!a.correct || typeof a.ms !== 'number' || !Number.isFinite(a.ms) || a.ms <= 0) return;
    if (!best || a.ms < best.ms) best = { ms: a.ms, index, question: a.question };
  });
  return best;
}

/** "2,4 s" / "2.4 s" — one decimal, the student's locale separator. */
export function formatSeconds(ms: number, isCreole = false): string {
  const s = Math.max(0, ms) / 1000;
  const txt = s < 10 ? s.toFixed(1) : String(Math.round(s));
  return `${isCreole ? txt : txt.replace('.', ',')} s`;
}

/**
 * A personal best on this theme, from the profile as it stood BEFORE this
 * round was saved. Only a real improvement over a real earlier game counts:
 * a first game on a theme is not a "record".
 */
export function newThemeRecord(prev: { games?: number; bestPct?: number } | null | undefined, pct: number): { prevPct: number } | null {
  if (!prev || !prev.games || prev.games < 1) return null;
  const prevPct = Math.max(0, Math.floor(prev.bestPct || 0));
  return pct > prevPct ? { prevPct } : null;
}

/** How big the celebration is: proportional, never louder than the result. */
export type CelebrationSize = 'routine' | 'big';
export function celebrationSize({ score, total, record, leveledUp }: { score: number; total: number; record: boolean; leveledUp: boolean }): CelebrationSize {
  return (total > 0 && score === total) || record || leveledUp ? 'big' : 'routine';
}
