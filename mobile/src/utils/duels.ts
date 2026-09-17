import type { Challenge } from '../services/challengeService';

/**
 * Reading a duel from the challenger's side.
 *
 * The scores on the document are always stored challenger-vs-opponent, but the
 * person looking at this list IS the challenger, so "lost" means the opponent
 * scored higher. Getting that backwards would tell a student they had won a
 * duel they lost, which is the one thing this feature cannot get wrong.
 */
export type DuelOutcome = 'won' | 'lost' | 'tie';

export function duelOutcome(c: Pick<Challenge, 'challengerScore' | 'opponent'>): DuelOutcome {
  const theirs = c.opponent?.score ?? 0;
  if (theirs > c.challengerScore) return 'lost';
  if (theirs === c.challengerScore) return 'tie';
  return 'won';
}

/** Duels that came back — the only ones worth showing. */
export function returnedDuels(all: Challenge[]): Challenge[] {
  return all.filter((c) => c.status === 'played' && !!c.opponent);
}

/**
 * Results the player has not seen yet. An empty `seen` list means we have not
 * read it back from storage; treat everything as seen so a "you were beaten"
 * card never flashes on screen during a cold start.
 */
export function unseenDuels(played: Challenge[], seen: string[] | null): Challenge[] {
  if (seen === null) return [];
  return played.filter((c) => !seen.includes(c.code));
}
