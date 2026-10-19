import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_lib/requireAuth';
import { checkRateLimit } from './_lib/rateLimit';
import { gradeEssay } from './_lib/essayGrader';
import type { AnswerPart } from './_lib/essayGrading';

/**
 * POST /api/grade-essay
 *
 * Standards-based analytic grading for essay / short_answer questions. The
 * configured LLM (any provider — see api/_lib/llm.ts) judges each rubric
 * criterion 0/1/2 and writes feedback; the SCORE is computed deterministically
 * here from those judgements + the question's word-count expectation. The same
 * answer always yields the same grade, with no human gold set required.
 *
 * Body: {
 *   question: string,
 *   answer: string,
 *   modelAnswer?: string,
 *   context?: string,            // reference passage, if any
 *   answerParts?: AnswerPart[],  // the rubric (expected points)
 *   points?: number,             // max points (default 10)
 *   type?: 'essay' | 'short_answer',
 *   subject?: string,            // 'Français' / 'Philosophie' → dissertation rubric
 *   level?: string,
 * }
 *
 * Response is a backward-compatible superset of the old
 * { isCorrect, feedback, score } shape, adding criteria/strengths/improvements
 * and word-count diagnostics.
 */

interface GradeEssayBody {
  question?: string;
  answer?: string;
  modelAnswer?: string;
  context?: string;
  answerParts?: AnswerPart[];
  points?: number;
  type?: string;
  subject?: string;
  level?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const uid = await requireAuth(req, res);
  if (!uid) return;

  const { allowed, remaining, resetAt } = await checkRateLimit(uid, 'grade-essay');
  if (!allowed) {
    res.setHeader('X-RateLimit-Limit', '20');
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader('Retry-After', String(Math.ceil((resetAt - Date.now()) / 1000)));
    res.status(429).json({
      error: 'rate_limit_exceeded',
      message: 'Trop de requêtes. Réessayez dans une heure.',
    });
    return;
  }
  res.setHeader('X-RateLimit-Remaining', String(remaining));

  const body: GradeEssayBody = req.body || {};
  // The grader itself lives in api/_lib/essayGrader.ts so the admin
  // calibration harness (/api/essay-calibration) measures exactly this code.
  const result = await gradeEssay(body);
  if (!result.ok) {
    res.status(400).json({ error: 'Missing required fields: question, answer' });
    return;
  }
  res.status(200).json(result.body);
}
