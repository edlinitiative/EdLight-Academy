import { db } from './firebase';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';

function cleanUndefined(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

export async function loadExamAttemptDraft(userId, examId) {
  if (!userId || !examId) return null;
  const ref = doc(db, 'users', userId, 'examAttempts', examId);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function saveExamAttemptDraft(userId, examId, draft) {
  if (!userId || !examId) return;
  const ref = doc(db, 'users', userId, 'examAttempts', examId);

  const payload = cleanUndefined({
    ...draft,
    status: 'in_progress',
    updated_at: serverTimestamp(),
    updated_at_ms: Date.now(),
  });

  await setDoc(ref, payload, { merge: true });
}

export async function markExamAttemptSubmitted(userId, examId, extra = {}) {
  if (!userId || !examId) return;
  const ref = doc(db, 'users', userId, 'examAttempts', examId);
  await setDoc(ref, {
    status: 'submitted',
    submitted_at: serverTimestamp(),
    submitted_at_ms: Date.now(),
    updated_at: serverTimestamp(),
    updated_at_ms: Date.now(),
    ...cleanUndefined(extra),
  }, { merge: true });
}
