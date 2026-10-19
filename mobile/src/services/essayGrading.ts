/**
 * AI grading of written exam answers on mobile (shared/essayRegrade.ts).
 *
 * Before this, ExamTakeScreen graded with an empty pre-graded map, so every
 * essay landed as `manual` with 0 points (or was text-matched against a
 * one-line key) and nothing ever corrected it. Now:
 *
 *   • submit stores essays as `ungraded` (left out of the score) and calls
 *     `startEssayGrading` WITHOUT awaiting it: the paper is saved and the
 *     results screen opens immediately;
 *   • the run calls the same /api/grade-essay as the web (same auth, same
 *     body, same rubric), then updates the result document in one transaction;
 *   • ExamResultsScreen shows "Correction en cours" while it runs and offers
 *     "Corriger maintenant" when it failed (offline, timeout, 429) or for old
 *     papers that were never graded.
 *
 * The run never touches XP, mastery or the review schedule (recorded once, at
 * submit), so retrying can never count anything twice.
 */
import { doc, getDoc, runTransaction } from 'firebase/firestore';
import { auth, db } from './firebase';
import {
  createEssayGradingRegistry,
  EssayGradeError,
  runEssayGrading,
  type ApplyResult,
  type EssayGradeBody,
  type EssayGradingOutcome,
} from '../../../shared/essayRegrade';
import { ESSAY_GRADE_TIMEOUT_MS } from '../../../shared/essayGradeCore';

const GRADE_URL = 'https://academy.edlight.org/api/grade-essay';

export const essayGradingRegistry = createEssayGradingRegistry();
export const essayGradingKey = (uid: string, examId: string) => `${uid}:${examId}`;

/** POST one answer to the grader. Throws EssayGradeError on any non-answer. */
export async function postEssayForGrading(body: EssayGradeBody, timeoutMs = ESSAY_GRADE_TIMEOUT_MS): Promise<unknown> {
  const user = auth.currentUser;
  if (!user) throw new EssayGradeError('http');
  let token: string;
  try {
    token = await user.getIdToken();
  } catch {
    throw new EssayGradeError('network');
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(GRADE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch {
    throw new EssayGradeError('network');
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) throw new EssayGradeError('rate_limit');
  if (!res.ok) throw new EssayGradeError('http');
  try {
    return await res.json();
  } catch {
    throw new EssayGradeError('http');
  }
}

/**
 * Grade whatever still needs grading on this paper. Joins a run already in
 * flight for the same paper instead of starting a second one.
 */
export function startEssayGrading(
  uid: string,
  examId: string,
  questions: any[],
  ctx: { subject?: string; level?: string },
): Promise<EssayGradingOutcome> {
  const ref = doc(db, 'users', uid, 'examResults', examId);
  return essayGradingRegistry.run(essayGradingKey(uid, examId), () => runEssayGrading({
    gradeOne: (body) => postEssayForGrading(body),
    readResult: async () => {
      const snap = await getDoc(ref);
      return snap.exists() ? snap.data() : null;
    },
    commit: (mutate) => runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const result: ApplyResult = mutate(snap.exists() ? snap.data() : null);
      if (result.kind === 'patch') tx.update(ref, result.patch);
      return result;
    }),
  }, { questions, subject: ctx.subject, level: ctx.level }));
}
