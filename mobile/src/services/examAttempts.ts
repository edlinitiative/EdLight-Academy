import { db, auth } from './firebase';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { recordActivity as recordStreakActivity } from './streakService';

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

export async function saveExamAttemptDraft(userId: string, examId: string, draft: any) {
  if (!userId || !examId || !hasFirebaseAuth()) return;
  const ref = doc(db, 'users', userId, 'examAttempts', examId);

  const payload = cleanUndefined({
    ...draft,
    status: 'in_progress',
    updated_at: serverTimestamp(),
    updated_at_ms: Date.now(),
  });

  await setDoc(ref, payload, { merge: true });
}

export async function markExamAttemptSubmitted(userId: string, examId: string, extra: any = {}) {
  if (!userId || !examId || !hasFirebaseAuth()) return;
  const ref = doc(db, 'users', userId, 'examAttempts', examId);
  await setDoc(ref, {
    status: 'submitted',
    submitted_at: serverTimestamp(),
    submitted_at_ms: Date.now(),
    updated_at: serverTimestamp(),
    updated_at_ms: Date.now(),
    ...cleanUndefined(extra),
  }, { merge: true });

  // Record global cross-course streak
  recordStreakActivity(userId).catch(() => {});
}
