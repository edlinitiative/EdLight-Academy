import { liveStreakCount, localDayKey } from '../../../shared/streakLife';
import { aliveStreak } from '../../../api/_lib/emailPersonalization';

/**
 * Client and server must agree about whether a streak is alive.
 *
 * They didn't. The web app decayed on read using LOCAL dates and honoured
 * streak freezes; api/_lib/emailPersonalization had its own copy that used UTC
 * and ignored freezes. So a student could open the app to a running streak and
 * receive an e-mail treating it as over — or the reverse. Both now delegate to
 * shared/streakLife, and this test exists to keep them there.
 */
const at = (iso: string) => new Date(iso);

function serverSays(streak: any, now: Date) {
  return aliveStreak(streak.currentStreak, streak.lastActivityDate, now, streak.streakFreezes) ?? 0;
}

describe('streak liveness: client and server agree', () => {
  const cases: Array<{ name: string; streak: any; now: Date }> = [
    {
      name: 'fed today',
      streak: { currentStreak: 4, lastActivityDate: '2026-09-06', streakFreezes: 0 },
      now: at('2026-09-06T14:00:00'),
    },
    {
      name: 'fed yesterday',
      streak: { currentStreak: 4, lastActivityDate: '2026-09-05', streakFreezes: 0 },
      now: at('2026-09-06T14:00:00'),
    },
    {
      name: 'two clear days, no freeze',
      streak: { currentStreak: 4, lastActivityDate: '2026-09-04', streakFreezes: 0 },
      now: at('2026-09-06T14:00:00'),
    },
    {
      name: 'two clear days, one freeze available',
      streak: { currentStreak: 4, lastActivityDate: '2026-09-04', streakFreezes: 1 },
      now: at('2026-09-06T14:00:00'),
    },
    {
      name: 'the live stale case (40 days)',
      streak: { currentStreak: 3, lastActivityDate: '2026-07-28', streakFreezes: 0 },
      now: at('2026-09-06T14:00:00'),
    },
    {
      name: 'never recorded',
      streak: { currentStreak: 0, lastActivityDate: null, streakFreezes: 0 },
      now: at('2026-09-06T14:00:00'),
    },
    {
      name: 'malformed lastActivityDate',
      streak: { currentStreak: 5, lastActivityDate: 'not-a-date', streakFreezes: 0 },
      now: at('2026-09-06T14:00:00'),
    },
    {
      name: 'Haiti evening — UTC has already rolled to tomorrow',
      // 20:30 local on the 5th. A UTC-based rule sees "2026-09-06" as today and
      // "2026-09-05" as yesterday, so activity on the 4th reads as two days
      // stale and dies — while locally the 4th is still just yesterday.
      streak: { currentStreak: 6, lastActivityDate: '2026-09-04', streakFreezes: 0 },
      now: at('2026-09-05T20:30:00'),
    },
  ];

  for (const { name, streak, now } of cases) {
    it(name, () => {
      expect(serverSays(streak, now)).toBe(liveStreakCount(streak, now));
    });
  }

  it('uses local dates, not UTC', () => {
    // 20:30 local on 5 Sept is already 6 Sept in UTC west of Greenwich.
    const evening = at('2026-09-05T20:30:00');
    expect(localDayKey(evening)).toBe('2026-09-05');

    // Yesterday-local must stay alive through that window.
    const streak = { currentStreak: 6, lastActivityDate: '2026-09-04', streakFreezes: 0 };
    expect(liveStreakCount(streak, evening)).toBe(6);
  });

  it('returns null, not 0, for a dead streak so callers can omit it', () => {
    expect(aliveStreak(3, '2026-07-28', at('2026-09-06T14:00:00'), 0)).toBeNull();
  });
});
