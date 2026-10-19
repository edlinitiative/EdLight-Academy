/**
 * shared/essayGradeCore.ts — what a /api/grade-essay response MEANS, for both
 * clients. No imports, so shared/examUtils.ts can use it without a cycle.
 *
 * Three outcomes, and only one of them is a grade:
 *
 *   graded     the endpoint judged the rubric and returned a score ("6.5/10")
 *   too_short  the endpoint refused to spend a call on an empty or very short
 *              text. That IS an assessment (the answer is not developed
 *              enough to earn credit), so it is final: 0, with the message.
 *   failed     anything else: network error, timeout, 429, 5xx, no provider,
 *              an LLM error answered with the manual fallback, or a response
 *              we cannot read. NOT a zero. The item is `ungraded`, excluded
 *              from the percentage, and offered "Corriger maintenant".
 *
 * Before this module the web read a failed call as `score: 'N/A'` → ratio 0 →
 * status `incorrect`, so a dropped connection scored a dissertation 0/20
 * (P0 validation E-11), and the mobile app never called the grader at all.
 */

export const ESSAY_GRADE_TIMEOUT_MS = 45_000;
export const ESSAY_GRADE_CONCURRENCY = 3;

export type EssayOutcome = 'graded' | 'too_short' | 'failed';

/** "6.5/10" → 0.65. Null when the string is not a readable score. */
export function parseEssayScoreRatio(score: unknown): number | null {
  if (typeof score !== 'string') return null;
  const m = score.trim().match(/^(-?\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)$/);
  if (!m) return null;
  const num = parseFloat(m[1].replace(',', '.'));
  const den = parseFloat(m[2].replace(',', '.'));
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return null;
  return Math.max(0, Math.min(1, num / den));
}

export function classifyEssayResponse(resp: unknown): EssayOutcome {
  if (!resp || typeof resp !== 'object') return 'failed';
  const r = resp as Record<string, unknown>;
  if (r.graded === false) {
    return r.wordStatus === 'empty' || r.wordStatus === 'too_short' ? 'too_short' : 'failed';
  }
  // `graded: true`, or an older response with no flag: only a readable score counts.
  return parseEssayScoreRatio(r.score) != null ? 'graded' : 'failed';
}

export function isEssayType(question: unknown): boolean {
  const t = (question as { type?: unknown } | null)?.type;
  return t === 'essay' || t === 'short_answer';
}

/** Firestore rejects `undefined` anywhere in a document: drop it at every depth. */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.filter((v) => v !== undefined).map((v) => stripUndefined(v)) as unknown as T;
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);
const strList = (v: unknown, maxItems: number, maxLen: number) =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).slice(0, maxItems).map((x) => String(x).slice(0, maxLen)) : undefined;

/**
 * The part of a grader response worth keeping on the result document: the
 * score, the feedback and the criterion judgements. Bounded and Firestore-safe
 * (no undefined, no provider label, no evidence quotes of unbounded length).
 */
export function leanEssayFeedback(resp: unknown): Record<string, unknown> {
  const r = (resp && typeof resp === 'object' ? resp : {}) as Record<string, unknown>;
  const criteria = Array.isArray(r.criteria)
    ? (r.criteria as Array<Record<string, unknown>>).slice(0, 12).map((c) => stripUndefined({
      label: str(c?.label, 120) ?? '',
      level: typeof c?.level === 'number' ? c.level : 0,
      comment: str(c?.comment, 240),
    }))
    : undefined;
  return stripUndefined({
    isCorrect: r.isCorrect === true,
    score: str(r.score, 20) ?? 'N/A',
    ratio: typeof r.ratio === 'number' && Number.isFinite(r.ratio) ? r.ratio : undefined,
    graded: typeof r.graded === 'boolean' ? r.graded : undefined,
    feedback: str(r.feedback, 600),
    criteria,
    strengths: strList(r.strengths, 4, 240),
    improvements: strList(r.improvements, 4, 240),
    wordCount: typeof r.wordCount === 'number' ? r.wordCount : undefined,
    wordStatus: str(r.wordStatus, 20),
    wordMessage: str(r.wordMessage, 200),
    capped: typeof r.capped === 'boolean' ? r.capped : undefined,
    rubricProfile: str(r.rubricProfile, 20),
  });
}
