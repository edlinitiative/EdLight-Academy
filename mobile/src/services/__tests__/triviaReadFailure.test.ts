/**
 * P0 code validation (2026-10-19). When the profile READ failed (offline —
 * this app's Firestore cache is memory-only — or a token/permission error),
 * loadTriviaProfile returned defaults and the record functions wrote
 * `xp: 0 + earned, totalGames: 1, leaderboard: {displayName:'' …}` over the
 * student's real profile. A failed read must skip the write instead.
 */
jest.mock('../firebase', () => ({ auth: { currentUser: null }, db: {} }));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn((_db: any, ...parts: string[]) => ({ path: parts.join('/') })),
  collection: jest.fn(),
  getDoc: jest.fn(async () => { throw new Error('Failed to get document because the client is offline.'); }),
  getDocs: jest.fn(),
  setDoc: jest.fn(async () => {}),
  serverTimestamp: jest.fn(() => 'ts'),
  increment: jest.fn((n: number) => ({ __increment: n })),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
}));

import { setDoc } from 'firebase/firestore';
import { recordTriviaResult, recordGameResult, loadTriviaProfile } from '../triviaService';

beforeEach(() => jest.clearAllMocks());

describe('gamification profile read failure', () => {
  it('recordTriviaResult does not overwrite the profile with defaults', async () => {
    const res = await recordTriviaResult('u1', { category: 'mixed', score: 5, total: 10, isDaily: true });
    expect(setDoc).not.toHaveBeenCalled();
    expect(res.xpEarned).toBeGreaterThan(0); // the round is still shown to the student
  });

  it('recordGameResult does not overwrite xp/games with defaults', async () => {
    await recordGameResult('u1', { gameId: 'mokache', score: 5, maxScore: 10 });
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('display reads still fall back to defaults', async () => {
    const p = await loadTriviaProfile('u1');
    expect(p.xp).toBe(0);
  });
});
