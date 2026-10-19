/**
 * api/_lib/essayGrader.ts — ONE essay grader, called by /api/grade-essay (the
 * students' papers) and by /api/essay-calibration (the admin harness that
 * measures it against teacher scores). Calibration is only meaningful if both
 * run exactly this code: same clamps, same rubric profile choice, same word
 * gate, same prompt, same deterministic score.
 *
 * Returns the response body /api/grade-essay has always sent (a superset of
 * the old { isCorrect, feedback, score } shape). Never throws: an LLM failure
 * is the `graded: false` manual fallback.
 */
import { chatJSON, resolveLLMConfig, LLMError, type LLMConfig } from './llm';
import {
  analyzeWordCount,
  buildEssayRubric,
  selectRubricProfile,
  buildGradingPrompt,
  normalizeGraderResponse,
  computeEssayScore,
  type AnswerPart,
} from './essayGrading';

export interface GradeEssayInput {
  question?: unknown;
  answer?: unknown;
  modelAnswer?: unknown;
  context?: unknown;
  answerParts?: unknown;
  points?: unknown;
  type?: unknown;
  subject?: unknown;
  level?: unknown;
}

export type GradeEssayResult =
  | { ok: false; error: 'missing_fields' }
  | { ok: true; body: Record<string, any> };

// Cap every user-supplied text field before it reaches the prompt builder so
// no single input can blow up token cost or drown the grading instructions
// (prompt-injection / DoS hardening). Answers/context are long-form, so they
// get a generous cap; short metadata fields are tightly bounded.
const clamp = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);

export async function gradeEssay(
  input: GradeEssayInput,
  deps: { config?: LLMConfig | null; chat?: typeof chatJSON } = {},
): Promise<GradeEssayResult> {
  const question = clamp(input.question, 4000);
  const answer = clamp(input.answer, 12000);
  const modelAnswer = clamp(input.modelAnswer, 4000);
  const context = clamp(input.context, 8000);
  const subject = clamp(input.subject, 100);
  const level = clamp(input.level, 100);
  const answerParts = (Array.isArray(input.answerParts) ? input.answerParts.slice(0, 30) : input.answerParts) as AnswerPart[] | undefined;
  const type = input.type === 'short_answer' ? 'short_answer' : 'essay';
  const points = typeof input.points === 'number' && input.points > 0 ? input.points : 10;

  if (!question || !answer) return { ok: false, error: 'missing_fields' };

  // French and philosophy essays are marked as dissertations (structure +
  // language), everything else on its authored content points.
  const profile = selectRubricProfile({ subject, type, question });
  const rubric = buildEssayRubric(answerParts, profile);
  const word = analyzeWordCount(answer, type);

  // Graceful, still-useful response when the LLM can't or shouldn't run.
  const manualFallback = (message: string): GradeEssayResult => ({
    ok: true,
    body: {
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
      rubricProfile: profile,
    },
  });

  // Too short to assess meaningfully — tell the student, don't spend a call.
  if (word.status === 'empty' || word.status === 'too_short') return manualFallback(word.message);

  const config = deps.config === undefined ? resolveLLMConfig() : deps.config;
  if (!config) {
    return manualFallback('Évaluation automatique indisponible (aucun fournisseur IA configuré). Votre réponse n’est pas encore corrigée : relancez la correction depuis vos résultats.');
  }

  try {
    const { system, user } = buildGradingPrompt({
      question, answer, modelAnswer, context, subject, level, rubric, word,
    });
    const raw = await (deps.chat ?? chatJSON)({ system, user, temperature: 0, maxTokens: 1200, config });
    const grade = normalizeGraderResponse(raw, rubric);
    const score = computeEssayScore({ grade, rubric, word, points });

    const feedback = grade.feedback
      || (score.isCorrect ? 'Bon travail dans l\'ensemble.' : 'Réponse à approfondir — voyez les pistes d\'amélioration.');

    return {
      ok: true,
      body: {
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
        rubricProfile: profile,
        provider: config.label,
      },
    };
  } catch (error) {
    const detail = error instanceof LLMError ? `${error.provider} ${error.status}` : 'unknown';
    console.error('grade-essay failed:', detail, error instanceof Error ? error.message : error);
    return manualFallback('L\'évaluation automatique a échoué. Votre réponse n’est pas encore corrigée : relancez la correction depuis vos résultats.');
  }
}
