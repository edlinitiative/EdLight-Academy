/**
 * api/_lib/essayCalibrationRuns.ts — server side of the essay-grader
 * calibration harness (shared/essayCalibration.ts has the pure parts).
 *
 *   essayCalibration/{runId}               name, createdBy/At, totals, lease
 *   essayCalibration/{runId}/items/{0000}  the uploaded row, its status and
 *                                          the AI grade
 *
 * Idempotent and resumable:
 *   • runId is a hash of the run name and the validated rows, so uploading the
 *     same file under the same name reopens the same run instead of grading
 *     everything twice (a new name measures the same set again);
 *   • a step grades a few PENDING items and writes each result in a
 *     transaction that re-reads the item: an item already graded by another
 *     step is never graded or counted again;
 *   • a short lease on the run doc keeps two tabs from stepping one run at
 *     the same time; an expired lease (closed tab) is simply taken over.
 * Transient grader failures leave the item pending (retried by a later step)
 * up to MAX_ATTEMPTS, then mark it failed.
 */
import { createHash, randomBytes } from 'crypto';
import { flattenQuestions, normalizeLevel, normalizeSubject } from '../../shared/examUtils';
import { buildEssayGradeBody } from '../../shared/essayRegrade';
import type { CalibrationInput, CalibrationItem } from '../../shared/essayCalibration';
import type { GradeEssayInput, GradeEssayResult } from './essayGrader';

export const RUNS = 'essayCalibration';
export const MAX_ATTEMPTS = 3;
export const LEASE_MS = 90_000;
export const STEP_MAX_ITEMS = 4;
const STEP_CONCURRENCY = 2;
const STEP_BUDGET_MS = 40_000;

type Snap = { exists: boolean; id: string; data(): Record<string, any> | undefined };
type Ref = { path?: string; get(): Promise<Snap>; set(d: Record<string, any>): Promise<unknown> };
type Q = {
  where(field: string, op: any, value: any): Q;
  orderBy(field: string, dir?: 'asc' | 'desc'): Q;
  limit(n: number): Q;
  get(): Promise<{ docs: Snap[] }>;
};
export interface RunsDb {
  doc(path: string): Ref;
  collection(path: string): Q;
  batch(): { set(ref: any, d: Record<string, any>): void; commit(): Promise<unknown> };
  runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;
}

/** Same rows under the same name → same run (idempotent upload); a new name starts a new run. */
export function runIdFor(rows: CalibrationInput[], name = ''): string {
  return `cal_${createHash('sha256').update(JSON.stringify({ name: name.trim(), rows })).digest('hex').slice(0, 20)}`;
}

const itemId = (index: number) => String(index).padStart(4, '0');

export async function createRun(
  db: RunsDb,
  args: { rows: CalibrationInput[]; name?: string; admin: { uid: string; name?: string }; now?: number },
): Promise<{ runId: string; existing: boolean }> {
  const runId = runIdFor(args.rows, args.name || '');
  const runRef = db.doc(`${RUNS}/${runId}`);
  if ((await runRef.get()).exists) return { runId, existing: true };
  const now = args.now ?? Date.now();
  const batch = db.batch();
  args.rows.forEach((input, index) => {
    const item: CalibrationItem = { index, input, status: 'pending', attempts: 0 };
    batch.set(db.doc(`${RUNS}/${runId}/items/${itemId(index)}`), item as unknown as Record<string, any>);
  });
  batch.set(runRef, {
    runId,
    name: (args.name || '').trim().slice(0, 120) || `Calibration du ${new Date(now).toISOString().slice(0, 10)}`,
    createdAt: now,
    createdBy: args.admin.uid,
    createdByName: args.admin.name ? args.admin.name.slice(0, 120) : null,
    total: args.rows.length,
    graded: 0,
    failed: 0,
    status: 'running',
    leaseId: null,
    leaseUntil: 0,
    updatedAt: now,
  });
  await batch.commit();
  return { runId, existing: false };
}

export type ItemGrade =
  | { kind: 'graded'; ai: NonNullable<CalibrationItem['ai']> }
  | { kind: 'retry'; error: string }
  | { kind: 'fatal'; error: string };

/**
 * Grade one calibration row with the production grader. An exam row is built
 * exactly as the clients build it (buildEssayGradeBody, the exam's own subject
 * and level); a prompt row sends the prompt as the question.
 */
export async function gradeCalibrationInput(
  input: CalibrationInput,
  deps: { fetchExam: (examId: string) => Promise<any | null>; grade: (body: GradeEssayInput) => Promise<GradeEssayResult> },
): Promise<ItemGrade> {
  let body: GradeEssayInput;
  if (input.examId != null && input.questionIndex != null) {
    let exam: any;
    try {
      exam = await deps.fetchExam(input.examId);
    } catch (error) {
      return { kind: 'retry', error: `exam_fetch: ${error instanceof Error ? error.message : 'error'}` };
    }
    const q = exam ? flattenQuestions(exam)[input.questionIndex] : null;
    if (!q) return { kind: 'fatal', error: 'question_not_found' };
    body = buildEssayGradeBody(q, input.studentText, {
      subject: input.subject || normalizeSubject(exam.subject),
      level: input.level || normalizeLevel(exam.level),
    });
  } else if (input.prompt) {
    body = { question: input.prompt, answer: input.studentText, type: input.type || 'essay', subject: input.subject, level: input.level };
  } else {
    return { kind: 'fatal', error: 'no_question' };
  }
  const result = await deps.grade(body);
  if (!result.ok) return { kind: 'fatal', error: result.error };
  const r = result.body;
  const tooShort = r.graded === false && (r.wordStatus === 'empty' || r.wordStatus === 'too_short');
  // A too-short text IS the grader's assessment (0), as for students
  // (shared/essayGradeCore 'too_short'); any other ungraded answer is a failure.
  if (r.graded !== true && !tooShort) return { kind: 'retry', error: 'grader_unavailable' };
  return {
    kind: 'graded',
    ai: {
      ratio: tooShort ? 0 : Number(r.ratio) || 0,
      graded: r.graded === true,
      wordStatus: typeof r.wordStatus === 'string' ? r.wordStatus : undefined,
      rubricProfile: typeof r.rubricProfile === 'string' ? r.rubricProfile : undefined,
      criteria: Array.isArray(r.criteria)
        ? r.criteria.slice(0, 12).map((c: any) => ({ label: String(c?.label ?? '').slice(0, 120), level: Number(c?.level) || 0 }))
        : [],
    },
  };
}

const strip = <T extends Record<string, any>>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/** Apply one grade, once: re-reads the item and the run, writes only if the item is still pending. */
export async function applyItemGrade(db: RunsDb, runId: string, index: number, outcome: ItemGrade, now: number): Promise<'applied' | 'skipped'> {
  const runRef = db.doc(`${RUNS}/${runId}`);
  const ref = db.doc(`${RUNS}/${runId}/items/${itemId(index)}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const run = await tx.get(runRef);
    if (!snap.exists || !run.exists) return 'skipped';
    const item = snap.data() as CalibrationItem;
    if (item.status !== 'pending') return 'skipped';
    const r = run.data() || {};
    const attempts = (Number(item.attempts) || 0) + 1;
    let patch: Record<string, any>;
    let graded = Number(r.graded) || 0;
    let failed = Number(r.failed) || 0;
    if (outcome.kind === 'graded') {
      patch = { status: 'graded', attempts, ai: strip(outcome.ai), gradedAt: now, error: null };
      graded += 1;
    } else if (outcome.kind === 'fatal' || attempts >= MAX_ATTEMPTS) {
      patch = { status: 'failed', attempts, error: outcome.error };
      failed += 1;
    } else {
      patch = { attempts, error: outcome.error };
    }
    tx.update(ref, patch);
    const total = Number(r.total) || 0;
    tx.update(runRef, {
      graded,
      failed,
      updatedAt: now,
      ...(graded + failed >= total ? { status: 'complete', completedAt: now } : {}),
    });
    return 'applied';
  });
}

export type StepResult =
  | { kind: 'busy'; leaseUntil: number }
  | { kind: 'not_found' }
  | { kind: 'ok'; processed: number; graded: number; failed: number; total: number; complete: boolean };

/** Grade up to STEP_MAX_ITEMS pending items of a run, under the run's lease. */
export async function stepRun(
  db: RunsDb,
  args: {
    runId: string;
    grade: (input: CalibrationInput) => Promise<ItemGrade>;
    now?: () => number;
    maxItems?: number;
  },
): Promise<StepResult> {
  const clock = args.now ?? Date.now;
  const runRef = db.doc(`${RUNS}/${args.runId}`);
  const leaseId = randomBytes(8).toString('hex');
  const lease = await db.runTransaction(async (tx) => {
    const snap = await tx.get(runRef);
    if (!snap.exists) return { kind: 'not_found' as const };
    const r = snap.data() || {};
    const t = clock();
    if (r.leaseId && Number(r.leaseUntil) > t) return { kind: 'busy' as const, leaseUntil: Number(r.leaseUntil) };
    tx.update(runRef, { leaseId, leaseUntil: t + LEASE_MS });
    return { kind: 'ok' as const };
  });
  if (lease.kind !== 'ok') return lease;

  const started = clock();
  let processed = 0;
  try {
    const pending = await db.collection(`${RUNS}/${args.runId}/items`)
      .where('status', '==', 'pending')
      .limit(Math.min(args.maxItems ?? STEP_MAX_ITEMS, 10))
      .get();
    const queue = pending.docs.map((d) => d.data() as CalibrationItem);
    const worker = async () => {
      while (queue.length && clock() - started < STEP_BUDGET_MS) {
        const item = queue.shift() as CalibrationItem;
        let outcome: ItemGrade;
        try {
          outcome = await args.grade(item.input);
        } catch (error) {
          outcome = { kind: 'retry', error: error instanceof Error ? error.message.slice(0, 200) : 'error' };
        }
        if ((await applyItemGrade(db, args.runId, item.index, outcome, clock())) === 'applied') processed += 1;
      }
    };
    await Promise.all(Array.from({ length: STEP_CONCURRENCY }, worker));
  } finally {
    // Release only our own lease.
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(runRef);
      if (snap.exists && (snap.data() || {}).leaseId === leaseId) tx.update(runRef, { leaseId: null, leaseUntil: 0 });
    });
  }
  const r = (await runRef.get()).data() || {};
  const total = Number(r.total) || 0;
  const graded = Number(r.graded) || 0;
  const failed = Number(r.failed) || 0;
  return { kind: 'ok', processed, graded, failed, total, complete: graded + failed >= total };
}

export async function listRuns(db: RunsDb): Promise<Record<string, any>[]> {
  const snap = await db.collection(RUNS).orderBy('createdAt', 'desc').limit(50).get();
  return snap.docs.map((d) => d.data() || {});
}

export async function getRun(db: RunsDb, runId: string): Promise<{ run: Record<string, any>; items: CalibrationItem[] } | null> {
  const snap = await db.doc(`${RUNS}/${runId}`).get();
  if (!snap.exists) return null;
  const items = await db.collection(`${RUNS}/${runId}/items`).orderBy('index', 'asc').limit(1000).get();
  return { run: snap.data() || {}, items: items.docs.map((d) => d.data() as CalibrationItem) };
}
