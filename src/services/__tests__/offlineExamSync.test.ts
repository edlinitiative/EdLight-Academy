/**
 * Exams taken offline (larger product additions item 4): graded locally with
 * the shared grader, queued in the per-account outbox, replayed once into
 * the right account, never over a newer result, never lost on a "kill".
 */
import { createOutbox, memoryOutboxStorage } from '../../../shared/outbox';
import {
  decideExamReplay,
  EXAM_SUBMIT_KIND,
  examSubmitOpId,
  isQueuedExamSubmission,
  runExamReplay,
  type QueuedExamSubmission,
  type ReplayDecision,
} from '../../../shared/offlineExamSync';
import { gradeExamPendingEssays } from '../../../shared/essayRegrade';

const paper = (examId = 'ex_1', submittedAtMs = 1_000): QueuedExamSubmission => ({
  examId,
  submittedAtMs,
  result: { exam_id: examId, summary: { percentage: 50 }, answers: { 0: 'a' } },
  attempt: { answers: { 0: 'a' } },
  pendingEssays: 0,
  source: 'pack',
});

/** A fake account: results by uid + exam, and a transaction over it. */
function fakeAccount() {
  const results = new Map<string, Record<string, any>>();
  const attempts = new Map<string, Record<string, any>>();
  let writes = 0;
  const transactFor = (uid: string, examId: string) => async (decide: (e: Record<string, any> | null) => ReplayDecision) => {
    const decision = decide(results.get(`${uid}/${examId}`) ?? null);
    if (typeof decision !== 'string') {
      writes += 1;
      results.set(`${uid}/${examId}`, decision.result);
      attempts.set(`${uid}/${examId}`, { status: 'submitted', ...decision.attempt });
    }
    return decision;
  };
  return { results, attempts, transactFor, writes: () => writes };
}

describe('decideExamReplay', () => {
  const opId = examSubmitOpId('ex_1', 1_000);
  it('writes when the account has no result', () => {
    expect(decideExamReplay(null, paper(), opId)).toBe('write');
  });
  it('is done when this very operation was already written (lost response, direct write landed late)', () => {
    expect(decideExamReplay({ submission_op_id: opId, created_at_ms: 9_999 }, paper(), opId)).toBe('done');
  });
  it('drops rather than overwrite a newer result taken later', () => {
    expect(decideExamReplay({ submitted_at_ms: 5_000, submission_op_id: 'other' }, paper(), opId)).toBe('drop');
    expect(decideExamReplay({ created_at_ms: 5_000 }, paper(), opId)).toBe('drop');
  });
  it('overwrites an OLDER result (a retake done offline)', () => {
    expect(decideExamReplay({ submitted_at_ms: 500 }, paper(), opId)).toBe('write');
  });
  it('op ids are stable per attempt and outbox-safe', () => {
    expect(examSubmitOpId('ex_8a59a03c-48bf', 1234.7)).toBe('exam:ex_8a59a03c-48bf:1234');
    expect(examSubmitOpId('a/b c', 1)).toMatch(/^[A-Za-z0-9_:.-]+$/);
    expect(isQueuedExamSubmission(paper())).toBe(true);
    expect(isQueuedExamSubmission({ examId: '', submittedAtMs: 1, result: {}, attempt: {} })).toBe(false);
  });
});

describe('offline grading uses the shared grader', () => {
  it('objective items are graded on the device; essays are held as ungraded, never 0', () => {
    const questions = [
      { type: 'multiple_choice', question: '2+2 ?', options: ['3', '4'], correct: '4', points: 2 },
      { type: 'essay', question: 'Dissertez.', points: 10 },
    ];
    const graded = gradeExamPendingEssays(questions, { 0: '4', 1: 'Une longue réponse rédigée hors ligne.' }, { subject: 'Philosophie' });
    expect(graded.results[0].status).toBe('correct');
    expect(graded.results[1].status).toBe('ungraded');
    expect(graded.pending.length).toBe(1);
    expect(graded.summary.percentage).toBe(100); // the essay is left out of the score, not counted as 0
  });
});

describe('outbox sync of offline results', () => {
  const handlerFor = (account: ReturnType<typeof fakeAccount>, signedIn: { uid: string | null }) => async (op: any) => {
    if (signedIn.uid !== op.uid) return 'retry' as const; // never into another account
    const outcome = await runExamReplay(op.id, op.payload, account.transactFor(op.uid, op.payload.examId));
    return outcome === 'drop' ? ('drop' as const) : ('done' as const);
  };

  it('survives a kill: a new outbox over the same storage still holds the paper', async () => {
    const storage = memoryOutboxStorage();
    const a = createOutbox(storage, { prefix: 'edlight:outbox' });
    const p = paper();
    await a.enqueue('alice', { id: examSubmitOpId(p.examId, p.submittedAtMs), kind: EXAM_SUBMIT_KIND, payload: p });
    const relaunched = createOutbox(storage, { prefix: 'edlight:outbox' });
    expect((await relaunched.list('alice')).map((o) => o.kind)).toEqual([EXAM_SUBMIT_KIND]);
  });

  it('replays only into the account that took the paper, and only once', async () => {
    const storage = memoryOutboxStorage();
    const outbox = createOutbox(storage, { prefix: 'edlight:outbox' });
    const account = fakeAccount();
    const signedIn = { uid: 'bob' as string | null };
    const handlers = { [EXAM_SUBMIT_KIND]: handlerFor(account, signedIn) };
    const p = paper();
    const id = examSubmitOpId(p.examId, p.submittedAtMs);
    await outbox.enqueue('alice', { id, kind: EXAM_SUBMIT_KIND, payload: p });
    // Bob is signed in on the shared phone: his drain never sees Alice's paper.
    expect(await outbox.drain('bob', handlers)).toEqual({ done: 0, remaining: 0 });
    // Even a mis-wired drain for alice's list while bob holds the session retries.
    expect(await outbox.drain('alice', handlers)).toEqual({ done: 0, remaining: 1 });
    expect(account.results.size).toBe(0);

    signedIn.uid = 'alice';
    expect(await outbox.drain('alice', handlers)).toEqual({ done: 1, remaining: 0 });
    expect(account.results.get('alice/ex_1')).toMatchObject({ offline: true, submission_op_id: id, submitted_at_ms: 1_000 });
    expect(account.results.has('bob/ex_1')).toBe(false);
    expect(account.attempts.get('alice/ex_1')).toMatchObject({ status: 'submitted', submission_op_id: id });

    // A duplicate enqueue (double tap) or a second device drain changes nothing.
    await outbox.enqueue('alice', { id, kind: EXAM_SUBMIT_KIND, payload: p });
    expect(await outbox.drain('alice', handlers)).toEqual({ done: 1, remaining: 0 });
    expect(account.writes()).toBe(1);
  });

  it('a queued paper older than the account result is dropped, not written', async () => {
    const outbox = createOutbox(memoryOutboxStorage(), { prefix: 'edlight:outbox' });
    const account = fakeAccount();
    account.results.set('alice/ex_1', { submitted_at_ms: 9_000, summary: { percentage: 90 } });
    const handlers = { [EXAM_SUBMIT_KIND]: handlerFor(account, { uid: 'alice' }) };
    await outbox.enqueue('alice', { id: examSubmitOpId('ex_1', 1_000), kind: EXAM_SUBMIT_KIND, payload: paper() });
    expect(await outbox.drain('alice', handlers)).toEqual({ done: 0, remaining: 0 });
    expect(account.results.get('alice/ex_1')?.summary.percentage).toBe(90);
  });

  it('a transaction that cannot reach the server keeps the paper for the next drain', async () => {
    const outbox = createOutbox(memoryOutboxStorage(), { prefix: 'edlight:outbox' });
    const handlers = { [EXAM_SUBMIT_KIND]: async () => { throw new Error('unavailable'); } };
    await outbox.enqueue('alice', { id: examSubmitOpId('ex_1', 1_000), kind: EXAM_SUBMIT_KIND, payload: paper() });
    expect(await outbox.drain('alice', handlers)).toEqual({ done: 0, remaining: 1 });
    expect((await outbox.list('alice'))[0].attempts).toBe(1);
  });

  it('a malformed queued payload is dropped', async () => {
    const account = fakeAccount();
    expect(await runExamReplay('exam:x:1', { examId: 'x' }, account.transactFor('alice', 'x'))).toBe('drop');
  });
});
