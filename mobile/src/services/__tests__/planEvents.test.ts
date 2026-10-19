/**
 * E-13 / P-2 / P-3 / P-4 on the phone: exams, practice and lessons finished in
 * the app advance the plan, in a transaction, queued when offline.
 */
const mockStore = new Map<string, any>();
let mockFailTx = false;
const mockAuth: { currentUser: any } = { currentUser: { uid: 'u1', getIdToken: async () => 't' } };

jest.mock('../firebase', () => ({ db: {}, get auth() { return mockAuth; } }));
jest.mock('../progressTracking', () => ({ confirmLessonComplete: jest.fn(async () => 'saved') }));
jest.mock('../../contexts/store', () => ({ __esModule: true, default: { getState: () => ({ user: { uid: 'u1' }, updateProgress: () => undefined }) } }));
jest.mock('../studyPlanService', () => ({
  computeSRS: (_t: any, q: number) => ({ repetitions: q >= 3 ? 1 : 0, interval: 1, ease: 2.5, nextReviewMs: 0 }),
  scoreToQuality: (pct: number) => (pct >= 90 ? 5 : pct >= 60 ? 3 : 1),
  loadActiveStudyPlan: async () => ({ id: 'p1' }),
}));
jest.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join('/') }),
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

import AsyncStorage from '@react-native-async-storage/async-storage';
import { recordPlanEvent } from '../planEvents';
import { completeLessonDurably, drainWriteOutbox, outbox } from '../writeOutbox';

const PLAN = 'users/u1/studyPlans/p1';
const tasks = () => [
  { type: 'exam', examId: 'bac-1', status: 'active', history: [] },
  { type: 'practice', taskId: 'practice-CHEM-NS1-U2', subjectCode: 'CHEM-NS1', unitId: 'U2', status: 'active', history: [] },
  { type: 'video', taskId: 'video-L7', courseId: 'chem-ns1', lessonId: 'L7', status: 'active', history: [] },
];
const flush = () => new Promise((r) => setImmediate(r));

beforeEach(async () => { mockStore.clear(); mockFailTx = false; await AsyncStorage.clear(); mockStore.set(PLAN, { tasks: tasks() }); });

it('an exam submitted in the app advances its plan task', async () => {
  expect(await recordPlanEvent('u1', { kind: 'exam', examId: 'bac-1' }, 95)).toBe(1);
  expect(mockStore.get(PLAN).tasks[0].history).toHaveLength(1);
});

it('a finished chapter practice advances its task', async () => {
  expect(await recordPlanEvent('u1', { kind: 'practice', course: 'CHEM-NS1', unit: 'U2' }, 70)).toBe(1);
});

it('a newly completed lesson completes its video task', async () => {
  await completeLessonDurably('u1', 'chem-ns1', 'L7');
  await flush(); await flush();
  expect(mockStore.get(PLAN).tasks[2].history).toHaveLength(1);
});

it('offline, the event is queued and replayed later', async () => {
  mockFailTx = true;
  expect(await recordPlanEvent('u1', { kind: 'exam', examId: 'bac-1' }, 95)).toBe(0);
  expect((await outbox.list('u1')).map((o) => o.kind)).toEqual(['plan-event']);
  mockFailTx = false;
  await drainWriteOutbox('u1');
  expect(await outbox.list('u1')).toEqual([]);
  expect(mockStore.get(PLAN).tasks[0].history).toHaveLength(1);
});
