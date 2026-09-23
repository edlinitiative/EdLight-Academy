/**
 * tournois/bracket — knockout pairing, byes and match resolution. Pure.
 *
 * A bracket is a list of rounds; each round is a list of matches between two
 * seeds (or a seed and a bye). Every player in a round plays the SAME round of
 * questions inside that round's window; the match goes to the higher score.
 *
 * Seeding is by join order (seed 1 joined first) — the creator's friends who
 * showed up early get the byes, which is the only honest thing a server can do
 * without ratings. Standard bracket placement keeps seeds 1 and 2 apart until
 * the final.
 */

export interface Entrant {
  uid: string;
  displayName: string;
  seed: number;
}

export interface MatchSide {
  uid: string;
  displayName: string;
  seed: number;
}

export interface Match {
  id: string;
  round: number;
  slot: number;
  a: MatchSide | null;
  b: MatchSide | null;
  /** Filled when the round closes. */
  winnerUid: string | null;
  scoreA: number | null;
  scoreB: number | null;
  /** 'pending' until decided; 'bye' when one side is empty; 'walkover' when a side did not play. */
  status: 'pending' | 'done' | 'bye' | 'walkover';
}

export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Standard bracket order for `size` slots: [1, size, size/2+1, size/2, …] so
 * that the top seeds meet as late as possible. Returns seed numbers per slot.
 */
export function bracketOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

export const matchId = (round: number, slot: number) => `r${round}m${slot}`;

/** Round 0 pairings. Empty slots are byes, and byes go to the top seeds. */
export function firstRound(entrants: Entrant[]): Match[] {
  const sorted = [...entrants].sort((x, y) => x.seed - y.seed);
  const size = nextPow2(Math.max(2, sorted.length));
  const bySeed = new Map(sorted.map((e, i) => [i + 1, e]));
  const order = bracketOrder(size);
  const matches: Match[] = [];
  for (let slot = 0; slot < size / 2; slot += 1) {
    const ea = bySeed.get(order[slot * 2]) || null;
    const eb = bySeed.get(order[slot * 2 + 1]) || null;
    const side = (e: Entrant | null): MatchSide | null => (e ? { uid: e.uid, displayName: e.displayName, seed: e.seed } : null);
    const a = side(ea);
    const b = side(eb);
    const bye = !a || !b;
    matches.push({
      id: matchId(0, slot),
      round: 0,
      slot,
      a,
      b,
      winnerUid: bye ? (a?.uid || b?.uid || null) : null,
      scoreA: null,
      scoreB: null,
      status: bye ? 'bye' : 'pending',
    });
  }
  return matches;
}

export interface RoundScore {
  points: number;
  correct: number;
  totalMs: number;
  /** Finished (or at least started) the round's attempt. */
  played: boolean;
}

/**
 * Decide one match from both sides' round scores.
 *
 * Higher points, then more correct, then less time; a side that did not play
 * loses by walkover; if neither played, the better (lower) seed goes through —
 * a bracket must always produce a winner, and inventing one at random would be
 * a coin toss nobody can check.
 */
export function resolveMatch(m: Match, scores: Record<string, RoundScore | undefined>): Match {
  if (m.status === 'bye' || m.status === 'done' || m.status === 'walkover') return m;
  const a = m.a;
  const b = m.b;
  if (!a || !b) return { ...m, status: 'bye', winnerUid: a?.uid || b?.uid || null };
  const sa = scores[a.uid];
  const sb = scores[b.uid];
  const pa = !!sa?.played;
  const pb = !!sb?.played;
  const out = { ...m, scoreA: sa?.points ?? 0, scoreB: sb?.points ?? 0 };
  if (!pa || !pb) {
    const winner = pa ? a : pb ? b : (a.seed <= b.seed ? a : b);
    return { ...out, status: 'walkover', winnerUid: winner.uid };
  }
  const cmp = (sb!.points - sa!.points) || (sb!.correct - sa!.correct) || (sa!.totalMs - sb!.totalMs) || (a.seed - b.seed);
  return { ...out, status: 'done', winnerUid: cmp <= 0 ? a.uid : b.uid };
}

/** Pair the winners of `round` into round+1, keeping bracket order. */
export function nextRound(resolved: Match[]): Match[] {
  const round = resolved[0]?.round ?? 0;
  const bySlot = [...resolved].sort((x, y) => x.slot - y.slot);
  const winnerSide = (m: Match): MatchSide | null => {
    if (!m.winnerUid) return null;
    if (m.a?.uid === m.winnerUid) return m.a;
    if (m.b?.uid === m.winnerUid) return m.b;
    return null;
  };
  const next: Match[] = [];
  for (let slot = 0; slot < Math.floor(bySlot.length / 2); slot += 1) {
    const a = winnerSide(bySlot[slot * 2]);
    const b = winnerSide(bySlot[slot * 2 + 1]);
    const bye = !a || !b;
    next.push({
      id: matchId(round + 1, slot),
      round: round + 1,
      slot,
      a,
      b,
      winnerUid: bye ? (a?.uid || b?.uid || null) : null,
      scoreA: null,
      scoreB: null,
      status: bye ? 'bye' : 'pending',
    });
  }
  return next;
}

/** Players who still play in `round` (a bye does not play). */
export function playersInRound(matches: Match[]): string[] {
  return matches
    .filter((m) => m.status === 'pending')
    .flatMap((m) => [m.a?.uid, m.b?.uid])
    .filter((u): u is string => !!u);
}
