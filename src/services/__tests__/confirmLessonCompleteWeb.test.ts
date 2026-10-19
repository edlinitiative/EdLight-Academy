/**
 * P0 code validation (2026-10-19). Web lesson completion threw
 * `no-progress-document` for any course without a progress doc — and since
 * nothing calls enrollInCourse any more, nothing creates that doc on the web
 * before the first completion. "Réessayer" could never succeed. Mobile already
 * creates it with a merge; the web now does the same.
 */
const mockSetDoc = jest.fn(() => Promise.resolve());
const mockGetDoc = jest.fn();
jest.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...p: string[]) => ({ path: p.join('/') }),
  getDoc: (...a: unknown[]) => (mockGetDoc as any)(...a),
  setDoc: (...a: unknown[]) => (mockSetDoc as any)(...a),
  updateDoc: jest.fn(() => Promise.resolve()),
  collection: jest.fn(), addDoc: jest.fn(), getDocs: jest.fn(),
  arrayUnion: (...v: unknown[]) => ({ __union: v }),
  increment: (n: number) => ({ __inc: n }),
  serverTimestamp: () => 'ts',
}));
jest.mock('../firebase', () => ({ db: {} }));
jest.mock('../notificationService', () => ({ notifyAchievement: jest.fn(), notifyStreak: jest.fn() }));
jest.mock('../streakService', () => ({ recordActivity: jest.fn(() => Promise.resolve()) }));
jest.mock('../../utils/analytics', () => ({ track: jest.fn() }));

import { confirmLessonComplete } from '../progressTracking';

beforeEach(() => { mockSetDoc.mockClear(); mockGetDoc.mockReset(); });

describe('confirmLessonComplete (web)', () => {
  it('creates the progress doc on the first completion instead of throwing', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false, data: () => ({}) });
    await expect(confirmLessonComplete('u1', 'c1', 'L1')).resolves.toBe('saved');
    const progressWrite = (mockSetDoc.mock.calls as any[]).find(([ref]) => ref.path === 'users/u1/progress/c1');
    expect(progressWrite[1].completedLessons).toEqual({ __union: ['L1'] });
    expect(progressWrite[2]).toEqual({ merge: true });
  });

  it('says already when the lesson is listed', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ completedLessons: ['L1'] }) });
    await expect(confirmLessonComplete('u1', 'c1', 'L1')).resolves.toBe('already');
  });
});
