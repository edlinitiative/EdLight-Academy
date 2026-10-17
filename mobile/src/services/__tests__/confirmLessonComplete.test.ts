jest.mock('../firebase', () => ({ db: {} }));
jest.mock('../notificationService', () => ({ notifyAchievement: jest.fn(), notifyStreak: jest.fn() }));
jest.mock('../streakService', () => ({ recordActivity: jest.fn(() => Promise.resolve()) }));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({ path: 'p' })),
  getDoc: jest.fn(),
  setDoc: jest.fn(() => Promise.resolve()),
  updateDoc: jest.fn(() => Promise.resolve()),
  collection: jest.fn(), addDoc: jest.fn(), getDocs: jest.fn(),
  arrayUnion: jest.fn((v) => ({ union: v })),
  increment: jest.fn((n) => ({ inc: n })),
  serverTimestamp: jest.fn(() => 0),
}));

import { getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { confirmLessonComplete } from '../progressTracking';

const snap = (data: any) => ({ exists: () => data != null, data: () => data });

describe('confirmLessonComplete', () => {
  beforeEach(() => jest.clearAllMocks());

  it("'already' when the doc lists the lesson — no write, no points", async () => {
    (getDoc as jest.Mock).mockResolvedValue(snap({ completedLessons: ['L1'] }));
    await expect(confirmLessonComplete('u', 'c', 'L1')).resolves.toBe('already');
    expect(setDoc).not.toHaveBeenCalled();
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it("'saved' after the write resolves; points once for a new lesson", async () => {
    (getDoc as jest.Mock).mockResolvedValue(snap({ completedLessons: [] }));
    await expect(confirmLessonComplete('u', 'c', 'L1')).resolves.toBe('saved');
    expect(setDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ completedLessons: { union: 'L1' } }), { merge: true });
    expect(updateDoc).toHaveBeenCalledTimes(1);
  });

  it('creates a missing progress doc instead of failing', async () => {
    (getDoc as jest.Mock).mockResolvedValue(snap(null));
    await expect(confirmLessonComplete('u', 'c', 'L1')).resolves.toBe('saved');
    expect(setDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ enrolledAt: expect.any(Date) }), { merge: true });
  });

  it('an unreadable pre-read still writes, but awards no points (no double award on retry)', async () => {
    (getDoc as jest.Mock).mockRejectedValue(new Error('offline'));
    await expect(confirmLessonComplete('u', 'c', 'L1')).resolves.toBe('saved');
    expect(setDoc).toHaveBeenCalled();
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('throws when nothing landed', async () => {
    (getDoc as jest.Mock).mockResolvedValue(snap({ completedLessons: [] }));
    (setDoc as jest.Mock).mockRejectedValueOnce(new Error('permission-denied'));
    await expect(confirmLessonComplete('u', 'c', 'L1')).rejects.toThrow('permission-denied');
    await expect(confirmLessonComplete('', 'c', 'L1')).rejects.toThrow('missing-context');
  });
});
