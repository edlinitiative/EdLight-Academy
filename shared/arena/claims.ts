/**
 * arena/claims — what state a prize claim is in, and who holds a prize.
 *
 * Extracted from `api/arena/claim.ts`, which still re-exports every name here
 * so nothing that imported them had to change. The move is not tidying: the
 * finalisation gate (`api/arena/state.ts`) and the run console
 * (`src/services/arenaAdminService.ts`) both have to answer "is this prize
 * still unresolved?", and `src/` cannot import from `api/`. A second copy of
 * `currentHolder` living in the console is the "machine re-implemented per
 * surface" that `shared/arena/state.ts` opens by warning against — except this
 * machine decides who gets paid.
 *
 * Pure and framework-free. No Firestore, no timers: `now` is always passed in.
 */

export type ClaimState = 'open' | 'claimed' | 'verified' | 'rejected' | 'expired';

/** States in which a prize is SPOKEN FOR and may not be offered to anyone else. */
export const HOLDING_STATES: readonly ClaimState[] = ['open', 'claimed', 'verified'];

export interface ClaimRecord {
  uid: string;
  /** The PRIZE rank this claim is for. */
  rank: number;
  prizeCents: number;
  state: ClaimState;
  /** Epoch ms. The published deadline this claim must be completed by. */
  expiresAt: number;
}

/**
 * An 'open' claim whose published window has passed is EXPIRED, whatever the
 * document still says.
 *
 * Derived rather than stored-and-trusted because the transition from open to
 * expired happens on a clock, not on a request: nobody calls an endpoint at the
 * 72-hour mark. The sweep writes the state down afterwards, but every decision
 * that depends on it reads it through here first, so a sweep that has not run
 * yet can never hand a prize to two people at once.
 */
export function effectiveClaimState(claim: ClaimRecord | undefined, now: number): ClaimState | null {
  if (!claim) return null;
  if (claim.state === 'open' && now >= claim.expiresAt) return 'expired';
  return claim.state;
}

/**
 * Which claim document currently owns prize `rank`?
 *
 * A prize that has rolled down leaves TWO documents carrying the same `rank`:
 * the vacated one (expired or rejected) and the new holder's. Taking whichever
 * the collection happened to return first would roll the prize down a second
 * time from somebody who never held it, and hand the same money to two
 * students — the single worst outcome this code can produce.
 *
 * So: a claim in a holding state owns the prize outright, because only one can
 * be. Otherwise the most recently OFFERED one wins, which is the greatest
 * `expiresAt` — every roll-down stamps a fresh 72-hour window, so the newest
 * offer always has the latest deadline. Uid breaks a tie, purely so the
 * function is deterministic rather than dependent on document order.
 */
export function currentHolder(
  claims: ClaimRecord[],
  rank: number,
  now: number,
): ClaimRecord | undefined {
  const atRank = claims.filter((c) => c.rank === rank);
  if (atRank.length <= 1) return atRank[0];

  const holding = atRank.filter((c) => {
    const state = effectiveClaimState(c, now);
    return state !== null && HOLDING_STATES.includes(state);
  });
  const pool = holding.length > 0 ? holding : atRank;

  return [...pool].sort(
    (a, b) => (b.expiresAt - a.expiresAt) || a.uid.localeCompare(b.uid),
  )[0];
}
