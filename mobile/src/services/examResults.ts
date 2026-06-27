import { db, auth } from './firebase';
import {
  doc,
  getDoc,
  getDocs,
  collection,
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

/** Returns true only when Firebase Auth has a valid signed-in user. */
function hasFirebaseAuth() {
  return !!auth.currentUser;
}

export async function saveExamResult(userId, examId, data) {
  if (!userId || !examId || !hasFirebaseAuth()) return;
  const ref = doc(db, 'users', userId, 'examResults', examId);
  await setDoc(ref, cleanUndefined({
    ...data,
    created_at: serverTimestamp(),
    created_at_ms: Date.now(),
  }), { merge: true });
}

export async function loadExamResult(userId, examId) {
  if (!userId || !examId || !hasFirebaseAuth()) return null;
  const ref = doc(db, 'users', userId, 'examResults', examId);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

/**
 * Load a lightweight summary of ALL the user's exam results, keyed by exam_id.
 * Used to show "already done / best score" badges on the exam browser without
 * re-grading. Returns {} when not signed in.
 */
export async function loadAllExamResultSummaries(userId) {
  if (!userId || !hasFirebaseAuth()) return {};
  const col = collection(db, 'users', userId, 'examResults');
  const snap = await getDocs(col);
  const out = {};
  snap.forEach((d) => {
    const data = d.data() || {};
    out[d.id] = {
      percentage: data.summary?.percentage ?? data.percentage ?? null,
      submittedAtMs: data.submitted_at_ms ?? data.created_at_ms ?? null,
    };
  });
  return out;
}
