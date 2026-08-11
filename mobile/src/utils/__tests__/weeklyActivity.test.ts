import { countQuizzesThisWeek } from '../weeklyActivity';

describe('countQuizzesThisWeek', () => {
  // Monday 2026-08-10 opens the ISO week; "now" is Wednesday the 12th.
  const now = new Date(2026, 7, 12, 15, 0);
  const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime();

  it('counts only attempts since Monday 00:00 local', () => {
    const attempts = [
      { date: at(2026, 7, 10, 0) },  // Monday 00:00 — in
      { date: at(2026, 7, 12) },     // Wednesday — in
      { date: at(2026, 7, 9, 23) },  // Sunday night — out
      { date: at(2026, 7, 3) },      // last week — out
    ];
    expect(countQuizzesThisWeek(attempts, now)).toBe(2);
  });

  it('ignores attempts without a numeric date', () => {
    expect(countQuizzesThisWeek([{ date: 'oops' }, {}, null as any], now)).toBe(0);
  });
});
