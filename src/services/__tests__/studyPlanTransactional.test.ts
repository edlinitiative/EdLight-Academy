/**
 * P-4: plan task updates are a transaction over the stored task list (another
 * device's result survives); P-2: practice/lesson events advance their task;
 * a write that can't reach the server is queued, not lost.
 */
const mockStore = new Map<string, any>();
let mockFailTx = false;
const mockQueued: any[] = [];

jest.mock('../firebase', () => ({ db: {} }));
jest.mock('../streakService', () => ({ recordActivity: async () => undefined }));
jest.mock('../writeOutbox', () => ({
  queueForReplay: async (uid: string, kind: string, payload: unknown) => { mockQueued.push({ uid, kind, payload }); },
  registerOutboxHandler: () => undefined,
}));
jest.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...parts: string[]) => ({ path: parts.join('/') }),
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join('/'), id: parts[parts.length - 1] }),
  query: (c: any) => c,
  where: () => null,
  orderBy: () => null,
  limit: () => null,
  getDocs: async (c: { path: string }) => {
    const docs = [...mockStore.entries()]
      .filter(([p]) => p.startsWith(`${c.path}/`))
      .map(([p, d]) => ({ id: p.split('/').pop(), data: () => d }));
    return { empty: docs.length === 0, docs };
  },
  getDoc: async () => ({ exists: () => false }),
  setDoc: async () => undefined,
  updateDoc: async () => undefined,
  deleteDoc: async () => undefined,
  serverTimestamp: () => 'ts',
  runTransaction: async (_db: unknown, fn: (tx: any) => Promise<unknown>) => {
    if (mockFailTx) throw new Error('unavailable');
    const writes: Array<() => void> = [];
    const out = await fn({
      get: async (ref: { path: string }) => ({ exists: () => mockStore.has(ref.path), data: () => mockStore.get(ref.path) }),
      update: (ref: { path: string }, patch: any) => { writes.push(() => mockStore.set(ref.path, { ...mockStore.get(ref.path), ...patch })); },
    });
    writes.forEach((w) => w());
    return out;
  },
}));

import { recordPlanEvent, recordTaskResult } from '../studyPlanService';

const PLAN = 'users/u1/studyPlans/p1';
const plan = () => ({
  status: 'active',
  created_at_ms: 1,
  scheduleVersion: 99,
  tasks: [
    { type: 'exam', examId: 'bac-1', status: 'active', history: [{ scorePct: 70 }] },
    { type: 'practice', taskId: 'practice-CHEM-NS1-U2', subjectCode: 'CHEM-NS1', unitId: 'U2', status: 'active', history: [] },
    { type: 'video', taskId: 'video-L7', courseId: 'chem-ns1', lessonId: 'L7', status: 'active', history: [] },
  ],
});

beforeEach(() => { mockStore.clear(); mockQueued.length = 0; mockFailTx = false; jest.spyOn(console, 'warn').mockImplementation(() => undefined); });

it('reads the task list inside the transaction, so another device\'s result is kept', async () => {
  mockStore.set(PLAN, plan());
  await recordTaskResult('u1', 'p1', 'bac-1', { scorePct: 90 });
  const tasks = mockStore.get(PLAN).tasks;
  expect(tasks[0].history.map((h: any) => h.scorePct)).toEqual([70, 90]);
});

it('a finished chapter practice and a finished lesson advance their tasks', async () => {
  mockStore.set(PLAN, plan());
  expect(await recordPlanEvent('u1', { kind: 'practice', course: 'CHEM-NS1', unit: 'U2' }, 80)).toBe(1);
  expect(await recordPlanEvent('u1', { kind: 'lesson', courseId: 'chem-ns1', lessonId: 'L7' }, 100)).toBe(1);
  const tasks = mockStore.get(PLAN).tasks;
  expect(tasks[1].history).toHaveLength(1);
  expect(tasks[2].history).toHaveLength(1);
});

it('a plan update that cannot reach the server is queued for replay', async () => {
  mockStore.set(PLAN, plan());
  mockFailTx = true;
  expect(await recordPlanEvent('u1', { kind: 'exam', examId: 'bac-1' }, 50)).toBe(0);
  expect(mockQueued[0]).toMatchObject({ uid: 'u1', kind: 'plan-event', payload: { event: { kind: 'exam', examId: 'bac-1' }, scorePct: 50 } });
});
