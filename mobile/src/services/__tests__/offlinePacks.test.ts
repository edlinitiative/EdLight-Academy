/**
 * Offline revision packs on the phone (larger product additions item 4):
 * the storage probe and its AsyncStorage fallback, the file-system store,
 * exams opening from a pack without the network, practice falling back to
 * packs, and offline exam results going through the per-account outbox.
 */
const mockAuth: { currentUser: any } = { currentUser: null };
jest.mock('../firebase', () => ({ get auth() { return mockAuth; }, db: {} }));
jest.mock('../progressTracking', () => ({ confirmLessonComplete: jest.fn() }));
jest.mock('../../contexts/store', () => ({ __esModule: true, default: { getState: () => ({ user: null }) } }));
const mockReplay = jest.fn();
jest.mock('../examAttempts', () => ({ replayQueuedExamSubmission: (...a: unknown[]) => mockReplay(...a) }));
const mockTrack = jest.fn();
jest.mock('../telemetry', () => ({ trackEvent: (...a: unknown[]) => mockTrack(...a) }));
// In this test binary the file-system native module is absent: the legacy
// entry point then has no documentDirectory, exactly like a build without it.
jest.mock('expo-file-system/legacy', () => ({ documentDirectory: null }));
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { fetch: async () => ({ isConnected: false, isInternetReachable: false, type: 'none' }) } }));
jest.mock('../dataService', () => ({
  loadQuizBankRows: async () => [],
  practicePackLabel: (code: string) => ({ title: code, level: '', subject: code }),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildPracticePacks, fnv1a, utf8Bytes, type PackEntry } from '../../../../shared/offlinePacks';
import { examSubmitOpId, EXAM_SUBMIT_KIND, type QueuedExamSubmission } from '../../../../shared/offlineExamSync';
import {
  ASYNC_PACK_BUDGET_BYTES,
  fileSystemBlobStore,
  findPackedExam,
  hasPackedExam,
  PACK_BUDGET_BYTES,
  packLibrary,
  packStorageKind,
  practiceRowsFromPacks,
  probeFileSystem,
} from '../offlinePacks';
import {
  drainWriteOutbox,
  outbox,
  pendingExamSubmissionCount,
  queueExamSubmission,
  queuedExamSubmission,
  subscribeExamSynced,
} from '../writeOutbox';

// One SVT pack with two papers, in the shape scripts/build_offline_packs.mjs emits.
const examPack = (): { entry: PackEntry; text: string } => {
  const exams = [
    { exam_id: 'ex_a', level: 'baccalaureat', subject: 'SVT', year: '2024', sections: [{ questions: [{ type: 'multiple_choice', question: 'Q', options: ['a', 'b'], correct: 'a' }] }] },
    { exam_id: 'ex_b', level: 'baccalaureat', subject: 'SVT', year: '2023', sections: [{ questions: [{ type: 'true_false', question: 'V ?', correct: 'Vrai' }] }] },
  ];
  const text = JSON.stringify({ schema: 1, id: 'exam-bac-svt', kind: 'exam', level: 'baccalaureat', subject: 'SVT', exams });
  const hash = fnv1a(text);
  return {
    text,
    entry: {
      id: 'exam-bac-svt', kind: 'exam', level: 'baccalaureat', subject: 'SVT', title: 'SVT', years: [2023, 2024],
      items: 2, questionCount: 2, sizeBytes: utf8Bytes(text), hash, file: `exam-bac-svt.${hash}.json`, createdAt: 1,
    },
  };
};

const paper = (examId = 'ex_a', t = 1_000): QueuedExamSubmission => ({
  examId, submittedAtMs: t, result: { exam_id: examId, summary: { percentage: 100 } }, attempt: { answers: { 0: 'a' } }, pendingEssays: 0, source: 'pack',
});

beforeEach(async () => {
  await AsyncStorage.clear();
  await packLibrary.removeAll();
  mockReplay.mockReset();
  mockTrack.mockReset();
  mockAuth.currentUser = null;
});

describe('storage decision', () => {
  it('without the native file-system module, packs use chunked AsyncStorage with the small budget', () => {
    expect(probeFileSystem()).toBeNull();
    expect(packStorageKind).toBe('async-storage');
    expect(PACK_BUDGET_BYTES).toBe(ASYNC_PACK_BUDGET_BYTES);
    // The fallback budget still holds the largest real pack (about 1.2 MB) twice.
    expect(ASYNC_PACK_BUDGET_BYTES).toBeGreaterThanOrEqual(2 * 1_200_000);
  });

  it('the file-system store writes beside then moves, so a kill never leaves a half pack', async () => {
    const files = new Map<string, string>();
    const ops: string[] = [];
    const fakeFs: any = {
      documentDirectory: 'file:///doc/',
      makeDirectoryAsync: async () => { ops.push('mkdir'); },
      getInfoAsync: async (u: string) => ({ exists: files.has(u) || u.endsWith('/') }),
      readAsStringAsync: async (u: string) => files.get(u),
      writeAsStringAsync: async (u: string, t: string) => { ops.push(`write ${u}`); files.set(u, t); },
      deleteAsync: async (u: string) => { files.delete(u); },
      moveAsync: async ({ from, to }: any) => { ops.push(`move ${from} -> ${to}`); files.set(to, files.get(from) as string); files.delete(from); },
      getFreeDiskStorageAsync: async () => 1e10,
    };
    const store = fileSystemBlobStore(fakeFs);
    await store.write('exam-bac-svt.0a1b2c3d', '{"x":1}');
    expect(ops).toEqual([
      'mkdir',
      'write file:///doc/offline-packs/exam-bac-svt.0a1b2c3d.json.part',
      'move file:///doc/offline-packs/exam-bac-svt.0a1b2c3d.json.part -> file:///doc/offline-packs/exam-bac-svt.0a1b2c3d.json',
    ]);
    expect(await store.read('exam-bac-svt.0a1b2c3d')).toBe('{"x":1}');
    await store.remove('exam-bac-svt.0a1b2c3d');
    expect(await store.read('exam-bac-svt.0a1b2c3d')).toBeNull();
  });
});

describe('exams and practice open from packs offline', () => {
  it('fetchSingleExam reads a downloaded pack first and spends no data', async () => {
    const pack = examPack();
    await packLibrary.install(pack.entry, pack.text);
    expect(await hasPackedExam('ex_b')).toBe(true);
    const fetchMock = jest.fn(async () => { throw new TypeError('Network request failed'); });
    (global as any).fetch = fetchMock;
    const { fetchSingleExam } = require('../../utils/examCatalog');
    const exam = await fetchSingleExam('ex_b');
    expect(exam?.exam_id).toBe('ex_b');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockTrack).toHaveBeenCalledWith('offline_pack_opened', expect.objectContaining({ kind: 'exam', pack: pack.entry.id, offline: true }));
    expect(await findPackedExam('ex_zzz')).toBeNull();
  });

  it('practice rows come back from a practice pack', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({ id: `q${i}`, question: `Q${i}`, options: '["a","b"]', correct_answer: 'A', subject_code: 'CHEM-NSI' }));
    const [pack] = buildPracticePacks(rows, (c) => ({ title: c, level: 'NSI', subject: 'Chimie' }));
    await packLibrary.install(pack.entry, pack.text);
    expect((await practiceRowsFromPacks()).map((r) => r.id)).toEqual(['q0', 'q1', 'q2']);
  });
});

describe('offline exam results through the outbox', () => {
  it('a queued paper is persisted per account and readable for the results screen', async () => {
    const p = paper();
    const id = examSubmitOpId(p.examId, p.submittedAtMs);
    expect(await queueExamSubmission('alice', id, p)).toBe(true);
    expect((await queuedExamSubmission('alice', 'ex_a'))?.payload.result.summary.percentage).toBe(100);
    expect(await queuedExamSubmission('bob', 'ex_a')).toBeNull();
    expect(await pendingExamSubmissionCount('alice')).toBe(1);
    expect(await pendingExamSubmissionCount('bob')).toBe(0);
    // Survives a relaunch: the list lives in AsyncStorage, not memory.
    const raw = await AsyncStorage.getItem('edlight:outbox:alice');
    expect(JSON.parse(raw as string)[0]).toMatchObject({ id, kind: EXAM_SUBMIT_KIND, uid: 'alice' });
  });

  it('replays only while the owner is signed in, then reports the sync', async () => {
    const p = paper();
    const id = examSubmitOpId(p.examId, p.submittedAtMs);
    await queueExamSubmission('alice', id, p);
    mockReplay.mockResolvedValue('written');

    mockAuth.currentUser = { uid: 'bob' };
    await drainWriteOutbox('alice'); // not the signed-in account: nothing runs
    expect(mockReplay).not.toHaveBeenCalled();

    mockAuth.currentUser = { uid: 'alice' };
    const synced: unknown[] = [];
    const off = subscribeExamSynced((e) => synced.push(e));
    await drainWriteOutbox('alice');
    off();
    expect(mockReplay).toHaveBeenCalledWith('alice', id, expect.objectContaining({ examId: 'ex_a' }));
    expect(synced).toEqual([{ uid: 'alice', examId: 'ex_a', outcome: 'written' }]);
    expect(await outbox.list('alice')).toEqual([]);
    expect(mockTrack).toHaveBeenCalledWith('offline_result_synced', expect.objectContaining({ kind: 'exam', outcome: 'written', source: 'pack' }));
  });

  it('a replay that cannot reach the server keeps the paper', async () => {
    const p = paper();
    await queueExamSubmission('alice', examSubmitOpId(p.examId, p.submittedAtMs), p);
    mockAuth.currentUser = { uid: 'alice' };
    mockReplay.mockRejectedValue(new Error('unavailable'));
    await drainWriteOutbox('alice');
    expect(await pendingExamSubmissionCount('alice')).toBe(1);
    mockReplay.mockResolvedValue('retry');
    await drainWriteOutbox('alice');
    expect(await pendingExamSubmissionCount('alice')).toBe(1);
  });
});
