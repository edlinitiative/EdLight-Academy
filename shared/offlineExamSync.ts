/**
 * offlineExamSync — an exam submitted without a connection, queued in the
 * per-account outbox (shared/outbox.ts) and written when the network returns.
 * ─────────────────────────────────────────────────────────────────────────
 * Rules (larger product additions item 4, P0 validation F1/F3/F22):
 *   • the operation is queued BEFORE the write is attempted, under the uid of
 *     the student who took the paper, so an app kill cannot lose it and a
 *     replay can only ever run into that same account (the outbox and the
 *     platform handlers both check the signed-in uid);
 *   • replay is idempotent: the result carries the operation id
 *     (`submission_op_id`, also stamped on the first direct write), so a replay
 *     that finds its own id already written is done, not written twice;
 *   • a queued paper never overwrites a NEWER result for the same exam (taken
 *     later on another device, or online after this one): it is dropped;
 *   • offline scores are practice only. They are stamped `offline: true` and
 *     never feed competition boards that need server timing.
 *
 * The decision is a pure function so both platforms share it and tests pin it.
 */

export const EXAM_SUBMIT_KIND = 'exam-submit';

export interface QueuedExamSubmission {
  examId: string;
  /** When the student pressed Soumettre, on the device clock. */
  submittedAtMs: number;
  /** The examResults document to write (without server timestamps). */
  result: Record<string, any>;
  /** Fields for the examAttempts `submitted` mark. */
  attempt: Record<string, any>;
  /** Written answers still waiting for the AI grader after the write. */
  pendingEssays: number;
  subject?: string;
  level?: string;
  /** Where the paper came from: a downloaded pack or the network copy. */
  source?: 'pack' | 'network';
}

/** One queued submission per exam attempt; resubmitting the same attempt keeps the first. */
export function examSubmitOpId(examId: string, submittedAtMs: number): string {
  return `exam:${String(examId)}:${Math.floor(submittedAtMs)}`.replace(/[^A-Za-z0-9_:.-]/g, '_').slice(0, 200);
}

export function isQueuedExamSubmission(p: any): p is QueuedExamSubmission {
  return !!p && typeof p === 'object' && typeof p.examId === 'string' && p.examId.length > 0
    && Number.isFinite(p.submittedAtMs) && !!p.result && typeof p.result === 'object'
    && !!p.attempt && typeof p.attempt === 'object';
}

/** Build the result document a queued submission writes. */
export function queuedResultDocument(payload: QueuedExamSubmission, opId: string): Record<string, any> {
  return {
    ...payload.result,
    submitted_at_ms: payload.submittedAtMs,
    offline: true,
    submission_op_id: opId,
    synced_at_ms: Date.now(),
  };
}

/**
 * What a replay does, given the result document currently on the account.
 *   write: nothing newer is there, write the queued paper
 *   done:  this very operation was already written (lost response, second device drain)
 *   drop:  a newer result exists; the queued paper would erase it
 */
export function decideExamReplay(existing: Record<string, any> | null | undefined, payload: QueuedExamSubmission, opId: string): 'write' | 'done' | 'drop' {
  if (!existing) return 'write';
  if (existing.submission_op_id === opId) return 'done';
  const theirs = Number(existing.submitted_at_ms ?? existing.created_at_ms ?? 0);
  if (Number.isFinite(theirs) && theirs > payload.submittedAtMs) return 'drop';
  return 'write';
}

export type ReplayWrite = { kind: 'write'; result: Record<string, any>; attempt: Record<string, any> };
export type ReplayDecision = ReplayWrite | 'done' | 'drop';

/**
 * One replay, inside the platform's Firestore transaction: `transact` reads the
 * current result document, hands it to the callback, and applies the writes
 * the callback returns (result replaced, attempt marked submitted).
 */
export async function runExamReplay(
  opId: string,
  payload: unknown,
  transact: (decide: (existing: Record<string, any> | null) => ReplayDecision) => Promise<ReplayDecision>,
): Promise<'written' | 'done' | 'drop'> {
  if (!isQueuedExamSubmission(payload)) return 'drop';
  const outcome = await transact((existing) => {
    const decision = decideExamReplay(existing, payload, opId);
    if (decision !== 'write') return decision;
    return {
      kind: 'write',
      result: queuedResultDocument(payload, opId),
      attempt: { ...payload.attempt, submitted_at_ms: payload.submittedAtMs, submission_op_id: opId },
    };
  });
  return typeof outcome === 'string' ? outcome : 'written';
}
