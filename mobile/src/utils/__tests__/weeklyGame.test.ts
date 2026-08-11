import { weeklyGameId, isWeeklyGame, WEEKLY_GAME_ROTATION } from '../weeklyGame';

jest.mock('../../services/firebase', () => ({ auth: {}, db: {} }));
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

describe('weeklyGameId', () => {
  it('is stable within a week and rotates on Monday', () => {
    // 2026-W33 runs Mon Aug 10 → Sun Aug 16.
    const monday = new Date(2026, 7, 10);
    const sunday = new Date(2026, 7, 16, 23, 59);
    const nextMonday = new Date(2026, 7, 17);
    expect(weeklyGameId(monday)).toBe(weeklyGameId(sunday));
    expect(weeklyGameId(nextMonday)).not.toBe(weeklyGameId(monday));
  });

  it('walks the rotation in order week over week', () => {
    const w33 = weeklyGameId(new Date(2026, 7, 10)); // week 33
    const idx = WEEKLY_GAME_ROTATION.indexOf(w33);
    const w34 = weeklyGameId(new Date(2026, 7, 17));
    expect(WEEKLY_GAME_ROTATION[(idx + 1) % WEEKLY_GAME_ROTATION.length]).toBe(w34);
  });

  it('isWeeklyGame matches only the featured game', () => {
    const d = new Date(2026, 7, 10);
    const featured = weeklyGameId(d);
    expect(isWeeklyGame(featured, d)).toBe(true);
    const other = WEEKLY_GAME_ROTATION.find((g) => g !== featured)!;
    expect(isWeeklyGame(other, d)).toBe(false);
  });
});
