/**
 * The two pieces of real logic behind the profile page.
 *
 * Both were written because the page had the same class of defect twice: a
 * number shown more than once from more than one source, and a number shown
 * without the context that makes it mean anything. The tests pin the parts
 * that are easy to regress by editing the badge list or the board query.
 */

import { buildAchievements, rankWindow } from '../Profile';

const noStreak = { currentStreak: 0, longestStreak: 0 };

const build = (over: any = {}) => buildAchievements({
  isCreole: false,
  streak: noStreak,
  unlockedMilestones: new Set<string>(),
  courseBadges: new Set<string>(),
  bestCoursePoints: 0,
  ...over,
});

describe('buildAchievements', () => {
  it('lists each streak threshold once, not twice under two names', () => {
    // progressTracking awards `week_streak`/`month_streak`/`legend_streak` for
    // 7/30/100 days; streakService awards `streak_7`/`streak_30`/`streak_100`
    // for the same behaviour. The shelf must not show both.
    const labels = build().map((a) => a.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.filter((l) => l === '1 semaine')).toHaveLength(1);
    expect(build().some((a) => a.id === 'week_streak')).toBe(false);
  });

  it('gives every tile a criterion, earned or not', () => {
    for (const a of build()) {
      expect(a.how.length).toBeGreaterThan(0);
    }
  });

  it('measures a locked streak badge against the current run, not the best one', () => {
    const a = build({ streak: { currentStreak: 3, longestStreak: 99 } })
      .find((x) => x.id === 'streak_30');
    // longestStreak 99 already cleared 30, so it counts as earned...
    expect(a.unlocked).toBe(true);

    const b = build({ streak: { currentStreak: 3, longestStreak: 3 } })
      .find((x) => x.id === 'streak_30');
    expect(b.unlocked).toBe(false);
    expect(b.progress).toBeCloseTo(3 / 30);
    expect(b.progressLabel).toBe('3 / 30');
  });

  it('shows progress only where a real number backs it', () => {
    const tiles = build({ bestCoursePoints: 400 });
    // Points have a threshold we can measure against.
    expect(tiles.find((a) => a.id === 'point_collector').progress).toBeCloseTo(0.4);
    // Quiz counts are not in the progress summary, so no invented bar.
    expect(tiles.find((a) => a.id === 'quiz_enthusiast').progress).toBeUndefined();
  });

  it('never reports more than complete progress', () => {
    const tiles = build({ bestCoursePoints: 9999, streak: { currentStreak: 500, longestStreak: 500 } });
    for (const a of tiles) {
      if (a.progress != null) expect(a.progress).toBeLessThanOrEqual(1);
    }
  });

  it('puts earned tiles first, then the closest to being earned', () => {
    const tiles = build({
      courseBadges: new Set(['first_lesson']),
      bestCoursePoints: 900,          // point_collector is 90% of the way
      streak: { currentStreak: 1, longestStreak: 1 },
    });
    expect(tiles[0].id).toBe('first_lesson');
    const locked = tiles.filter((a) => !a.unlocked);
    expect(locked[0].id).toBe('point_collector');
  });

  it('translates', () => {
    const ht = buildAchievements({
      isCreole: true,
      streak: noStreak,
      unlockedMilestones: new Set<string>(),
      courseBadges: new Set<string>(),
      bestCoursePoints: 0,
    });
    expect(ht.find((a) => a.id === 'first_lesson').label).toBe('Premye leson');
  });
});

describe('rankWindow', () => {
  const board = [
    { id: 'a', rank: 1, xp: 500, displayName: 'A' },
    { id: 'b', rank: 2, xp: 400, displayName: 'B' },
    { id: 'c', rank: 3, xp: 380, displayName: 'C' },
    { id: 'd', rank: 4, xp: 100, displayName: 'D' },
  ];

  it('returns the learner with one entry either side', () => {
    const { slice, gap } = rankWindow(board, 'c');
    expect(slice.map((e) => e.id)).toEqual(['b', 'c', 'd']);
    expect(gap).toBe(20);
  });

  it('has nothing above the top of the board', () => {
    const { slice, gap } = rankWindow(board, 'a');
    expect(slice.map((e) => e.id)).toEqual(['a', 'b']);
    expect(gap).toBe(0);
  });

  it('has nothing below the bottom of the page', () => {
    expect(rankWindow(board, 'd').slice.map((e) => e.id)).toEqual(['c', 'd']);
  });

  it('is empty when the learner is not on the board', () => {
    // The normal state for anyone without a pseudonym: their entry exists in
    // Firestore but is filtered out before it ever reaches this list.
    expect(rankWindow(board, 'zz')).toEqual({ slice: [], gap: 0 });
    expect(rankWindow(board, null)).toEqual({ slice: [], gap: 0 });
    expect(rankWindow([], 'a')).toEqual({ slice: [], gap: 0 });
    expect(rankWindow(undefined as any, 'a')).toEqual({ slice: [], gap: 0 });
  });

  it('never reports a negative gap', () => {
    const odd = [{ id: 'x', rank: 1, xp: 10 }, { id: 'y', rank: 2, xp: 50 }];
    expect(rankWindow(odd, 'y').gap).toBe(0);
  });
});
