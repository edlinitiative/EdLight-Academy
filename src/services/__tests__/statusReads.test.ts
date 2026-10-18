/**
 * Status-returning reads: a failed Firestore read must come back as `error`
 * (so the surface shows failed + retry), never as an empty "nothing yet",
 * while the old plain readers keep returning their empty shapes.
 * Also the web flushReviewPush: resolve on ack, reject on signed-out /
 * unrecorded / write failure / timeout.
 */
const mockGetDoc = jest.fn();
const mockGetDocs = jest.fn();
const mockSetDoc = jest.fn();
const mockAuth: { currentUser: { uid: string } | null } = { currentUser: { uid: 'u1' } };

jest.mock('../firebase', () => ({ db: {}, get auth() { return mockAuth; } }));
jest.mock('firebase/firestore', () => ({
  doc: (...parts: any[]) => ({ path: parts.slice(1).join('/') }),
  collection: (...parts: any[]) => ({ path: parts.slice(1).join('/') }),
  getDoc: (...a: any[]) => mockGetDoc(...a),
  getDocs: (...a: any[]) => mockGetDocs(...a),
  setDoc: (...a: any[]) => mockSetDoc(...a),
  updateDoc: jest.fn(),
  addDoc: jest.fn(),
  arrayUnion: jest.fn(),
  increment: jest.fn(),
  serverTimestamp: () => 'TS',
}));
jest.mock('../notificationService', () => ({ notifyAchievement: jest.fn(), notifyStreak: jest.fn() }));
jest.mock('../streakService', () => ({ recordActivity: jest.fn() }));
jest.mock('../../utils/analytics', () => ({ track: jest.fn() }));

/* eslint-disable import/first */
import { readMastery, readMasteryResult, readCourseMastery, readCourseMasteryResult } from '../masteryService';
import { getAllUserProgress, getAllUserProgressResult, getCourseProgress, getCourseProgressResult } from '../progressTracking';
import {
  loadReviewMap, loadReviewMapResult, loadDueReviewIdsResult, recordReviewOutcome, flushReviewPush,
  ReviewFlushError, __resetReviewCacheForTests,
} from '../reviewService';
/* eslint-enable import/first */

const snap = (data: any) => ({ exists: () => data != null, data: () => data });
const offline = () => Object.assign(new Error('Failed to get document because the client is offline.'), { code: 'unavailable' });

beforeEach(() => {
  mockGetDoc.mockReset();
  mockGetDocs.mockReset();
  mockSetDoc.mockReset();
  mockAuth.currentUser = { uid: 'u1' };
  __resetReviewCacheForTests();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); });

describe('masteryService', () => {
  it('ok with data (a cached/offline-served read counts as ok)', async () => {
    mockGetDoc.mockResolvedValue(snap({ lessons: { L1: { bestPct: 80 } } }));
    await expect(readMasteryResult('u1')).resolves.toEqual({ status: 'ok', data: { L1: { bestPct: 80 } } });
  });

  it('a failed read is `error`, not an empty map; the plain reader still returns {}', async () => {
    mockGetDoc.mockRejectedValue(offline());
    const res = await readMasteryResult('u1');
    expect(res.status).toBe('error');
    expect(res.data).toEqual({});
    await expect(readMastery('u1')).resolves.toEqual({});
  });

  it('course read folds completedLessons; failure of either doc is `error`', async () => {
    mockGetDoc
      .mockResolvedValueOnce(snap({ lessons: { L1: { bestPct: 100 } } }))
      .mockResolvedValueOnce(snap({ completedLessons: ['L2'] }));
    await expect(readCourseMasteryResult('u1', 'chem-ns1')).resolves.toEqual({
      status: 'ok', data: { L1: { bestPct: 100 }, L2: { completed: true } },
    });
    mockGetDoc.mockResolvedValueOnce(snap({ lessons: {} })).mockRejectedValueOnce(offline());
    expect((await readCourseMasteryResult('u1', 'chem-ns1')).status).toBe('error');
    mockGetDoc.mockRejectedValue(offline());
    await expect(readCourseMastery('u1', 'chem-ns1')).resolves.toEqual({});
  });

  it('signed out is ok + empty (nobody to read for), not a failure', async () => {
    await expect(readMasteryResult(null)).resolves.toEqual({ status: 'ok', data: {} });
    expect(mockGetDoc).not.toHaveBeenCalled();
  });
});

describe('progressTracking', () => {
  it('all progress: ok lists docs; failure is `error` with []; plain reader returns []', async () => {
    mockGetDocs.mockResolvedValueOnce({ forEach: (fn: any) => [{ id: 'chem-ns1', data: () => ({ completedLessons: ['L1'] }) }].forEach(fn) });
    await expect(getAllUserProgressResult('u1')).resolves.toEqual({ status: 'ok', data: [{ courseId: 'chem-ns1', completedLessons: ['L1'] }] });
    mockGetDocs.mockRejectedValue(offline());
    const res = await getAllUserProgressResult('u1');
    expect(res).toMatchObject({ status: 'error', data: [] });
    await expect(getAllUserProgress('u1')).resolves.toEqual([]);
  });

  it('one course: missing doc is ok/null; failure is `error`', async () => {
    mockGetDoc.mockResolvedValueOnce(snap(null));
    await expect(getCourseProgressResult('u1', 'chem-ns1')).resolves.toEqual({ status: 'ok', data: null });
    mockGetDoc.mockRejectedValue(offline());
    expect((await getCourseProgressResult('u1', 'chem-ns1')).status).toBe('error');
    await expect(getCourseProgress('u1', 'chem-ns1')).resolves.toBeNull();
  });
});

describe('reviewService reads', () => {
  it('a failed read is `error` and is NOT cached as "nothing due": the next call reads again', async () => {
    mockGetDoc.mockRejectedValueOnce(offline());
    const first = await loadReviewMapResult('u1');
    expect(first.status).toBe('error');
    mockGetDoc.mockResolvedValueOnce(snap({ questions: { q7: { missedAt: 5 } } }));
    await expect(loadReviewMapResult('u1')).resolves.toEqual({ status: 'ok', data: { q7: { missedAt: 5 } } });
    expect(mockGetDoc).toHaveBeenCalledTimes(2);
    // Cached now: no third read.
    await expect(loadReviewMap('u1')).resolves.toEqual({ q7: { missedAt: 5 } });
    expect(mockGetDoc).toHaveBeenCalledTimes(2);
  });

  it('due ids carry the status too', async () => {
    mockGetDoc.mockRejectedValueOnce(offline());
    expect((await loadDueReviewIdsResult('u1')).status).toBe('error');
  });
});

describe('flushReviewPush (web)', () => {
  const recordMiss = async (id: string) => {
    mockGetDoc.mockResolvedValue(snap(null));
    recordReviewOutcome('u1', id, false, { subjectCode: 'CHEM-NSI', unitNo: 1 });
  };

  it('resolves on the server ack of a merge write of exactly the named entries', async () => {
    await recordMiss('bankA');
    await recordMiss('bankB');
    mockSetDoc.mockResolvedValue(undefined);
    await expect(flushReviewPush(['bankA'])).resolves.toBeUndefined();
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [ref, payload, opts] = mockSetDoc.mock.calls[0];
    expect(ref.path).toBe('users/u1/mastery/review');
    expect(Object.keys(payload.questions)).toEqual(['bankA']);
    expect(payload.questions.bankA.missedAt).toEqual(expect.any(Number));
    expect(opts).toEqual({ merge: true });
  });

  it('rejects when signed out', async () => {
    mockAuth.currentUser = null;
    await expect(flushReviewPush(['bankA'])).rejects.toMatchObject({ reason: 'signed-out' });
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('rejects when a named id was never recorded (nothing to claim)', async () => {
    await recordMiss('bankA');
    await expect(flushReviewPush(['bankA', 'q3'])).rejects.toMatchObject({ reason: 'not-recorded' });
  });

  it('rejects when the write fails', async () => {
    await recordMiss('bankA');
    mockSetDoc.mockRejectedValue(new Error('permission-denied'));
    const err = await flushReviewPush(['bankA']).catch((e) => e);
    expect(err).toBeInstanceOf(ReviewFlushError);
    expect(err.reason).toBe('write-failed');
  });

  it('rejects after the timeout when the ack never comes (offline: write stays queued)', async () => {
    await recordMiss('bankA');
    mockSetDoc.mockImplementation(() => new Promise(() => {}));
    jest.useFakeTimers();
    try {
      const p = flushReviewPush(['bankA'], { timeoutMs: 12000 });
      const caught = p.catch((e) => e);
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(12001);
      expect((await caught).reason).toBe('timeout');
    } finally {
      jest.useRealTimers();
    }
  });
});
