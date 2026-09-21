/**
 * warmUpQuestions — what the Arena waiting room practises on.
 *
 * Its own module, not a helper inside the component, for two reasons: it can
 * be tested without mounting React, and the rule it enforces is one worth
 * finding in a file of its own.
 *
 * THE QUESTIONS COME FROM THE PRACTICE BANK, NEVER THE TOURNAMENT'S.
 * `TRIVIA_QUESTIONS` ships inside the app WITH its answers, which is exactly
 * what a tournament bank can never do (integrity rule 1: the answer key never
 * reaches a client). Reaching for the real questions to warm up on would put
 * the key on the phone ten minutes before the event.
 */
import { TRIVIA_QUESTIONS } from '../data/triviaData';

export interface WarmUpQuestion {
  q: string;
  qHt?: string;
  options: string[];
  optionsHt?: string[];
  answer: number;
}

/** Categories a secondary student can answer cold, mixed so it never drills. */
export const WARMUP_POOL: Array<keyof typeof TRIVIA_QUESTIONS> = [
  'histoire_haiti', 'geo_haiti', 'sciences', 'maths_eclair', 'culture_haiti', 'anglais_vocab',
];

export function pickWarmUpQuestions(count: number): WarmUpQuestion[] {
  const pool: WarmUpQuestion[] = [];
  for (const key of WARMUP_POOL) {
    const bank = TRIVIA_QUESTIONS[key] as WarmUpQuestion[] | undefined;
    if (Array.isArray(bank)) pool.push(...bank);
  }
  /*
   * Fisher–Yates on a COPY. The banks are module-level state shared with the
   * Trivia tab and the daily challenge; shuffling one in place would reorder
   * somebody else's game from inside the Arena's waiting room.
   */
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.max(0, count));
}
