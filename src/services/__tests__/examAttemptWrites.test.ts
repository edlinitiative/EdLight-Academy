/**
 * P0 code validation (2026-10-19) — exam draft/result writes.
 *
 * `{merge: true}` deep-merges the `answers` map: keys are added, never
 * removed. A cleared answer resurrected on resume, and a second attempt at an
 * exam inherited the first attempt's answers (then graded them). These tests
 * pin the write options so a map the client sends REPLACES the stored one.
 */
const mockSetDoc = jest.fn(() => Promise.resolve());
const mockBatchSet = jest.fn();
const mockBatchCommit = jest.fn(() => Promise.resolve());

jest.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  collection: jest.fn(),
  setDoc: (...args: unknown[]) => (mockSetDoc as any)(...args),
  serverTimestamp: () => '__ts__',
  writeBatch: () => ({ set: mockBatchSet, commit: mockBatchCommit }),
}));
jest.mock('../firebase', () => ({ db: {}, auth: { currentUser: { uid: 'u1' } } }));
jest.mock('../streakService', () => ({ recordActivity: jest.fn(() => Promise.resolve()) }));

import { saveExamAttemptDraft, commitExamSubmission } from '../examAttempts';
import { saveExamResult } from '../examResults';

beforeEach(() => {
  mockSetDoc.mockClear();
  mockBatchSet.mockClear();
  mockBatchCommit.mockClear();
});

describe('saveExamAttemptDraft', () => {
  it('replaces the answers map instead of deep-merging it', async () => {
    await saveExamAttemptDraft('u1', 'exam-1', { answers: { 0: 'a' }, currentQ: 2 });
    const [ref, payload, opts] = mockSetDoc.mock.calls[0] as any[];
    expect(ref.path).toBe('users/u1/examAttempts/exam-1');
    expect(payload.answers).toEqual({ 0: 'a' });
    expect(opts).not.toEqual({ merge: true });
    expect(opts.mergeFields).toEqual(expect.arrayContaining(['answers', 'currentQ', 'status', 'updated_at_ms']));
  });

  it('still fully overwrites on replace (restart)', async () => {
    await saveExamAttemptDraft('u1', 'exam-1', { answers: {} }, { replace: true });
    expect((mockSetDoc.mock.calls[0] as any[])[2]).toEqual({});
  });
});

describe('saveExamResult', () => {
  it('replaces the whole result document (no stale answers/preGradedResults from an older attempt)', async () => {
    await saveExamResult('u1', 'exam-1', { answers: { 1: 'b' }, summary: { percentage: 50 } });
    const call = mockSetDoc.mock.calls[0] as any[];
    expect(call[2]).toBeUndefined();
  });
});

describe('commitExamSubmission', () => {
  it('writes the result and the submitted attempt in ONE atomic batch', async () => {
    await commitExamSubmission('u1', 'exam-1', { answers: { 0: 'a' }, summary: {} }, { last_result_at_ms: 1 });
    expect(mockBatchSet).toHaveBeenCalledTimes(2);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    const [resultCall, attemptCall] = mockBatchSet.mock.calls as any[];
    expect(resultCall[0].path).toBe('users/u1/examResults/exam-1');
    expect(resultCall[2]).toBeUndefined();
    expect(attemptCall[0].path).toBe('users/u1/examAttempts/exam-1');
    expect(attemptCall[1].status).toBe('submitted');
    expect(attemptCall[2].mergeFields).toContain('status');
    expect(mockSetDoc).not.toHaveBeenCalled();
  });
});
