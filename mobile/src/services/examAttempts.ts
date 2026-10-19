import { db, auth } from './firebase';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { recordActivity as recordStreakActivity } from './streakService';
import { replaceFieldsOptions } from '../../../shared/examDraft';

function cleanUndefined(obj: any) {
  if (!obj || typeof obj !== 'object') return obj;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

/** Returns true only when Firebase Auth has a valid signed-in user. */
function hasFirebaseAuth() {
  return !!auth.currentUser;
}

export async function loadExamAttemptDraft(userId: string, examId: string) {
  if (!userId || !examId || !hasFirebaseAuth()) return null;
  const ref = doc(db, 'users', userId, 'examAttempts', examId);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function saveExamAttemptDraft(
  userId: string,
  examId: string,
  draft: any,
  opts: { replace?: boolean } = {},
) {
  if (!userId || !examId || !hasFirebaseAuth()) return;
  const ref = doc(db, 'users', userId, 'examAttempts', examId);

  const payload = cleanUndefined({
    ...draft,
    status: 'in_progress',
    updated_at: serverTimestamp(),
    updated_at_ms: Date.now(),
  });

  // `replace: true` overwrites the whole document (restart). Otherwise each
  // field we send REPLACES the stored one (`mergeFields`), and fields we don't
  // send are kept. Never `{merge:true}`: it deep-merges the `answers` map key
  // by key and never deletes a key, so a cleared answer came back on resume
  // and a new attempt after a submitted one inherited the previous attempt's
  // answers — which were then graded as the student's (P0 validation).
  await setDoc(ref, payload, opts.replace ? {} : replaceFieldsOptions(payload));
}

function submittedAttemptPayload(extra: any): Record<string, any> {
  return {
    status: 'submitted',
    submitted_at: serverTimestamp(),
    submitted_at_ms: Date.now(),
    updated_at: serverTimestamp(),
    updated_at_ms: Date.now(),
    ...cleanUndefined(extra),
  };
}

export async function markExamAttemptSubmitted(userId: string, examId: string, extra: any = {}) {
  if (!userId || !examId || !hasFirebaseAuth()) return;
  const ref = doc(db, 'users', userId, 'examAttempts', examId);
  const payload = submittedAttemptPayload(extra);
  await setDoc(ref, payload, replaceFieldsOptions(payload));

  // Record global cross-course streak
  recordStreakActivity(userId).catch(() => {});
}

/**
 * Submit = the result document AND the attempt's `submitted` mark, in ONE
 * atomic batch. They used to be two sequential awaits, so a failure between
 * them left either a result with an attempt still "en cours" (offered for
 * resume) or — on mobile, which marked the attempt first — a submitted
 * attempt with NO result: the finished exam was gone.
 *
 * The result document is fully replaced (a retake must not inherit the
 * previous attempt's answers/preGradedResults). Resolves only on server
 * acknowledgement; offline it stays pending, so callers bound the wait with
 * `settleWithin` (shared/examDraft.ts). Resolves `false` when nothing was
 * written (Firebase Auth holds no user) — callers must not call that saved.
 */
export async function commitExamSubmission(userId: string, examId: string, result: any, attemptExtra: any = {}) {
  if (!userId || !examId || !hasFirebaseAuth()) return false;
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', userId, 'examResults', examId), cleanUndefined({
    ...result,
    created_at: serverTimestamp(),
    created_at_ms: Date.now(),
  }));
  const attempt = submittedAttemptPayload(attemptExtra);
  batch.set(doc(db, 'users', userId, 'examAttempts', examId), attempt, replaceFieldsOptions(attempt));
  await batch.commit();
  recordStreakActivity(userId).catch(() => {});
  return true;
}
