import {
  POINTS_FULL, POINTS_HALF, RENDER_GRACE_MS, TIER_FULL_MS, TIER_HALF_MS,
  clampShownAt, isImpossible, rankIndividuals, rankSchools, scoreAnswer, teamScore, tierFor,
  type PlayerInput, type SchoolInput,
} from '../../../shared/arena/scoring';

const OPENS = 1_700_000_000_000;

/** A submission that renders the instant the question opens, answered after `ms`. */
const answerAfter = (ms: number, correct = true) => scoreAnswer({
  correct,
  opensAt: OPENS,
  clientShownAt: OPENS,
  serverReceivedAt: OPENS + ms,
});

describe('tier boundaries — where a cheat gets priced', () => {
  it('scores full at exactly 12000ms, because the boundary is inclusive', () => {
    expect(answerAfter(TIER_FULL_MS).tier).toBe('full');
    expect(answerAfter(TIER_FULL_MS).points).toBe(POINTS_FULL);
  });

  it('drops to half one millisecond past the full boundary', () => {
    expect(answerAfter(TIER_FULL_MS + 1).tier).toBe('half');
    expect(answerAfter(TIER_FULL_MS + 1).points).toBe(POINTS_HALF);
  });

  it('still scores half at exactly 20000ms', () => {
    expect(answerAfter(TIER_HALF_MS).tier).toBe('half');
    expect(answerAfter(TIER_HALF_MS).points).toBe(POINTS_HALF);
  });

  it('scores nothing one millisecond past the half boundary — the late submission still lands and still counts as participation', () => {
    const late = answerAfter(TIER_HALF_MS + 1);
    expect(late.tier).toBe('none');
    expect(late.points).toBe(0);
    expect(late.elapsedMs).toBe(TIER_HALF_MS + 1);
  });

  it('prices a screenshot-to-AI round trip at half at best', () => {
    // A realistic capture → prompt → read → answer trip lands 15–25s in.
    expect(answerAfter(15_000).points).toBe(POINTS_HALF);
    expect(answerAfter(25_000).points).toBe(0);
    // ...and loses outright to a student who simply knew it.
    expect(answerAfter(4_000).points).toBeGreaterThan(answerAfter(15_000).points);
  });

  it('scores an instant answer at the full tier', () => {
    expect(tierFor(0)).toBe('full');
    expect(answerAfter(0).points).toBe(POINTS_FULL);
  });
});

describe('a wrong answer', () => {
  it('scores zero but still reports tier and elapsed, because that timing is the integrity evidence', () => {
    const wrong = answerAfter(900, false);
    expect(wrong.points).toBe(0);
    expect(wrong.tier).toBe('full');      // fast — a sub-second answer is a flag, not a score
    expect(wrong.elapsedMs).toBe(900);
  });

  it('reports the same tier a correct answer at the same speed would have', () => {
    expect(answerAfter(13_000, false).tier).toBe(answerAfter(13_000, true).tier);
  });
});

describe('the render clamp — bounded in both directions', () => {
  it('starts the clock at the question open when a client claims it rendered BEFORE the question existed', () => {
    const s = scoreAnswer({
      correct: true, opensAt: OPENS, clientShownAt: OPENS - 60_000, serverReceivedAt: OPENS + 5_000,
    });
    expect(s.clampedShownAt).toBe(OPENS);
    expect(s.elapsedMs).toBe(5_000);
    expect(s.points).toBe(POINTS_FULL); // an ancient report must not score them out of every tier
  });

  it('caps a claimed-late render at three seconds, so an exploit can never gain more than the grace', () => {
    const honest = scoreAnswer({
      correct: true, opensAt: OPENS, clientShownAt: OPENS + RENDER_GRACE_MS, serverReceivedAt: OPENS + 14_000,
    });
    const liar = scoreAnswer({
      correct: true, opensAt: OPENS, clientShownAt: OPENS + 60_000, serverReceivedAt: OPENS + 14_000,
    });
    expect(liar.clampedShownAt).toBe(OPENS + RENDER_GRACE_MS);
    expect(liar.elapsedMs).toBe(honest.elapsedMs);
    expect(liar.points).toBe(honest.points);
  });

  it('never lets a claimed render buy a tier it could not buy at the grace ceiling', () => {
    // Real span 15.5s: at best the clamp shaves 3s → 12.5s, still only half.
    const cheat = scoreAnswer({
      correct: true, opensAt: OPENS, clientShownAt: OPENS + 999_999, serverReceivedAt: OPENS + 15_500,
    });
    expect(cheat.tier).toBe('half');
    // 3s is the entire exploit: the boundary only moves from 12s to 15s of real time.
    expect(scoreAnswer({
      correct: true, opensAt: OPENS, clientShownAt: OPENS + 999_999, serverReceivedAt: OPENS + 15_000,
    }).tier).toBe('full');
    expect(scoreAnswer({
      correct: true, opensAt: OPENS, clientShownAt: OPENS + 999_999, serverReceivedAt: OPENS + 15_001,
    }).tier).toBe('half');
  });

  it('protects a slow connection: a late render gets its full thinking time', () => {
    // Question opened at 0, phone painted it at +3s, answered 10s after seeing it.
    const slow = scoreAnswer({
      correct: true, opensAt: OPENS, clientShownAt: OPENS + 3_000, serverReceivedAt: OPENS + 13_000,
    });
    expect(slow.elapsedMs).toBe(10_000);
    expect(slow.points).toBe(POINTS_FULL); // 13s since open, but only 10s since it was readable
  });

  it('falls back to the server clock when the client reports nothing usable, so silence never buys time', () => {
    const s = scoreAnswer({
      correct: true, opensAt: OPENS, clientShownAt: Number.NaN, serverReceivedAt: OPENS + 12_500,
    });
    expect(s.clampedShownAt).toBe(OPENS);
    expect(s.tier).toBe('half'); // no grace awarded for an unusable report
  });

  it('does not score an honest fast student zero when their device clock runs ahead', () => {
    // Phone 3s fast: it reports a render time later than our own receipt.
    const skewed = scoreAnswer({
      correct: true, opensAt: OPENS, clientShownAt: OPENS + 3_000, serverReceivedAt: OPENS + 1_200,
    });
    expect(skewed.elapsedMs).toBe(0);
    expect(skewed.points).toBe(POINTS_FULL);
  });

  it('clamps in isolation', () => {
    expect(clampShownAt(OPENS - 1, OPENS)).toBe(OPENS);
    expect(clampShownAt(OPENS + 1_500, OPENS)).toBe(OPENS + 1_500);
    expect(clampShownAt(OPENS + RENDER_GRACE_MS + 1, OPENS)).toBe(OPENS + RENDER_GRACE_MS);
  });
});

describe('impossible answers', () => {
  it('rejects an answer the server received before it opened the question', () => {
    const input = { correct: true, opensAt: OPENS, clientShownAt: OPENS, serverReceivedAt: OPENS - 1 };
    expect(isImpossible(input)).toBe(true);
    expect(scoreAnswer(input).tier).toBe('none');
    expect(scoreAnswer(input).points).toBe(0);
  });

  it('keeps the negative elapsed, because the negative is the finding', () => {
    const s = scoreAnswer({
      correct: true, opensAt: OPENS, clientShownAt: OPENS, serverReceivedAt: OPENS - 5_000,
    });
    expect(s.elapsedMs).toBe(-5_000);
  });

  it('treats a non-finite server timestamp as impossible rather than letting NaN score someone zero silently', () => {
    expect(isImpossible({ correct: true, opensAt: OPENS, clientShownAt: OPENS, serverReceivedAt: Number.NaN })).toBe(true);
    expect(isImpossible({ correct: true, opensAt: Number.NaN, clientShownAt: OPENS, serverReceivedAt: OPENS })).toBe(true);
  });

  it('accepts an answer received on the exact millisecond the question opened', () => {
    const input = { correct: true, opensAt: OPENS, clientShownAt: OPENS, serverReceivedAt: OPENS };
    expect(isImpossible(input)).toBe(false);
    expect(scoreAnswer(input).points).toBe(POINTS_FULL);
  });
});

describe('teamScore — the mean, not the sum', () => {
  it('averages the top five rather than totalling them, so the number is comparable across schools', () => {
    const { teamAvg, counted } = teamScore([1000, 1000, 500, 500, 1000], 5);
    expect(teamAvg).toBe(800);     // NOT 4000
    expect(counted).toBe(5);
  });

  it('ignores everyone past the fifth, so bringing more students can never hurt', () => {
    const five = teamScore([1000, 1000, 1000, 1000, 1000], 5);
    const fifty = teamScore([1000, 1000, 1000, 1000, 1000, ...Array(45).fill(0)], 5);
    expect(fifty.teamAvg).toBe(five.teamAvg);
  });

  it('divides by the players it actually counted, so a short school is not punished twice', () => {
    const { teamAvg, counted } = teamScore([900, 700, 500], 5);
    expect(counted).toBe(3);
    expect(teamAvg).toBe(700); // 2100/3, not 2100/5
  });

  it('returns zero for a school with nobody present instead of dividing by zero', () => {
    expect(teamScore([], 5)).toEqual({ teamAvg: 0, counted: 0 });
  });
});

// ── rankSchools ─────────────────────────────────────────────────────────────

const school = (key: string, over: Partial<SchoolInput> = {}): SchoolInput => ({
  key,
  label: key.toUpperCase(),
  playerScores: [1000, 1000, 1000, 1000, 1000],
  playerTotalMs: [5_000, 5_000, 5_000, 5_000, 5_000],
  playerCorrect: [5, 5, 5, 5, 5],
  qualifiedAt: 1_000,
  ...over,
});

const OPTS = { teamSize: 5, minPlayers: 5 };
const order = (s: { key: string }[]) => s.map((x) => x.key);
const uids = (s: { uid: string }[]) => s.map((x) => x.uid);

describe('rankSchools — qualification', () => {
  it('ranks a school with five present and leaves one with four unranked', () => {
    const out = rankSchools([
      school('short', { playerScores: [1000, 1000, 1000, 1000], playerTotalMs: [1, 1, 1, 1], playerCorrect: [5, 5, 5, 5] }),
      school('full'),
    ], OPTS);
    expect(out.find((s) => s.key === 'full')!.rank).toBe(1);
    expect(out.find((s) => s.key === 'short')!.rank).toBe(0);
  });

  it('sorts every unqualified school below every qualified one, however good its average', () => {
    const out = rankSchools([
      school('genius', { playerScores: [1000, 1000, 1000, 1000], playerTotalMs: [1, 1, 1, 1], playerCorrect: [5, 5, 5, 5] }),
      school('modest', { playerScores: [100, 100, 100, 100, 100] }),
    ], OPTS);
    expect(order(out)).toEqual(['modest', 'genius']);
  });

  it('tells a short school exactly how many more players it needs — the only message a student can act on tonight', () => {
    const out = rankSchools([school('a', { playerScores: [500, 500, 500], playerTotalMs: [1, 1, 1], playerCorrect: [1, 1, 1] })], OPTS);
    expect(out[0].needed).toBe(2);
    expect(out[0].members).toBe(3);
    expect(out[0].qualified).toBe(false);
  });

  it('reports needed 0 once the school is in the running', () => {
    expect(rankSchools([school('a')], OPTS)[0].needed).toBe(0);
  });

  it('counts players present, not players registered — a lobby of five with three in the room has three', () => {
    const out = rankSchools([school('a', {
      playerScores: [1000, 1000, 1000], playerTotalMs: [1, 1, 1], playerCorrect: [5, 5, 5],
    })], OPTS);
    expect(out[0].members).toBe(3);
    expect(out[0].qualified).toBe(false);
  });
});

describe('rankSchools — tiebreakers, each in isolation', () => {
  it('1 · the higher team average wins', () => {
    const out = rankSchools([
      school('low', { playerScores: [1000, 1000, 500, 500, 500] }),
      school('high', { playerScores: [1000, 1000, 1000, 500, 500] }),
    ], OPTS);
    expect(order(out)).toEqual(['high', 'low']);
  });

  it('2 · on an equal average, the school that was FASTER to it wins', () => {
    const out = rankSchools([
      school('slow', { playerTotalMs: [9_000, 9_000, 9_000, 9_000, 9_000] }),
      school('fast', { playerTotalMs: [4_000, 4_000, 4_000, 4_000, 4_000] }),
    ], OPTS);
    expect(order(out)).toEqual(['fast', 'slow']);
  });

  it('3 · on an equal average and time, more correct answers across the five wins', () => {
    const out = rankSchools([
      school('fewer', { playerCorrect: [4, 4, 4, 4, 4] }),
      school('more', { playerCorrect: [5, 5, 5, 5, 5] }),
    ], OPTS);
    expect(order(out)).toEqual(['more', 'fewer']);
  });

  it('4 · everything else level, the school that qualified EARLIER wins', () => {
    const out = rankSchools([
      school('late', { qualifiedAt: 5_000 }),
      school('early', { qualifiedAt: 2_000 }),
    ], OPTS);
    expect(order(out)).toEqual(['early', 'late']);
  });

  it('sends a school with no qualification timestamp behind one that has one, rather than letting it win by absence', () => {
    const out = rankSchools([
      school('unknown', { qualifiedAt: undefined }),
      school('known', { qualifiedAt: 9_999_999 }),
    ], OPTS);
    expect(order(out)).toEqual(['known', 'unknown']);
  });

  it('decides on the FOURTH tiebreaker when average, time and correct all tie', () => {
    const base = {
      playerScores: [1000, 1000, 500, 500, 500],
      playerTotalMs: [6_000, 6_000, 6_000, 6_000, 6_000],
      playerCorrect: [3, 3, 3, 3, 3],
    };
    const out = rankSchools([
      school('b', { ...base, qualifiedAt: 8_000 }),
      school('a', { ...base, qualifiedAt: 7_999 }),
    ], OPTS);
    expect(out[0].teamAvg).toBe(out[1].teamAvg);
    expect(out[0].teamTotalMs).toBe(out[1].teamTotalMs);
    expect(out[0].teamCorrect).toBe(out[1].teamCorrect);
    expect(order(out)).toEqual(['a', 'b']);
    expect(out.map((s) => s.rank)).toEqual([1, 2]);
  });

  it('holds two schools at the same rank and skips the next when all four tiebreakers are level', () => {
    const out = rankSchools([school('a'), school('b'), school('c', { playerScores: [100, 100, 100, 100, 100] })], OPTS);
    expect(out.map((s) => s.rank)).toEqual([1, 1, 3]);
  });
});

describe('rankSchools — the top five is five PLAYERS, not five of each column', () => {
  it('sums the response time of the five selected by score, not the five fastest', () => {
    // The 100-point player is the fastest on the team and must not count.
    const out = rankSchools([school('a', {
      playerScores: [1000, 1000, 1000, 1000, 1000, 100],
      playerTotalMs: [5_000, 5_000, 5_000, 5_000, 5_000, 10],
      playerCorrect: [5, 5, 5, 5, 5, 1],
    })], OPTS);
    expect(out[0].teamAvg).toBe(1000);
    expect(out[0].teamTotalMs).toBe(25_000); // not 20_010
    expect(out[0].teamCorrect).toBe(25);
    expect(out[0].counted).toBe(5);
    expect(out[0].members).toBe(6);
  });

  it('breaks a tie for the fifth slot deterministically, so the counted time cannot wobble between ticks', () => {
    const contested: SchoolInput = school('a', {
      playerScores: [1000, 1000, 1000, 1000, 500, 500],
      playerTotalMs: [1_000, 1_000, 1_000, 1_000, 9_000, 3_000],
      playerCorrect: [5, 5, 5, 5, 2, 2],
    });
    // Both candidates for slot five score 500; the faster one takes it.
    expect(rankSchools([contested], OPTS)[0].teamTotalMs).toBe(7_000);
  });
});

describe('rankSchools — determinism, because the broadcast animates the difference between runs', () => {
  const field: SchoolInput[] = [
    school('codosa', { playerScores: [1000, 1000, 1000, 500, 500], playerTotalMs: [4_000, 4_000, 4_000, 4_000, 4_000] }),
    school('sldg', { playerScores: [1000, 1000, 1000, 500, 500], playerTotalMs: [4_000, 4_000, 4_000, 4_000, 4_000] }),
    school('canado', { playerScores: [1000, 500, 500, 500, 500] }),
    school('stlouis', { playerScores: [1000, 1000, 500, 500, 500] }),
    school('shortone', { playerScores: [1000, 1000], playerTotalMs: [1, 1], playerCorrect: [5, 5] }),
  ];

  it('returns an identical order when re-run on identical input', () => {
    expect(order(rankSchools(field, OPTS))).toEqual(order(rankSchools(field, OPTS)));
  });

  it('returns an identical order when the same schools arrive in a different order, which is what a fresh query gives us', () => {
    const shuffled = [field[3], field[0], field[4], field[2], field[1]];
    expect(order(rankSchools(shuffled, OPTS))).toEqual(order(rankSchools(field, OPTS)));
    expect(rankSchools(shuffled, OPTS).map((s) => s.rank)).toEqual(rankSchools(field, OPTS).map((s) => s.rank));
  });

  it('assigns the same ranks on every reversal of the input', () => {
    const reversed = [...field].reverse();
    expect(order(rankSchools(reversed, OPTS))).toEqual(order(rankSchools(field, OPTS)));
  });
});

// ── rankIndividuals ─────────────────────────────────────────────────────────

const player = (uid: string, over: Partial<PlayerInput> = {}): PlayerInput => ({
  uid, displayName: uid, schoolKey: 'codosa', score: 20_000, totalMs: 100_000, fullTierCount: 20, registeredAt: 500, ...over,
});

describe('rankIndividuals — the cash podium', () => {
  it('1 · ranks by score descending', () => {
    const out = rankIndividuals([player('b', { score: 18_000 }), player('a', { score: 21_000 })]);
    expect(uids(out).slice(0, 2)).toEqual(['a', 'b']);
    expect(out[0].rank).toBe(1);
  });

  it('2 · on an equal score, the faster player wins', () => {
    const out = rankIndividuals([player('slow', { totalMs: 200_000 }), player('fast', { totalMs: 90_000 })]);
    expect(uids(out)).toEqual(['fast', 'slow']);
  });

  it('3 · on an equal score and time, more full-tier answers wins', () => {
    const out = rankIndividuals([player('fewer', { fullTierCount: 12 }), player('more', { fullTierCount: 19 })]);
    expect(uids(out)).toEqual(['more', 'fewer']);
  });

  it('4 · everything else level, the earlier registration wins', () => {
    const out = rankIndividuals([player('late', { registeredAt: 900 }), player('early', { registeredAt: 100 })]);
    expect(uids(out)).toEqual(['early', 'late']);
  });

  it('decides on the fourth tiebreaker when score, time and full-tier count all tie', () => {
    const out = rankIndividuals([
      player('b', { score: 19_500, totalMs: 111_000, fullTierCount: 17, registeredAt: 400 }),
      player('a', { score: 19_500, totalMs: 111_000, fullTierCount: 17, registeredAt: 399 }),
    ]);
    expect(uids(out)).toEqual(['a', 'b']);
    expect(out.map((s) => s.rank)).toEqual([1, 2]);
  });

  it('shares a rank on a genuine dead heat rather than inventing a winner of prize money', () => {
    const tie = { score: 19_500, totalMs: 111_000, fullTierCount: 17, registeredAt: 400 };
    const out = rankIndividuals([player('a', tie), player('b', tie), player('c', { score: 100 })]);
    expect(out.map((s) => s.rank)).toEqual([1, 1, 3]);
  });

  it('is stable across recomputation whatever order the players arrive in', () => {
    const field = [player('a', { score: 900 }), player('b', { score: 900, totalMs: 50 }), player('c', { score: 1_200 })];
    expect(uids(rankIndividuals(field))).toEqual(uids(rankIndividuals([...field].reverse())));
  });

  it('caps the list only AFTER ranking, so a podium is the real top three', () => {
    const out = rankIndividuals(
      [player('c', { score: 10 }), player('a', { score: 30 }), player('d', { score: 5 }), player('b', { score: 20 })],
      { limit: 3 },
    );
    expect(uids(out)).toEqual(['a', 'b', 'c']);
  });

  it('handles an empty field without throwing', () => {
    expect(rankIndividuals([])).toEqual([]);
    expect(rankSchools([], OPTS)).toEqual([]);
  });
});
