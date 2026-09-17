import type { TeamStanding } from '../../../shared/leaderboardAgg';
import { diffStandings, overtakes } from '../../../shared/liveStandings';

/**
 * A standing as the spectator screen receives it. Only key, rank and teamXp
 * matter to the diff; the rest rides along so the shape is the real one.
 */
const standing = (
  key: string,
  rank: number,
  teamXp: number,
  extra: Partial<TeamStanding> = {},
): TeamStanding => ({
  key,
  label: key.toUpperCase(),
  teamXp,
  counted: 5,
  members: 5,
  qualified: rank > 0,
  needed: 0,
  rank,
  ...extra,
});

describe('diffStandings — the first poll must not animate', () => {
  it('marks nothing as new on first load, so the board does not arrive as confetti', () => {
    const first = [standing('a', 1, 900), standing('b', 2, 800), standing('c', 3, 700)];
    const diffed = diffStandings(null, first);

    expect(diffed.map((s) => s.isNew)).toEqual([false, false, false]);
    expect(diffed.map((s) => s.previousRank)).toEqual([null, null, null]);
    expect(diffed.map((s) => s.rankDelta)).toEqual([0, 0, 0]);
    expect(diffed.map((s) => s.xpDelta)).toEqual([0, 0, 0]);
  });

  it('keeps the ranked order it was given, so the list it animates is the list it was ranked as', () => {
    const next = [standing('c', 1, 900), standing('a', 2, 800), standing('b', 3, 700)];
    expect(diffStandings(null, next).map((s) => s.key)).toEqual(['c', 'a', 'b']);
    const previous = [standing('a', 1, 800), standing('b', 2, 700), standing('c', 3, 100)];
    expect(diffStandings(previous, next).map((s) => s.key)).toEqual(['c', 'a', 'b']);
  });
});

describe('diffStandings — direction of travel', () => {
  it('reports a climb as a POSITIVE delta, because the screen animates upward on a gain', () => {
    const previous = [standing('a', 1, 900), standing('b', 5, 500)];
    const next = [standing('b', 2, 950), standing('a', 1, 960)];
    const byKey = new Map(diffStandings(previous, next).map((s) => [s.key, s]));

    expect(byKey.get('b')!.previousRank).toBe(5);
    expect(byKey.get('b')!.rankDelta).toBe(3); // 5th → 2nd
    expect(byKey.get('b')!.isNew).toBe(false);
  });

  it('reports a drop as a negative delta, so a school that was passed is not celebrated', () => {
    const previous = [standing('a', 2, 900)];
    const next = [standing('a', 6, 900)];
    expect(diffStandings(previous, next)[0].rankDelta).toBe(-4);
  });

  it('calls an unmoved school unmoved, so a poll with no news animates nothing', () => {
    const previous = [standing('a', 3, 700)];
    const next = [standing('a', 3, 700)];
    const [s] = diffStandings(previous, next);
    expect(s.rankDelta).toBe(0);
    expect(s.xpDelta).toBe(0);
    expect(s.isNew).toBe(false);
  });

  it('treats qualifying into the running as an arrival, not a four-place fall', () => {
    // rank 0 means "cannot compete yet". Subtracting it as a number would play
    // the sinking animation over the best news of the round.
    const previous = [standing('a', 0, 200, { qualified: false, members: 3, needed: 2 })];
    const next = [standing('a', 4, 600)];
    expect(diffStandings(previous, next)[0].rankDelta).toBe(0);
    expect(diffStandings(previous, next)[0].previousRank).toBe(0);
  });
});

describe('diffStandings — arriving and leaving', () => {
  it('flags a school that appears mid-round as new, so it gets its entrance', () => {
    const previous = [standing('a', 1, 900)];
    const next = [standing('a', 1, 900), standing('z', 2, 500)];
    const z = diffStandings(previous, next).find((s) => s.key === 'z')!;
    expect(z.isNew).toBe(true);
    expect(z.previousRank).toBeNull();
    expect(z.rankDelta).toBe(0);
    expect(z.xpDelta).toBe(0); // no baseline, so nothing can be claimed as gained
  });

  it('treats a school that left and came back as new again, having no rank to move from', () => {
    const tick1 = [standing('a', 1, 900), standing('b', 2, 800)];
    const tick2 = [standing('a', 1, 900)];                       // b drops off
    const tick3 = [standing('a', 1, 900), standing('b', 2, 850)]; // b returns

    expect(diffStandings(tick1, tick2).map((s) => s.key)).toEqual(['a']);
    const b = diffStandings(tick2, tick3).find((s) => s.key === 'b')!;
    expect(b.isNew).toBe(true);
    expect(b.previousRank).toBeNull();
    expect(b.rankDelta).toBe(0);
    // Its 800 XP from two ticks ago is not a baseline any more; claiming a
    // 50-point gain here would be inventing progress nobody just made.
    expect(b.xpDelta).toBe(0);
  });
});

describe('diffStandings — score movement', () => {
  it('reports XP gained since the last poll', () => {
    const previous = [standing('a', 1, 900)];
    const next = [standing('a', 1, 1175)];
    expect(diffStandings(previous, next)[0].xpDelta).toBe(275);
  });

  it('never reports a negative gain, even when a corrected score drops', () => {
    // Scores do fall: a member is recounted, a student fixes their school, a
    // moderator removes an entry. Running the counter backwards on the big
    // screen would read to the room as a penalty the school never received.
    const previous = [standing('a', 1, 900)];
    const next = [standing('a', 2, 640)];
    const [s] = diffStandings(previous, next);
    expect(s.xpDelta).toBe(0);
    expect(s.rankDelta).toBe(-1); // the rank move is still reported honestly
  });
});

describe('overtakes — what the screen calls out as a moment', () => {
  it('returns only climbers, biggest climb first, so the four-place jump is the one announced', () => {
    const previous = [
      standing('slow', 1, 900),
      standing('mid', 2, 880),
      standing('rocket', 6, 500),
      standing('climber', 4, 700),
    ];
    const next = [
      standing('rocket', 2, 905),
      standing('climber', 3, 890),
      standing('slow', 4, 900),
      standing('mid', 5, 880),
    ];

    const moments = overtakes(diffStandings(previous, next));
    expect(moments.map((s) => s.key)).toEqual(['rocket', 'climber']);
    expect(moments.map((s) => s.rankDelta)).toEqual([4, 1]);
  });

  it('settles equal climbs by final position, so the highlight cannot flicker between two schools', () => {
    const previous = [standing('low', 8, 400), standing('high', 4, 700)];
    const next = [standing('high', 2, 720), standing('low', 6, 420)];
    expect(overtakes(diffStandings(previous, next)).map((s) => s.key)).toEqual(['high', 'low']);
  });

  it('finds no moment on a first load or a quiet tick, so nothing is announced from nothing', () => {
    const board = [standing('a', 1, 900), standing('b', 2, 800)];
    expect(overtakes(diffStandings(null, board))).toEqual([]);
    expect(overtakes(diffStandings(board, board))).toEqual([]);
  });
});
