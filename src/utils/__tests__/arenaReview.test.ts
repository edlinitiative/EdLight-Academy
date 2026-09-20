/**
 * The integrity review's two pure decisions: what a pile of raw flags says
 * about a player, and what is still unresolved on the podium.
 *
 * `finalBlockers` is the load-bearing one. It is the only thing between an
 * admin's finalise press and $175 released over an open claim window, a tie
 * nobody adjudicated, or a player still carrying an unexamined `impossible:`
 * flag. Every case here is a way that press could be wrong.
 */
import {
  flagSummary,
  finalBlockers,
  correctIndividuals,
  type FinalGateInput,
} from '../../../shared/arena/review';
import type { ClaimRecord } from '../../../shared/arena/claims';

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;

const claim = (over: Partial<ClaimRecord> & { uid: string; rank: number }): ClaimRecord => ({
  prizeCents: 10_000,
  state: 'open',
  expiresAt: NOW + 48 * HOUR,
  ...over,
});

const gate = (over: Partial<FinalGateInput>): FinalGateInput => ({
  individuals: [{ uid: 'w1', rank: 1 }, { uid: 'w2', rank: 2 }, { uid: 'w3', rank: 3 }],
  claims: [
    claim({ uid: 'w1', rank: 1, state: 'verified' }),
    claim({ uid: 'w2', rank: 2, state: 'verified' }),
    claim({ uid: 'w3', rank: 3, state: 'verified' }),
  ],
  prizeCents: [10_000, 5_000, 2_500],
  decisions: {},
  flags: {},
  now: NOW,
  ...over,
});

describe('flagSummary', () => {
  it('counts each kind and remembers the worst focus reading', () => {
    const s = flagSummary(['fast:3', 'focus:3:4', 'focus:11:2', 'impossible:7']);
    expect(s).toMatchObject({ total: 4, fast: 1, focus: 2, impossible: 1, worstFocusLosses: 4 });
    expect(s.questions).toEqual([3, 7, 11]);
  });

  it('is empty for a player who never tripped anything', () => {
    expect(flagSummary([]).total).toBe(0);
    expect(flagSummary(undefined).total).toBe(0);
    expect(flagSummary('focus:1:2').total).toBe(0);
  });

  it('ignores a flag it does not recognise rather than miscounting it', () => {
    const s = flagSummary(['fast:2', 'teleported:2', '', 'focus:notanumber:3']);
    expect(s.total).toBe(1);
    expect(s.fast).toBe(1);
  });
});

describe('finalBlockers', () => {
  it('lets a fully verified podium through', () => {
    expect(finalBlockers(gate({}))).toEqual([]);
  });

  it('refuses while a claim window is still open', () => {
    const blockers = finalBlockers(gate({
      claims: [
        claim({ uid: 'w1', rank: 1, state: 'open' }),
        claim({ uid: 'w2', rank: 2, state: 'verified' }),
        claim({ uid: 'w3', rank: 3, state: 'verified' }),
      ],
    }));
    expect(blockers).toEqual([{ rank: 1, uids: ['w1'], why: 'claim_unresolved' }]);
  });

  it('refuses while a claim is waiting on the verification call', () => {
    const blockers = finalBlockers(gate({
      claims: [
        claim({ uid: 'w1', rank: 1, state: 'claimed' }),
        claim({ uid: 'w2', rank: 2, state: 'verified' }),
        claim({ uid: 'w3', rank: 3, state: 'verified' }),
      ],
    }));
    expect(blockers.map((b) => b.why)).toEqual(['claim_unresolved']);
  });

  /*
   * The window running out does NOT resolve anything by itself: an expired
   * claim is a prize that has to roll down to somebody, and finalising over it
   * is how a prize silently goes unpaid.
   */
  it('refuses an expired claim that has not rolled down', () => {
    const blockers = finalBlockers(gate({
      claims: [
        claim({ uid: 'w1', rank: 1, state: 'open', expiresAt: NOW - HOUR }),
        claim({ uid: 'w2', rank: 2, state: 'verified' }),
        claim({ uid: 'w3', rank: 3, state: 'verified' }),
      ],
    }));
    expect(blockers).toEqual([{ rank: 1, uids: ['w1'], why: 'prize_unassigned' }]);
  });

  it('accepts a prize that has rolled down to a verified successor', () => {
    const blockers = finalBlockers(gate({
      claims: [
        claim({ uid: 'w1', rank: 1, state: 'rejected', expiresAt: NOW - HOUR }),
        claim({ uid: 'w4', rank: 1, state: 'verified', expiresAt: NOW + 70 * HOUR }),
        claim({ uid: 'w2', rank: 2, state: 'verified' }),
        claim({ uid: 'w3', rank: 3, state: 'verified' }),
      ],
    }));
    expect(blockers).toEqual([]);
  });

  /*
   * `podiumClaims` writes a placeholder for only the FIRST finisher at a
   * paying rank and leaves a tie for human review — deliberately. Nothing
   * downstream noticed that the tie was still sitting there.
   */
  it('refuses a tie at a paying rank', () => {
    const blockers = finalBlockers(gate({
      individuals: [{ uid: 'w1', rank: 1 }, { uid: 'w1b', rank: 1 }, { uid: 'w3', rank: 3 }],
      claims: [
        claim({ uid: 'w1', rank: 1, state: 'verified' }),
        claim({ uid: 'w3', rank: 3, state: 'verified' }),
      ],
    }));
    expect(blockers).toContainEqual({ rank: 1, uids: ['w1', 'w1b'], why: 'tie_unresolved' });
  });

  it('treats a disqualified finisher as out of the tie rather than in it', () => {
    const blockers = finalBlockers(gate({
      individuals: [{ uid: 'w1', rank: 1 }, { uid: 'w1b', rank: 1 }, { uid: 'w3', rank: 3 }],
      claims: [
        claim({ uid: 'w1', rank: 1, state: 'verified' }),
        claim({ uid: 'w3', rank: 3, state: 'verified' }),
      ],
      decisions: { w1b: 'disqualified' },
    }));
    expect(blockers).toEqual([]);
  });

  it('refuses a holder whose flags nobody has ruled on', () => {
    const blockers = finalBlockers(gate({
      flags: { w2: ['impossible:4'] },
    }));
    expect(blockers).toEqual([{ rank: 2, uids: ['w2'], why: 'unreviewed_flags' }]);
  });

  it('accepts once those flags have a recorded decision', () => {
    const blockers = finalBlockers(gate({
      flags: { w2: ['impossible:4'] },
      decisions: { w2: 'cleared' },
    }));
    expect(blockers).toEqual([]);
  });

  /*
   * A disqualification that never rolled the prize down leaves the board
   * saying one thing and the claim saying another. Finalising there pays the
   * student the review just removed.
   */
  it('refuses a disqualified player who is still holding the prize', () => {
    const blockers = finalBlockers(gate({
      decisions: { w1: 'disqualified' },
      claims: [
        claim({ uid: 'w1', rank: 1, state: 'verified' }),
        claim({ uid: 'w2', rank: 2, state: 'verified' }),
        claim({ uid: 'w3', rank: 3, state: 'verified' }),
      ],
    }));
    expect(blockers).toContainEqual({ rank: 1, uids: ['w1'], why: 'disqualified_holder' });
  });

  it('ignores flags on a player nowhere near the money', () => {
    const blockers = finalBlockers(gate({ flags: { someoneElse: ['fast:1', 'focus:2:5'] } }));
    expect(blockers).toEqual([]);
  });

  /*
   * Three prizes and two finishers is a real outcome for a first event. The
   * third prize has nobody to pay and must not hold the tournament open.
   */
  it('does not block on a prize rank nobody reached', () => {
    const blockers = finalBlockers(gate({
      individuals: [{ uid: 'w1', rank: 1 }, { uid: 'w2', rank: 2 }],
      claims: [
        claim({ uid: 'w1', rank: 1, state: 'verified' }),
        claim({ uid: 'w2', rank: 2, state: 'verified' }),
      ],
    }));
    expect(blockers).toEqual([]);
  });

  it('refuses a podium rank that was announced with no claim document at all', () => {
    const blockers = finalBlockers(gate({
      claims: [
        claim({ uid: 'w2', rank: 2, state: 'verified' }),
        claim({ uid: 'w3', rank: 3, state: 'verified' }),
      ],
    }));
    expect(blockers).toEqual([{ rank: 1, uids: ['w1'], why: 'prize_unassigned' }]);
  });

  it('reports every unresolved rank, lowest first', () => {
    const blockers = finalBlockers(gate({
      claims: [
        claim({ uid: 'w1', rank: 1, state: 'claimed' }),
        claim({ uid: 'w2', rank: 2, state: 'verified' }),
        claim({ uid: 'w3', rank: 3, state: 'open' }),
      ],
    }));
    expect(blockers.map((b) => b.rank)).toEqual([1, 3]);
  });

  it('ignores a prize rank the tournament does not pay', () => {
    const blockers = finalBlockers(gate({
      prizeCents: [10_000, 5_000, 0],
      claims: [
        claim({ uid: 'w1', rank: 1, state: 'verified' }),
        claim({ uid: 'w2', rank: 2, state: 'verified' }),
      ],
    }));
    expect(blockers).toEqual([]);
  });
});

describe('correctIndividuals', () => {
  const board = [
    { uid: 'a', rank: 1, schoolKey: 'codosa', score: 900 },
    { uid: 'b', rank: 2, schoolKey: 'sldg', score: 800 },
    { uid: 'c', rank: 3, schoolKey: 'cmdm', score: 700 },
    { uid: 'd', rank: 4, schoolKey: 'codosa', score: 600 },
  ];

  it('leaves an untouched board alone', () => {
    const out = correctIndividuals(board, new Set());
    expect(out.individuals).toEqual(board);
    expect(out.removed).toEqual([]);
  });

  it('closes the gap when the winner is removed', () => {
    const out = correctIndividuals(board, new Set(['a']));
    expect(out.individuals.map((r) => [r.uid, r.rank])).toEqual([['b', 1], ['c', 2], ['d', 3]]);
    expect(out.removed.map((r) => r.uid)).toEqual(['a']);
  });

  it('never re-scores: the order is the announced order', () => {
    const out = correctIndividuals(board, new Set(['b']));
    expect(out.individuals.map((r) => r.uid)).toEqual(['a', 'c', 'd']);
    expect(out.individuals.map((r) => r.score)).toEqual([900, 700, 600]);
  });

  /*
   * A tie that was announced stays a tie. Re-deriving ranks from position
   * would quietly break the two students apart, and the prize was paid on the
   * board people watched.
   */
  it('keeps a shared rank shared after someone above is removed', () => {
    const tied = [
      { uid: 'a', rank: 1, schoolKey: 'codosa' },
      { uid: 'b', rank: 2, schoolKey: 'sldg' },
      { uid: 'c', rank: 2, schoolKey: 'cmdm' },
      { uid: 'd', rank: 4, schoolKey: 'codosa' },
    ];
    const out = correctIndividuals(tied, new Set(['a']));
    expect(out.individuals.map((r) => [r.uid, r.rank])).toEqual([['b', 1], ['c', 1], ['d', 3]]);
  });

  it('names the schools whose mean can no longer be trusted', () => {
    const out = correctIndividuals(board, new Set(['a', 'd']));
    expect(out.affectedSchools).toEqual(['codosa']);
  });

  it('survives every finisher being removed', () => {
    const out = correctIndividuals(board, new Set(['a', 'b', 'c', 'd']));
    expect(out.individuals).toEqual([]);
    expect(out.removed).toHaveLength(4);
  });
});
