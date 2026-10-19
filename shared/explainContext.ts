/**
 * shared/explainContext.ts — "Explique-moi": the structured context a missed
 * question hands to Sandra (/api/chat `questionContext`), for web and mobile.
 *
 * Why structured instead of pasting the question into the message: the
 * student's bubble stays one short sentence in their language, the server can
 * bound and sanitize every field, retrieval can search on the question
 * itself, and the system prompt can say WHICH text is the authored key (to be
 * explained, never contradicted) and which is the student's answer.
 *
 * Integrity: this context only ever leaves a results / correction surface,
 * after the answer has been shown to the student. The callers never build it
 * on a live exam paper or in competition (SandraWidget's restriction rule
 * still applies on the web; mobile only offers it from corrections). But all
 * of it is client-asserted, so the SERVER decides (api/_lib/explainGate.ts):
 * only an exam question with a submitted paper for the caller, or a quiz-bank
 * question it can read itself, unlocks the explain-the-answer mode, and then
 * with the server's own copy of the question, key and explanation. Anything
 * else, or any live competition for the caller, is ordinary hint-only
 * tutoring. The ids are what make that check possible: exam rows send the
 * flattened question index as `questionId`, bank rows the quiz doc id.
 *
 * Privacy: the student's own answer is now sent to the LLM provider and kept
 * in the admin-visible transcript. The button sheet says so in one line
 * (EXPLAIN_DISCLOSURE).
 */
import { isPlaceholderKey } from './question/compile';

export type ExplainSurface = 'exam_results' | 'quiz_result' | 'practice' | 'revision';

export interface QuestionContext {
  surface: ExplainSurface;
  /** The question as the student saw it (may contain $LaTeX$). */
  question: string;
  studentAnswer?: string;
  /** The authored key. Absent (never a placeholder) when none is usable. */
  expectedAnswer?: string;
  /** The authored one-line explanation, when there is one. */
  explanation?: string;
  subject?: string;
  level?: string;
  questionType?: string;
  status?: 'incorrect' | 'partial' | 'unanswered';
  questionId?: string;
  examId?: string;
}

export const QUESTION_CONTEXT_LIMITS = {
  question: 1500,
  studentAnswer: 1200,
  expectedAnswer: 1200,
  explanation: 1500,
  short: 80,
};

const SURFACES: ExplainSurface[] = ['exam_results', 'quiz_result', 'practice', 'revision'];
const STATUSES = ['incorrect', 'partial', 'unanswered'] as const;
const ID = /^[A-Za-z0-9_.:-]{1,120}$/;

const text = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string' && typeof v !== 'number') return undefined;
  const s = String(v).split(String.fromCharCode(0)).join('').trim();
  return s ? s.slice(0, max) : undefined;
};

/**
 * Untrusted input → a bounded context, or undefined when there is no question.
 * Applied by the server (the authority) and by the clients before sending.
 */
export function sanitizeQuestionContext(raw: unknown): QuestionContext | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const L = QUESTION_CONTEXT_LIMITS;
  const question = text(r.question, L.question);
  if (!question) return undefined;
  const surface = SURFACES.includes(r.surface as ExplainSurface) ? (r.surface as ExplainSurface) : 'practice';
  let expectedAnswer = text(r.expectedAnswer, L.expectedAnswer);
  // "Texte manquant", "N/A"… are not keys: never present one to Sandra as the answer.
  if (expectedAnswer && isPlaceholderKey(expectedAnswer)) expectedAnswer = undefined;
  const status = STATUSES.includes(r.status as typeof STATUSES[number]) ? (r.status as QuestionContext['status']) : undefined;
  const id = (v: unknown) => (typeof v === 'string' && ID.test(v) ? v : undefined);
  const ctx: QuestionContext = { surface, question };
  const studentAnswer = text(r.studentAnswer, L.studentAnswer);
  const explanation = text(r.explanation, L.explanation);
  const subject = text(r.subject, L.short);
  const level = text(r.level, L.short);
  const questionType = text(r.questionType, 40);
  if (studentAnswer) ctx.studentAnswer = studentAnswer;
  if (expectedAnswer) ctx.expectedAnswer = expectedAnswer;
  if (explanation) ctx.explanation = explanation;
  if (subject) ctx.subject = subject;
  if (level) ctx.level = level;
  if (questionType) ctx.questionType = questionType;
  if (status) ctx.status = status;
  const questionId = id(r.questionId);
  const examId = id(r.examId);
  if (questionId) ctx.questionId = questionId;
  if (examId) ctx.examId = examId;
  return ctx;
}

/** The student's own bubble: one short sentence, in their language. No em-dash. */
export function explainAskMessage(lang: 'fr' | 'ht'): string {
  return lang === 'ht'
    ? 'Eksplike m kesyon sa a etap pa etap, epi montre m kote m te fè erè.'
    : 'Explique-moi cette question étape par étape, et montre-moi où je me suis trompé.';
}

export const EXPLAIN_LABEL = { fr: 'Explique-moi', ht: 'Eksplike m' };

/** The one-line disclosure shown where the explanation opens. */
export const EXPLAIN_DISCLOSURE = {
  fr: 'Sandra reçoit la question, ta réponse et la correction.',
  ht: 'Sandra resevwa kesyon an, repons ou ak koreksyon an.',
};

/** The single new event (larger-product-additions doc, item 1). */
export const EXPLAIN_EVENT = 'correction_explain_opened';

/**
 * Telemetry detail, allowlisted keys only (shared/telemetry DETAIL_KEYS):
 * where the button was, the question type and the verdict. Never the
 * question, the answers, ids or the subject text.
 */
export function explainTelemetryDetail(ctx: QuestionContext, signedIn: boolean): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = { surface: ctx.surface, signedIn };
  if (ctx.questionType && /^[a-z_]{1,30}$/.test(ctx.questionType)) out.type = ctx.questionType;
  if (ctx.status) out.status = ctx.status;
  return out;
}

// ── Exam questions → readable text (both results screens) ──────────────────

const isChoiceType = (type: unknown) => type === 'multiple_choice' || type === 'mcq' || type === 'qcm';

function optionText(q: any, key: string): string | undefined {
  const opts = q?.options;
  if (!opts) return undefined;
  if (Array.isArray(opts)) {
    const idx = /^[a-z]$/i.test(key) ? key.toLowerCase().charCodeAt(0) - 97 : Number(key);
    const v = Number.isInteger(idx) ? opts[idx] : undefined;
    return v != null ? String(v) : undefined;
  }
  const v = opts[key] ?? opts[key.toLowerCase()] ?? opts[key.toUpperCase()];
  return v != null ? String(v) : undefined;
}

/** A stored exam answer as a sentence: MCQ letter + text, scaffold/proof JSON flattened. */
export function examAnswerText(q: any, answer: unknown): string {
  if (answer == null) return '';
  const raw = String(answer).trim();
  if (!raw) return '';
  if (isChoiceType(q?.type) && raw.length <= 3) {
    const t = optionText(q, raw);
    return t ? `${raw.toUpperCase()}) ${t}` : raw;
  }
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p?.scaffold)) return p.scaffold.filter((v: unknown) => typeof v === 'string' && v.trim()).join(' ; ');
      if (Array.isArray(p?.steps)) {
        return [...p.steps.map((s: any) => s?.math).filter(Boolean), p.finalAnswer].filter(Boolean).join(' ; ');
      }
      if (Array.isArray(p)) {
        return p.map((r: any) => r?.math ?? `${r?.operator ?? ''} ${r?.value ?? ''}`.trim()).filter(Boolean).join(' ; ');
      }
      if (p && typeof p === 'object') {
        return Object.entries(p).map(([k, v]) => `${k} → ${String(v)}`).join(' ; ');
      }
    } catch { /* plain text that happens to start with a bracket */ }
  }
  return raw.replace(/\s*\|\s*/g, ' ; ');
}

/** The authored key as text: MCQ letter + option, else correct / final_answer / parts / model answer. */
export function examExpectedText(q: any): string {
  const correct = q?.correct;
  if (typeof correct === 'string' && correct.trim()) {
    const c = correct.trim();
    if (isChoiceType(q?.type) && c.length <= 3) {
      const t = optionText(q, c);
      if (t) return `${c.toUpperCase()}) ${t}`;
    }
    return c;
  }
  if (correct && typeof correct === 'object') {
    return Object.entries(correct).map(([k, v]) => `${k} → ${String(v)}`).join(' ; ');
  }
  if (typeof q?.final_answer === 'string' && q.final_answer.trim()) return q.final_answer.trim();
  if (Array.isArray(q?.answer_parts) && q.answer_parts.length) {
    return q.answer_parts.map((p: any) => [p?.label, p?.answer].filter(Boolean).join(' : ')).filter(Boolean).join(' ; ');
  }
  return typeof q?.model_answer === 'string' ? q.model_answer.trim() : '';
}

/** The Explique-moi context for one exam results row. */
export function examQuestionContext(args: {
  question: any;
  answer: unknown;
  status: string;
  subject?: string;
  level?: string;
  examId?: string;
  /** Position in flattenQuestions(exam): the id the server verifies against. */
  questionIndex?: number;
}): QuestionContext | undefined {
  const q = args.question;
  return sanitizeQuestionContext({
    surface: 'exam_results',
    question: String(q?._displayText || q?.question || ''),
    studentAnswer: examAnswerText(q, args.answer),
    expectedAnswer: examExpectedText(q),
    explanation: typeof q?.explanation === 'string' ? q.explanation : undefined,
    subject: args.subject,
    level: args.level,
    questionType: typeof q?.type === 'string' ? q.type : undefined,
    status: args.status,
    examId: args.examId,
    questionId: typeof q?.id === 'string'
      ? q.id
      : Number.isInteger(args.questionIndex) && (args.questionIndex as number) >= 0 ? String(args.questionIndex) : undefined,
  });
}
