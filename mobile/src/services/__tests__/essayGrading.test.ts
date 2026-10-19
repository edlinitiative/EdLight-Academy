/**
 * Mobile essay grading (services/essayGrading.ts): the app now calls the same
 * /api/grade-essay as the web after submit, with a Firebase ID token, a
 * timeout and the shared body, and updates the stored result in one
 * transaction. A failure leaves the essay `ungraded` (never 0).
 */
jest.mock('../firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'u-1', getIdToken: jest.fn(() => Promise.resolve('tok')) } },
}));

let mockStored: any = null;
const mockUpdate = jest.fn();
jest.mock('firebase/firestore', () => ({
  doc: jest.fn((_db: unknown, ...path: string[]) => ({ path: path.join('/') })),
  getDoc: jest.fn(async () => ({ exists: () => !!mockStored, data: () => mockStored })),
  runTransaction: jest.fn(async (_db: unknown, fn: (tx: any) => Promise<unknown>) => fn({
    get: async () => ({ exists: () => !!mockStored, data: () => mockStored }),
    update: (ref: any, patch: any) => { mockUpdate(ref.path, patch); mockStored = { ...mockStored, ...patch }; },
  })),
}));

import { postEssayForGrading, startEssayGrading } from '../essayGrading';
import { EssayGradeError, gradeExamPendingEssays } from '../../../../shared/essayRegrade';

const ESSAY = 'mot '.repeat(150);
const questions = [
  { type: 'true_false', question: 'Vrai ?', correct: 'Vrai', points: 1 },
  { type: 'essay', question: 'Dissertez sur la liberté.', points: 10, final_answer: 'La liberté a des limites.' },
];
const answers = { 0: 'Vrai', 1: ESSAY };

function submittedDoc() {
  // Exactly what ExamTakeScreen.doSubmit now stores.
  const graded = gradeExamPendingEssays(questions, answers, { subject: 'Philosophie' });
  return {
    exam_id: 'e1', subject: 'Philosophie', answers, created_at_ms: 7,
    summary: graded.summary,
    results: graded.results.map((r: any) => ({ status: r.status, awarded: r.result.awarded, maxPoints: r.result.maxPoints })),
  };
}

let fetchMock: jest.Mock;
beforeEach(() => {
  mockUpdate.mockReset();
  mockStored = submittedDoc();
  fetchMock = jest.fn();
  (global as any).fetch = fetchMock;
});

describe('submit stores the essay as pending, not as a 0', () => {
  it('ungraded, left out of the score', () => {
    expect(mockStored.results[1].status).toBe('ungraded');
    expect(mockStored.summary).toMatchObject({ totalPoints: 1, earnedPoints: 1, percentage: 100, ungraded: 1, pendingPoints: 10 });
  });
});

describe('postEssayForGrading', () => {
  it('posts the body to the same endpoint as the web, with the ID token', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ graded: true, score: '6/10' }) });
    const out = await postEssayForGrading({ question: 'Q', answer: 'A', type: 'essay' });
    expect(out).toEqual({ graded: true, score: '6/10' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://academy.edlight.org/api/grade-essay');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ question: 'Q', answer: 'A', type: 'essay' });
    expect(init.signal).toBeDefined();
  });

  it('maps 429, other HTTP errors and network failures to typed errors', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429 });
    await expect(postEssayForGrading({ question: 'Q', answer: 'A', type: 'essay' })).rejects.toMatchObject({ kind: 'rate_limit' });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 502 });
    await expect(postEssayForGrading({ question: 'Q', answer: 'A', type: 'essay' })).rejects.toMatchObject({ kind: 'http' });
    fetchMock.mockRejectedValueOnce(new Error('Network request failed'));
    await expect(postEssayForGrading({ question: 'Q', answer: 'A', type: 'essay' })).rejects.toBeInstanceOf(EssayGradeError);
  });

  it('gives up after its timeout instead of hanging the results screen', async () => {
    fetchMock.mockImplementation((_url: string, init: any) => new Promise((_res, rej) => {
      init.signal.addEventListener('abort', () => rej(new Error('aborted')));
    }));
    await expect(postEssayForGrading({ question: 'Q', answer: 'A', type: 'essay' }, 30)).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('startEssayGrading', () => {
  it('grades the pending essay and updates the result once', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ graded: true, isCorrect: true, score: '8/10', feedback: 'Bien.' }) });
    const [a, b] = await Promise.all([
      startEssayGrading('u-1', 'e1', questions, { subject: 'Philosophie', level: 'Baccalauréat' }),
      startEssayGrading('u-1', 'e1', questions, { subject: 'Philosophie', level: 'Baccalauréat' }),
    ]);
    expect(a).toEqual({ status: 'graded', graded: 1, failed: 0, rateLimited: false });
    expect(b).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ subject: 'Philosophie', level: 'Baccalauréat', type: 'essay' });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0]).toBe('users/u-1/examResults/e1');
    expect(mockStored.results[1]).toMatchObject({ status: 'correct', awarded: 8, maxPoints: 10 });
    expect(mockStored.results[1].essayFeedback.feedback).toBe('Bien.');
    expect(mockStored.summary.percentage).toBe(82); // 9 / 11
    // Only the result document changed: no XP / mastery / review writes.
    expect(Object.keys(mockUpdate.mock.calls[0][1]).sort()).toEqual(['essay_graded_at_ms', 'results', 'summary']);
  });

  it('offline: nothing written, still ungraded, and a retry grades it', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network request failed'));
    const first = await startEssayGrading('u-1', 'e2', questions, {});
    expect(first).toMatchObject({ status: 'failed', offline: true });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockStored.results[1].status).toBe('ungraded');

    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ graded: true, score: '5/10' }) });
    const retry = await startEssayGrading('u-1', 'e2', questions, {});
    expect(retry).toMatchObject({ status: 'graded', graded: 1 });
    expect(mockStored.results[1].status).toBe('partial');
  });
});
