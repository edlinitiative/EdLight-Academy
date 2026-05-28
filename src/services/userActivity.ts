import { db } from './firebase';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';

export async function listRecentQuizAttempts(userId, maxCount = 50) {
  if (!userId) return [];
  const ref = collection(db, 'users', userId, 'quizAttempts');
  const q = query(ref, orderBy('attemptedAtMs', 'desc'), limit(maxCount));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listRecentExamAttempts(userId, maxCount = 25) {
  if (!userId) return [];
  const ref = collection(db, 'users', userId, 'examAttempts');
  const q = query(ref, orderBy('updated_at_ms', 'desc'), limit(maxCount));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listRecentExamResults(userId, maxCount = 10) {
  if (!userId) return [];
  const ref = collection(db, 'users', userId, 'examResults');
  const q = query(ref, orderBy('submitted_at_ms', 'desc'), limit(maxCount));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
