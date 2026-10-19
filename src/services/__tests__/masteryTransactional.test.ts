/**
 * L-9 / L-10: web mastery writes run in one transaction (a concurrent phone
 * write is re-read, never joined stale), and a failed transaction queues the
 * score for replay instead of dropping it.
 */
const mockStore = new Map<string, any>();
let mockFailTx = false;
const mockQueued: any[] = [];

jest.mock('../firebase', () => ({ db: {} }));
jest.mock('../writeOutbox', () => ({
  queueForReplay: async (uid: string, kind: string, payload: unknown) => { mockQueued.push({ uid, kind, payload }); },
  registerOutboxHandler: (kind: string, fn: any) => { ((globalThis as any).mockOutboxHandlers ||= {})[kind] = fn; },
}));
jest.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join('/') }),
  runTransaction: async (_db: unknown, fn: (tx: any) => Promise<unknown>) => {
    if (mockFailTx) throw new Error('unavailable');
    const writes: Array<() => void> = [];
    const out = await fn({
      get: async (ref: { path: string }) => ({
        exists: () => mockStore.has(ref.path),
        data: () => mockStore.get(ref.path),
      }),
      set: (ref: { path: string }, data: any) => {
        writes.push(() => {
          const prev = mockStore.get(ref.path) || {};
          mockStore.set(ref.path, { ...prev, lessons: { ...(prev.lessons || {}), ...data.lessons } });
        });
      },
    });
    writes.forEach((w) => w());
    return out;
  },
}));

import { recordLessonExercise, recordChapterTest } from '../masteryService';

const MASTERY = 'users/u1/mastery/lessons';

beforeEach(() => {
  mockStore.clear();
  mockQueued.length = 0;
  mockFailTx = false;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

it('never lowers a score another device wrote', async () => {
  mockStore.set(MASTERY, { lessons: { L1: { bestPct: 100 } } });
  await recordLessonExercise('u1', 'chem', 'L1', 40);
  expect(mockStore.get(MASTERY).lessons.L1.bestPct).toBe(100);
});

it('records an improvement', async () => {
  mockStore.set(MASTERY, { lessons: { L1: { bestPct: 40 }, L2: { bestPct: 90 } } });
  await recordLessonExercise('u1', 'chem', 'L1', 80);
  expect(mockStore.get(MASTERY).lessons.L1.bestPct).toBe(80);
  expect(mockStore.get(MASTERY).lessons.L2.bestPct).toBe(90);
});

it('a failed transaction queues the score instead of dropping it, and the replay lands it', async () => {
  mockFailTx = true;
  await expect(recordLessonExercise('u1', 'chem', 'L1', 100)).resolves.toBeNull();
  expect(mockQueued).toEqual([{ uid: 'u1', kind: 'mastery-exercise', payload: expect.objectContaining({ courseId: 'chem', lessonId: 'L1', pct: 100 }) }]);
  mockFailTx = false;
  const res = await (globalThis as any).mockOutboxHandlers['mastery-exercise']({ uid: 'u1', payload: mockQueued[0].payload, createdAt: 1 });
  expect(res).toBe('done');
  expect(mockStore.get(MASTERY).lessons.L1.bestPct).toBe(100);
});

it('a failed chapter test is queued too', async () => {
  mockFailTx = true;
  await recordChapterTest('u1', 'chem', { L1: true });
  expect(mockQueued[0].kind).toBe('mastery-chapter');
});
