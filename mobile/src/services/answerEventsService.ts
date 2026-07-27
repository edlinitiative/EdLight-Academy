/**
 * Answer Events — per-question outcome logging (Adaptive Engine, Slice 3b)
 * ────────────────────────────────────────────────────────────────────────
 * Appends one anonymous "this question was answered right/wrong" event per
 * graded question to the top-level `answerEvents` log. The Vercel cron
 * (/api/aggregate-question-stats) folds these into questionStats/{id}, from
 * which clients derive crowd difficulty. Append-only + fire-and-forget: a
 * failed log must never disturb the quiz/trivia flow.
 *
 * The questionId is a content hash of the CANONICAL (French) stem so the same
 * question maps to one ID across languages and platforms (adaptiveEngine
 * .questionIdFromStem). Signed-out plays are not logged (rules require a uid).
 *
 * Spec: docs/ADAPTIVE_ENGINE.md §4, §7
 */
import { db, auth } from './firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { questionIdFromStem } from './adaptiveEngine';

/**
 * Log one graded answer. `canonicalStem` MUST be the French stem (`q.q` /
 * `q.question`), never the localized one, so a question has a single stable ID.
 */
export function logAnswerEvent(canonicalStem: string, correct: boolean): void {
  const user = auth.currentUser;
  if (!user) return;
  const questionId = questionIdFromStem(canonicalStem);
  if (!questionId) return;
  addDoc(collection(db, 'answerEvents'), {
    uid: user.uid,
    questionId,
    correct: !!correct,
    createdMs: Date.now(),
    createdAt: serverTimestamp(),
  }).catch(() => {});
}
