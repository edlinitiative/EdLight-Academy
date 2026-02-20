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

export async function saveExamResult(userId, examId, data) {
  if (!userId || !examId) return;
  const ref = doc(db, 'users', userId, 'examResults', examId);
  await setDoc(ref, cleanUndefined({
    ...data,
    created_at: serverTimestamp(),
    created_at_ms: Date.now(),
  }), { merge: true });
}

export async function loadExamResult(userId, examId) {
  if (!userId || !examId) return null;
  const ref = doc(db, 'users', userId, 'examResults', examId);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}
