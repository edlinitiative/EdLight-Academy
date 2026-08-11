/**
 * XP economy rules. triviaService reaches firebase (directly and via
 * leaderboardService / weeklyGame) at import time, so those surfaces are
 * stubbed — these tests exercise only the pure reward math.
 */
import { xpBreakdown, computeXpEarned, computeGameXp, XP_BASE_CORRECT_CAP } from '../triviaService';

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

describe('xpBreakdown', () => {
  it('pays 10 XP per correct answer', () => {
    expect(xpBreakdown({ score: 7, total: 10 })).toEqual({ base: 70, perfect: 0, dailyBonus: 0, total: 70 });
  });

  it('caps base XP at 20 correct — marathons cannot out-earn focused rounds', () => {
    expect(xpBreakdown({ score: 45, total: 50 }).base).toBe(XP_BASE_CORRECT_CAP * 10);
    expect(xpBreakdown({ score: 45, total: 50 }).total).toBe(200);
  });

  it('adds the perfect bonus on a flawless round (cap still applies)', () => {
    expect(xpBreakdown({ score: 10, total: 10 })).toEqual({ base: 100, perfect: 25, dailyBonus: 0, total: 125 });
    expect(xpBreakdown({ score: 50, total: 50 })).toEqual({ base: 200, perfect: 25, dailyBonus: 0, total: 225 });
  });

  it('adds the daily bonus on the first completion of the day', () => {
    expect(xpBreakdown({ score: 8, total: 10, isDaily: true })).toEqual({ base: 80, perfect: 0, dailyBonus: 50, total: 130 });
  });

  it('pays nothing for a daily replay — the fixed set is not farmable', () => {
    expect(xpBreakdown({ score: 10, total: 10, isDaily: true, dailyAlreadyDone: true }))
      .toEqual({ base: 0, perfect: 0, dailyBonus: 0, total: 0 });
  });
});

describe('computeXpEarned', () => {
  it('matches the breakdown total', () => {
    expect(computeXpEarned({ score: 8, total: 10, isDaily: true })).toBe(130);
    expect(computeXpEarned({ score: 10, total: 10, isDaily: true, dailyAlreadyDone: true })).toBe(0);
  });
});

describe('computeGameXp', () => {
  it('scales with accuracy up to 40, +10 for a perfect run', () => {
    expect(computeGameXp({ score: 5, maxScore: 10 })).toBe(20);
    expect(computeGameXp({ score: 10, maxScore: 10 })).toBe(50);
    expect(computeGameXp({ score: 0, maxScore: 10 })).toBe(0);
  });
});
