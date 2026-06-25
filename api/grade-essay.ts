import type { VercelRequest, VercelResponse } from '@vercel/node';
import { chatJSON, resolveLLMConfig, LLMError } from './_lib/llm';
import {
  analyzeWordCount,
  buildEssayRubric,
  buildGradingPrompt,
  normalizeGraderResponse,
  computeEssayScore,
  type AnswerPart,
} from './_lib/essayGrading';

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
 *   subject?: string,
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

  const body: GradeEssayBody = req.body || {};
  const { question, answer, modelAnswer, context, answerParts, subject, level } = body;
  const type = body.type === 'short_answer' ? 'short_answer' : 'essay';
  const points = typeof body.points === 'number' && body.points > 0 ? body.points : 10;

  if (!question || !answer) {
    res.status(400).json({ error: 'Missing required fields: question, answer' });
    return;
  }

  const rubric = buildEssayRubric(answerParts);
  const word = analyzeWordCount(answer, type);

  // Graceful, still-useful response when the LLM can't or shouldn't run.
  const manualFallback = (message: string) => {
    res.status(200).json({
      isCorrect: false,
      score: 'N/A',
      feedback: message,
      ratio: 0,
      awarded: 0,
      maxPoints: points,
      criteria: rubric.criteria.map((c) => ({ label: c.label, level: 0, evidence: '', comment: '' })),
      strengths: [],
      improvements: [],
      wordCount: word.words,
      wordStatus: word.status,
      wordMessage: word.message,
      capped: false,
      graded: false,
    });
  };

  // Too short to assess meaningfully — tell the student, don't spend a call.
  if (word.status === 'empty' || word.status === 'too_short') {
    manualFallback(word.message);
    return;
  }

  const config = resolveLLMConfig();
  if (!config) {
    manualFallback('Évaluation automatique indisponible (aucun fournisseur IA configuré). Votre réponse sera revue manuellement.');
    return;
  }

  try {
    const { system, user } = buildGradingPrompt({
      question, answer, modelAnswer, context, subject, level, rubric, word,
    });
    const raw = await chatJSON({ system, user, temperature: 0, maxTokens: 1200, config });
    const grade = normalizeGraderResponse(raw, rubric);
    const score = computeEssayScore({ grade, rubric, word, points });

    const feedback = grade.feedback
      || (score.isCorrect ? 'Bon travail dans l\'ensemble.' : 'Réponse à approfondir — voyez les pistes d\'amélioration.');

    res.status(200).json({
      isCorrect: score.isCorrect,
      score: score.score,
      feedback,
      ratio: score.ratio,
      awarded: score.awarded,
      maxPoints: score.maxPoints,
      contentRatio: score.contentRatio,
      criteria: grade.criteria.map((c) => ({ label: c.label, level: c.level, evidence: c.evidence, comment: c.comment })),
      taskResponse: grade.taskResponse,
      organization: grade.organization,
      language: grade.language,
      strengths: grade.strengths,
      improvements: grade.improvements,
      wordCount: word.words,
      wordStatus: word.status,
      wordMessage: word.message,
      capped: score.capped,
      graded: true,
      provider: config.label,
    });
  } catch (error) {
    const detail = error instanceof LLMError ? `${error.provider} ${error.status}` : 'unknown';
    console.error('grade-essay failed:', detail, error instanceof Error ? error.message : error);
    manualFallback('L\'évaluation automatique a échoué. Votre réponse sera revue manuellement.');
  }
}
