/**
 * "Corriger maintenant" on the web (services/essayRegrade.ts): the grader is
 * called with the shared body, the result is updated inside a transaction,
 * and a double tap grades once.
 */
const mockAuthedFetch = jest.fn();
jest.mock('../firebase', () => ({ db: {}, authedFetch: (...a: unknown[]) => mockAuthedFetch(...a) }));

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

import { gradeEssaysNow } from '../essayRegrade';

const ESSAY = 'mot '.repeat(150);
const questions = [
  { type: 'multiple_choice', question: 'Q1', options: { a: '1', b: '2' }, correct: 'a', points: 1 },
  { type: 'essay', question: 'Dissertez.', points: 10 },
];

beforeEach(() => {
  mockAuthedFetch.mockReset();
  mockUpdate.mockReset();
  mockStored = {
    answers: { 0: 'a', 1: ESSAY },
    created_at_ms: 42,
    preGradedResults: { 1: { status: 'ungraded', result: { awarded: 0, maxPoints: 10 } } },
    summary: { totalPoints: 1, earnedPoints: 1, percentage: 100, ungraded: 1, pendingPoints: 10 },
  };
});

it('grades with the shared body and updates the result once, in a transaction', async () => {
  mockAuthedFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ graded: true, isCorrect: false, score: '5/10' }) });
  const [a, b] = await Promise.all([
    gradeEssaysNow('u1', 'exam-1', questions, { subject: 'Français', level: 'Baccalauréat' }),
    gradeEssaysNow('u1', 'exam-1', questions, { subject: 'Français', level: 'Baccalauréat' }),
  ]);
  expect(a).toEqual({ status: 'graded', graded: 1, failed: 0, rateLimited: false });
  expect(b).toBe(a);
  expect(mockAuthedFetch).toHaveBeenCalledTimes(1);
  const [url, body, opts] = mockAuthedFetch.mock.calls[0];
  expect(url).toBe('/api/grade-essay');
  expect(body).toMatchObject({ question: 'Dissertez.', answer: ESSAY, type: 'essay', subject: 'Français', level: 'Baccalauréat' });
  expect(opts.timeoutMs).toBeGreaterThan(0);
  expect(mockUpdate).toHaveBeenCalledTimes(1);
  expect(mockUpdate.mock.calls[0][0]).toBe('users/u1/examResults/exam-1');
  // MCQ 1/1 + essay 5/10, now counted: 6/11.
  expect(mockStored.summary.percentage).toBe(55);
  expect(mockStored.summary).not.toHaveProperty('ungraded');
  expect(mockStored.preGradedResults[1].status).toBe('partial');
});

it('reports a 429 as a rate limit and writes nothing', async () => {
  mockAuthedFetch.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
  const out = await gradeEssaysNow('u1', 'exam-2', questions, {});
  expect(out).toMatchObject({ status: 'failed', rateLimited: true });
  expect(mockUpdate).not.toHaveBeenCalled();
});

it('reports a network failure as offline and writes nothing', async () => {
  mockAuthedFetch.mockRejectedValue(new TypeError('Failed to fetch'));
  const out = await gradeEssaysNow('u1', 'exam-3', questions, {});
  expect(out).toMatchObject({ status: 'failed', offline: true });
  expect(mockUpdate).not.toHaveBeenCalled();
});
