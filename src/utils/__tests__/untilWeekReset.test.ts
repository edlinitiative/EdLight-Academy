import { untilWeekReset } from '../../pages/Classement';

describe('untilWeekReset', () => {
  it('counts down to the next Monday 00:00', () => {
    // Saturday 2026-10-17 10:00 local → Monday 00:00 is 1 day 14 hours away.
    expect(untilWeekReset(new Date(2026, 9, 17, 10, 0))).toEqual({ days: 1, hours: 14 });
    // Monday 08:00 → next Monday, 6 days 16 hours.
    expect(untilWeekReset(new Date(2026, 9, 19, 8, 0))).toEqual({ days: 6, hours: 16 });
    // Sunday 23:30 → 0 days 0 hours.
    expect(untilWeekReset(new Date(2026, 9, 18, 23, 30))).toEqual({ days: 0, hours: 0 });
  });
});
