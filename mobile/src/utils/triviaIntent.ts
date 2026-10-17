/**
 * Why the student opened Trivia (audit M1).
 *
 * "S'entraîner" and "Défier un ami" used to call the same callback, so a
 * friend challenge landed on the generic practice picker and the duel only
 * surfaced, as a secondary button, after the round. The intent now travels
 * from every host (Jeux "Jouer" row, the Arène segment, the ArenaHub root
 * route) through the theme picker to the result:
 *
 *  - practice   the picker as before (mixed draw, Défi du jour, round sizes);
 *  - challenge  a duel-able round only: one theme, a fixed short round with
 *               bank indexes, and the result leads with sending the duel.
 *
 * The duel itself is unchanged (trivia-duels): asynchronous, the friend
 * replays the identical questions from a link whenever they want.
 * Pure: no React.
 */

export type TriviaIntent = 'practice' | 'challenge';

/** Questions in a challenge round — short enough to send, long enough to win. */
export const CHALLENGE_ROUND = 5;

type T = (fr: string, ht: string) => string;

/** A route param (or anything) to an intent; unknown means practice. */
export function parseTriviaIntent(v: unknown): TriviaIntent {
  return v === 'challenge' ? 'challenge' : 'practice';
}

export interface IntentPlan {
  /** Show "Jouer un mélange de thèmes" (a mixed draw spans banks: no duel). */
  allowMixed: boolean;
  /** Show the Défi du jour card above the themes (daily rounds cannot duel). */
  showDaily: boolean;
  /** Fixed round size, skipping the round picker; null = let them choose. */
  fixedRound: number | null;
}

export function intentPlan(intent: TriviaIntent): IntentPlan {
  return intent === 'challenge'
    ? { allowMixed: false, showDaily: false, fixedRound: CHALLENGE_ROUND }
    : { allowMixed: true, showDaily: true, fixedRound: null };
}

/** The round size to play for a theme with `available` questions. */
export function roundSizeFor(intent: TriviaIntent, available: number): number | null {
  const fixed = intentPlan(intent).fixedRound;
  if (fixed == null) return null;
  return Math.max(0, Math.min(fixed, available));
}

/** The picker's title line and, for a challenge, the one-line format explainer. */
export function pickerCopy(intent: TriviaIntent, t: T): { title: string; subtitle: string; explainer: string | null } {
  if (intent === 'challenge') {
    return {
      title: t('Défier un ami', 'Defye yon zanmi'),
      subtitle: t('Choisis le thème du duel', 'Chwazi tèm dyèl la'),
      explainer: t(
        `Tu joues ${CHALLENGE_ROUND} questions, puis tu envoies un lien. Ton ami joue les mêmes questions quand il veut, et le meilleur score gagne.`,
        `Ou jwe ${CHALLENGE_ROUND} kesyon, epi ou voye yon lyen. Zanmi w jwe menm kesyon yo lè li vle, e pi bon nòt la genyen.`,
      ),
    };
  }
  return {
    title: 'Trivia',
    subtitle: t('Choisis un thème, ou mélange-les', 'Chwazi yon tèm, oswa melanje yo'),
    explainer: null,
  };
}

/**
 * Which action leads the result. A challenge round leads with sending the
 * duel when the round can become one; otherwise (and for practice) sharing
 * the score stays the primary.
 */
export function resultPrimary(intent: TriviaIntent, canChallenge: boolean): 'challenge' | 'share' {
  return intent === 'challenge' && canChallenge ? 'challenge' : 'share';
}
