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

/**
 * Who is looking at a received-duel card. Only a `candidate` may play: the
 * challenger can't accept their own duel (the server says self_challenge),
 * and once played, anyone but the recorded opponent is a spectator.
 */
export type DuelViewerRole = 'challenger' | 'opponent' | 'candidate' | 'spectator';

export function duelViewerRole(
  c: Pick<Challenge, 'challengerUid' | 'status' | 'opponent'>,
  uid: string | null | undefined,
): DuelViewerRole {
  if (uid && c.challengerUid === uid) return 'challenger';
  if (c.opponent) return uid && c.opponent.uid === uid ? 'opponent' : 'spectator';
  return c.status === 'played' ? 'spectator' : 'candidate';
}

/**
 * accept is one-shot: a retry whose FIRST post landed (only the response was
 * lost) answers `already_played`. If the recorded opponent is this student,
 * that is their result — return it instead of an error. XP is reported 0:
 * the payout happened server-side and this client does not guess the amount.
 * (Same rule as the web's useDuelSubmission.)
 */
export function recoveredAcceptOutcome(c: Challenge | null | undefined, uid: string | null | undefined) {
  if (!c || !uid || !c.opponent || c.opponent.uid !== uid) return null;
  const mine = c.opponent.score;
  return {
    result: (mine > c.challengerScore ? 'won' : mine === c.challengerScore ? 'tie' : 'lost') as 'won' | 'tie' | 'lost',
    challengerScore: c.challengerScore,
    opponentScore: mine,
    total: c.total,
    xpAwarded: 0,
    recovered: true as const,
  };
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
