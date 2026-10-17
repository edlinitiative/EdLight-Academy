// reviewService reaches firebase (untranspiled ESM under Jest) — sever it.
jest.mock('../firebase', () => ({ db: {}, auth: { currentUser: null } }));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(), getDoc: jest.fn(), setDoc: jest.fn(), getDocs: jest.fn(), collection: jest.fn(), serverTimestamp: jest.fn(),
}));
jest.mock('../studyPlanService', () => ({ computeSRS: jest.fn(), scoreToQuality: jest.fn() }));
jest.mock('../adaptiveEngine', () => ({ dueReviews: jest.fn(() => []) }));
jest.mock('../../contexts/store', () => ({ __esModule: true, default: { getState: () => ({}) } }));

import { flushReviewPush, ReviewFlushError, type ReviewFlushDeps } from '../reviewService';

const review = {
  a: { missedAt: 10, subjectCode: 'CHEM-NSI', unitNo: 1 },
  b: { missedAt: 20 },
  c: { missedAt: 5, correctAt: 9 },
};

function deps(over: Partial<ReviewFlushDeps> = {}, uid: string | null = 'u1') {
  const write = jest.fn(async () => {});
  return { write, deps: { getState: () => ({ uid, review }), write, ...over } as ReviewFlushDeps };
}

it('writes only the named entries and resolves on the server ack', async () => {
  const d = deps();
  await expect(flushReviewPush(['a', 'missing'], { deps: d.deps })).resolves.toBeUndefined();
  expect(d.write).toHaveBeenCalledWith('u1', { a: { missedAt: 10, subjectCode: 'CHEM-NSI', unitNo: 1 } });
});

it('writes the whole map when no ids are given', async () => {
  const d = deps();
  await flushReviewPush(undefined, { deps: d.deps });
  expect(Object.keys((d.write.mock.calls[0] as any)[1])).toEqual(['a', 'b', 'c']);
});

it('refuses when signed out — a guest has no account copy to confirm', async () => {
  const d = deps({}, null);
  await expect(flushReviewPush(['a'], { deps: d.deps })).rejects.toMatchObject({ reason: 'signed-out' });
  expect(d.write).not.toHaveBeenCalled();
});

it('rejects (never swallows) a failed write', async () => {
  const d = deps({ write: jest.fn(async () => { throw new Error('permission-denied'); }) });
  await expect(flushReviewPush(['a'], { deps: d.deps })).rejects.toBeInstanceOf(ReviewFlushError);
  await expect(flushReviewPush(['a'], { deps: d.deps })).rejects.toMatchObject({ reason: 'write-failed' });
});

it('times out when the server never answers (offline)', async () => {
  jest.useFakeTimers();
  const d = deps({ write: jest.fn(() => new Promise<void>(() => {})) });
  const p = flushReviewPush(['a'], { deps: d.deps, timeoutMs: 1000 });
  jest.advanceTimersByTime(1001);
  await expect(p).rejects.toMatchObject({ reason: 'timeout' });
  jest.useRealTimers();
});

it('has nothing to confirm when the ids are not in the map', async () => {
  const d = deps();
  await expect(flushReviewPush(['zzz'], { deps: d.deps })).resolves.toBeUndefined();
  expect(d.write).not.toHaveBeenCalled();
});
