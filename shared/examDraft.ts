/**
 * Exam draft / submission continuity — pure helpers shared by web
 * (src/pages/ExamTake.tsx) and mobile (mobile/src/screens/ExamTakeScreen.tsx).
 *
 * Three defects found in the P0 code validation (2026-10-19) live here so both
 * platforms get the same rule and one test suite proves it:
 *
 *  1. The device-local mirror (`edlight-exam-draft-<examId>`) was not tied to
 *     an account. On a shared phone/computer, student B opening the same exam
 *     was offered student A's answers as "votre tentative" and, on Reprendre,
 *     wrote them into B's account. The mirror now carries `uid` and is only
 *     ever restored for that uid (`readLocalExamDraft`).
 *
 *  2. Drafts were written with `{merge: true}`, which deep-merges the
 *     `answers` map key by key and never deletes a key. A cleared answer came
 *     back on resume, and a NEW attempt after a submitted one inherited every
 *     answer of the previous attempt it had not overwritten yet — then graded
 *     them as the student's. `replaceFieldsOptions` makes each written
 *     top-level field (answers, questionResults…) replace the stored value.
 *
 *  3. Submission awaited Firestore's server acknowledgement with no bound.
 *     Offline, `setDoc` never settles, so the paper sat on "Envoi…" forever
 *     (web) or, on mobile, the local mirror had already been deleted and a
 *     kill lost the finished exam. `settleWithin` bounds the wait so the
 *     caller can decide honestly: confirmed / still pending / failed.
 */

export const EXAM_DRAFT_PREFIX = 'edlight-exam-draft-';

export function examDraftKey(examId: string | number): string {
  return `${EXAM_DRAFT_PREFIX}${examId}`;
}

export interface ExamDraftLike {
  uid?: string;
  status?: string;
  updated_at_ms?: number;
  answers?: Record<string, unknown>;
  currentQ?: number;
  currentIdx?: number;
  [key: string]: unknown;
}

/**
 * Parse a device-local draft mirror and return it only when it belongs to
 * `uid` and is still in progress. A mirror without a `uid` predates the
 * account binding and cannot be attributed safely, so it is ignored — the
 * account copy in Firestore (written in the same flush) still resumes.
 */
export function readLocalExamDraft(raw: string | null | undefined, uid: string | null | undefined): ExamDraftLike | null {
  if (!raw || !uid) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.uid !== uid) return null;
    if (parsed.status !== 'in_progress') return null;
    return parsed as ExamDraftLike;
  } catch {
    return null;
  }
}

/**
 * Choose what to resume: the newer of the account draft and the local mirror.
 * A remote draft that is `submitted` is NOT resumable, but a newer local
 * in-progress mirror is (a submission that never reached the server keeps the
 * mirror on purpose — see the take screens). Returns null when nothing is
 * resumable.
 */
export function pickResumeDraft(
  remote: ExamDraftLike | null | undefined,
  local: ExamDraftLike | null | undefined,
): ExamDraftLike | null {
  const remoteMs = Number(remote?.updated_at_ms) || 0;
  const localMs = Number(local?.updated_at_ms) || 0;
  const chosen = local && (!remote || localMs > remoteMs) ? local : remote;
  if (!chosen || chosen.status !== 'in_progress') return null;
  return chosen;
}

/**
 * The saved question index. Web writes `currentQ`, mobile writes `currentIdx`
 * (both index the same flattened question list), so a draft started on one
 * platform resumes at the right question on the other.
 */
export function draftPosition(draft: ExamDraftLike | null | undefined): number | null {
  if (!draft) return null;
  const v = Number.isFinite(draft.currentQ) ? draft.currentQ : draft.currentIdx;
  return Number.isFinite(v) && (v as number) >= 0 ? (v as number) : null;
}

/**
 * Firestore `SetOptions` that REPLACE every top-level field present in
 * `payload` (maps included) and leave the document's other fields alone.
 * `{merge: true}` would deep-merge maps instead, resurrecting deleted keys.
 */
export function replaceFieldsOptions(payload: Record<string, unknown>): { mergeFields: string[] } {
  return { mergeFields: Object.keys(payload) };
}

/**
 * For "Reprendre" listings: hide a mirror that belongs to ANOTHER account on
 * this device. Owner-less legacy mirrors stay listed (they predate the uid
 * binding); the take screen itself never restores them.
 */
export function isOtherAccountDraft(draft: { uid?: unknown } | null | undefined, uid: string | null | undefined): boolean {
  return !!draft && typeof draft.uid === 'string' && draft.uid !== (uid || null);
}

export type SettleOutcome<T> =
  | { status: 'confirmed'; value: T }
  | { status: 'pending' }
  | { status: 'failed'; error: unknown };

/**
 * Wait for `promise` at most `ms`. 'pending' means the write is still queued
 * (offline / slow): Firestore keeps it and will commit on reconnect, but the
 * UI must not call it saved.
 */
export function settleWithin<T>(promise: Promise<T>, ms: number): Promise<SettleOutcome<T>> {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve({ status: 'pending' });
    }, ms);
    promise.then(
      (value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ status: 'confirmed', value });
      },
      (error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ status: 'failed', error });
      },
    );
  });
}
