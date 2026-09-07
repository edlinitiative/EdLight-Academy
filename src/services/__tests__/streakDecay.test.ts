import { decayStreak } from '../streakService';

/**
 * A streak that cannot be lost is not a streak. currentStreak is only ever
 * recomputed by recordActivity, so without expiry-on-read a stored value
 * survives indefinitely — a real account read `currentStreak: 3` forty days
 * after its last activity.
 */
const base = {
  currentStreak: 3,
  longestStreak: 7,
  lastActivityDate: '2026-09-04',
  activeDays: ['2026-09-02', '2026-09-03', '2026-09-04'],
  frozenDays: [],
  milestones: [],
  streakFreezes: 0,
  totalActiveDays: 3,
};

describe('decayStreak', () => {
  it('keeps a streak fed today', () => {
    expect(decayStreak(base, '2026-09-04').currentStreak).toBe(3);
  });

  it('keeps a streak fed yesterday — today can still extend it', () => {
    expect(decayStreak(base, '2026-09-05').currentStreak).toBe(3);
  });

  it('expires a streak after two clear days with no freeze', () => {
    expect(decayStreak(base, '2026-09-06').currentStreak).toBe(0);
  });

  it('bridges a two-day gap while a freeze is available', () => {
    // recordActivity spends a freeze for exactly this gap, so reporting the
    // streak as alive is what the student will actually get.
    const withFreeze = { ...base, streakFreezes: 1 };
    expect(decayStreak(withFreeze, '2026-09-06').currentStreak).toBe(3);
  });

  it('expires anyway once the gap outgrows what one freeze can bridge', () => {
    const withFreeze = { ...base, streakFreezes: 1 };
    expect(decayStreak(withFreeze, '2026-09-07').currentStreak).toBe(0);
  });

  it('reproduces the live stale case: 3 days, last activity 40 days ago', () => {
    const stale = { ...base, lastActivityDate: '2026-07-28' };
    expect(decayStreak(stale, '2026-09-06').currentStreak).toBe(0);
  });

  it('never touches longestStreak — that is history, not a live count', () => {
    expect(decayStreak(base, '2026-10-01').longestStreak).toBe(7);
  });

  it('leaves activeDays alone so the weekly view still shows real history', () => {
    expect(decayStreak(base, '2026-10-01').activeDays).toEqual(base.activeDays);
  });

  it('passes through an account that has never recorded anything', () => {
    const fresh = { ...base, currentStreak: 0, lastActivityDate: null };
    expect(decayStreak(fresh, '2026-09-06').currentStreak).toBe(0);
  });
});
