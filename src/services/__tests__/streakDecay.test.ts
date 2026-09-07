import { decayStreak } from '../streakService';

/**
 * decayStreak is the thin wrapper loadStreak applies on read. The liveness rule
 * itself is shared with the server and covered by streakLifeParity; what
 * matters here is that the wrapper only ever rewrites currentStreak and leaves
 * the rest of the document alone.
 */
const base = {
  currentStreak: 3,
  longestStreak: 7,
  lastActivityDate: '2026-09-04',
  activeDays: ['2026-09-02', '2026-09-03', '2026-09-04'],
  frozenDays: [],
  milestones: ['streak_3'],
  streakFreezes: 0,
  totalActiveDays: 3,
};

const at = (iso: string) => new Date(iso);

describe('decayStreak', () => {
  it('leaves a live streak untouched, same object identity', () => {
    const live = decayStreak(base, at('2026-09-05T10:00:00'));
    expect(live).toBe(base);
  });

  it('zeroes a dead streak', () => {
    expect(decayStreak(base, at('2026-09-06T10:00:00')).currentStreak).toBe(0);
  });

  it('reproduces the live stale case: 3 days, last activity 40 days earlier', () => {
    const stale = { ...base, lastActivityDate: '2026-07-28' };
    expect(decayStreak(stale, at('2026-09-06T10:00:00')).currentStreak).toBe(0);
  });

  it('preserves every other field when it expires the count', () => {
    const dead = decayStreak(base, at('2026-10-01T10:00:00'));
    // longestStreak is history; activeDays and frozenDays still feed the weekly
    // view and the heatmap, which must keep showing what really happened.
    expect(dead.longestStreak).toBe(7);
    expect(dead.activeDays).toEqual(base.activeDays);
    expect(dead.frozenDays).toEqual(base.frozenDays);
    expect(dead.milestones).toEqual(base.milestones);
    expect(dead.totalActiveDays).toBe(3);
    expect(dead.lastActivityDate).toBe('2026-09-04');
  });

  it('does not mutate the document it was given', () => {
    const copy = { ...base };
    decayStreak(copy, at('2026-10-01T10:00:00'));
    expect(copy.currentStreak).toBe(3);
  });

  it('passes a nullish document straight through', () => {
    expect(decayStreak(null)).toBeNull();
    expect(decayStreak(undefined)).toBeUndefined();
  });

  it('passes through an account that has never recorded anything', () => {
    const fresh = { ...base, currentStreak: 0, lastActivityDate: null };
    expect(decayStreak(fresh, at('2026-09-06T10:00:00')).currentStreak).toBe(0);
  });
});
