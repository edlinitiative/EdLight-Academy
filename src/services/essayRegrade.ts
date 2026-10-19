/**
 * Web adapter for shared/essayRegrade.ts: "Corriger maintenant" on the exam
 * results page. Same grader, same request body and the same transactional,
 * idempotent update as the mobile app (mobile/src/services/essayGrading.ts).
 */
import { doc, getDoc, runTransaction } from 'firebase/firestore';
import { db, authedFetch } from './firebase';
import {
  createEssayGradingRegistry,
  EssayGradeError,
  runEssayGrading,
  type ApplyResult,
  type EssayGradingOutcome,
} from '../../shared/essayRegrade';
import { ESSAY_GRADE_TIMEOUT_MS } from '../../shared/essayGradeCore';

export const essayGradingRegistry = createEssayGradingRegistry();

export const essayGradingKey = (uid: string, examId: string) => `${uid}:${examId}`;

export function gradeEssaysNow(
  uid: string,
  examId: string,
  questions: any[],
  ctx: { subject?: string; level?: string },
): Promise<EssayGradingOutcome> {
  const ref = doc(db, 'users', uid, 'examResults', examId);
  return essayGradingRegistry.run(essayGradingKey(uid, examId), () => runEssayGrading({
    gradeOne: async (body) => {
      let res: Response;
      try {
        res = await authedFetch('/api/grade-essay', body, { timeoutMs: ESSAY_GRADE_TIMEOUT_MS });
      } catch {
        throw new EssayGradeError('network');
      }
      if (res.status === 429) throw new EssayGradeError('rate_limit');
      if (!res.ok) throw new EssayGradeError('http');
      return res.json();
    },
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
