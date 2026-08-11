/**
 * Week-id math for the weekly leaderboard reset. The service module reaches
 * firebase at import time, so both firebase surfaces are stubbed out — these
 * tests exercise only the pure date logic (weekId / prevWeekId).
 */
import { weekId, prevWeekId, weekNumber, timeToWeekEnd } from '../leaderboardService';

jest.mock('../firebase', () => ({ auth: {}, db: {} }));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  collection: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  setDoc: jest.fn(),
  serverTimestamp: jest.fn(),
  increment: jest.fn(),
  query: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
}));

describe('weekId', () => {
  it('maps a mid-year Monday to its ISO week', () => {
    // Monday 2026-08-10 opens ISO week 33.
    expect(weekId(new Date(2026, 7, 10))).toBe('2026-W33');
  });

  it('maps the Sunday before to the previous ISO week', () => {
    expect(weekId(new Date(2026, 7, 9))).toBe('2026-W32');
  });

  it('assigns early January to week 1 of the new ISO year', () => {
    // Thursday 2026-01-01 sits in 2026-W01 (which starts Mon 2025-12-29).
    expect(weekId(new Date(2026, 0, 1))).toBe('2026-W01');
    expect(weekId(new Date(2025, 11, 29))).toBe('2026-W01');
  });
});

describe('prevWeekId', () => {
  it('returns the week before, any day of the current week', () => {
    expect(prevWeekId(new Date(2026, 7, 10))).toBe('2026-W32'); // Monday
    expect(prevWeekId(new Date(2026, 7, 16))).toBe('2026-W32'); // Sunday
  });

  it('crosses the ISO year boundary correctly', () => {
    // 2026-W01 starts Mon 2025-12-29; the week before is 2025-W52.
    expect(prevWeekId(new Date(2026, 0, 1))).toBe('2025-W52');
    expect(prevWeekId(new Date(2025, 11, 29))).toBe('2025-W52');
  });
});

describe('weekNumber', () => {
  it('extracts the human week number from a week id', () => {
    expect(weekNumber('2026-W33')).toBe(33);
    expect(weekNumber('2026-W01')).toBe(1);
  });
});

describe('timeToWeekEnd', () => {
  it('counts down to next Monday 00:00 local', () => {
    // Monday 2026-08-10 at 10:00 → resets Monday 2026-08-17 00:00 = 6d 14h.
    expect(timeToWeekEnd(new Date(2026, 7, 10, 10, 0))).toEqual({ days: 6, hours: 14 });
    // Sunday 2026-08-16 at 22:00 → 2 hours left.
    expect(timeToWeekEnd(new Date(2026, 7, 16, 22, 0))).toEqual({ days: 0, hours: 2 });
  });
});
