/**
 * The duel bank, server side — the SAME file the app and the web play duels
 * from (mobile/src/data/triviaData.ts; see src/utils/duelBank.ts for why).
 * Used only to grade duel picks (shared/duelGrading.ts). Option order and the
 * generated decks' distractors are randomized at module load, which grading
 * ignores: it compares the picked text with the correct answer's text.
 */
import { TRIVIA_QUESTIONS } from '../../mobile/src/data/triviaData';
import type { GradableQuestion } from '../../shared/duelGrading';

export function serverDuelBank(categoryId: string): GradableQuestion[] | null {
  const bank = (TRIVIA_QUESTIONS as unknown as Record<string, GradableQuestion[]>)[categoryId];
  return Array.isArray(bank) && bank.length ? bank : null;
}
