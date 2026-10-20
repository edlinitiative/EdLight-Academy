/**
 * shared/essayRegrade.ts — AI grading of free-response exam items AFTER the
 * paper is submitted, and the "Corriger maintenant" retry, for web and mobile.
 *
 * The flow never blocks a submission on the grader:
 *
 *   1. submit stores the paper with every gradable essay as `ungraded`
 *      (excluded from the percentage, labelled "Correction provisoire");
 *   2. `runEssayGrading` reads the stored result, calls /api/grade-essay for
 *      each item that still needs it (bounded concurrency, per-call timeout),
 *      then applies every grade it got in ONE transaction;
 *   3. the transaction re-reads the document and only touches items that are
 *      STILL ungraded on the SAME attempt, so a double tap, a second device or
 *      a retake in between can never grade twice or overwrite a newer paper.
 *
 * Nothing here awards XP, writes mastery or schedules review: those happen
 * once, at submit. A regrade only rewrites the result document's per-item
 * verdicts and its summary. That is the "no double count" guarantee, and the
 * tests hold it to that.
 *
 * Pure apart from the injected deps (`gradeOne`, `readResult`, `commit`), so
 * both platforms share the logic and the tests use fakes.
 */
import { gradeExam, gradeSingleQuestion, hasOnlyPlaceholderKey } from './examUtils';
import {
  classifyEssayResponse,
  ESSAY_GRADE_CONCURRENCY,
  isEssayType,
  leanEssayFeedback,
  stripUndefined,
} from './essayGradeCore';

// ── Which items need the grader ─────────────────────────────────────────────

/** Plain text the grader can read (not a scaffold/proof/condition JSON payload). */
function isPlainTextAnswer(answer: unknown): answer is string {
  if (typeof answer !== 'string' || !answer.trim()) return false;
  const t = answer.trim();
  if ((t.startsWith('{') || t.startsWith('[')) && /"(scaffold|steps|finalAnswer|operator)"/.test(t)) return false;
  return true;
}

/** The teacher reference the web has always sent as `modelAnswer`. */
export function essayModelReference(q: any): string {
  let modelRef = String(q?.model_answer || (typeof q?.correct === 'string' ? q.correct : '') || '');
  if (Array.isArray(q?.answer_parts) && q.answer_parts.length > 0) {
    const partsText = q.answer_parts.map((p: any) =>
      `${p?.label ?? ''}: ${p?.answer ?? ''}${Array.isArray(p?.alternatives) && p.alternatives.length ? ' (also acceptable: ' + p.alternatives.join(', ') + ')' : ''}`,
    ).join('\n');
    modelRef = modelRef ? `${modelRef}\n\nKey expected points:\n${partsText}` : partsText;
  }
  return modelRef;
}

/**
 * Can this item go to /api/grade-essay at all? Essays always can (the
 * endpoint grades structure and language even without a key, and applies the
 * dissertation rubric for French and philosophy). A short answer needs a
 * reference to be judged against. A placeholder key ("Texte manquant") stays
 * in manual review, exactly as the local grader decides.
 */
export function isAiGradable(q: any, answer: unknown): boolean {
  if (!isEssayType(q) || !isPlainTextAnswer(answer)) return false;
  if (hasOnlyPlaceholderKey(q)) return false;
  if (q.type === 'short_answer' && !essayModelReference(q)) return false;
  return true;
}

/**
 * Does the stored verdict for this item still need the AI grader?
 *
 *   ungraded                      → yes (a failed or pending call)
 *   manual                        → yes (old mobile papers: never sent)
 *   incorrect, no AI feedback     → yes for an ESSAY: the local grader text-
 *                                   matched a whole composition against
 *                                   `final_answer`, which is not a grade
 *   incorrect, failed AI feedback → yes (old web papers: 'N/A' read as 0)
 *   anything the grader decided   → no
 */
export function needsEssayGrade(q: any, answer: unknown, entry: any): boolean {
  if (!isAiGradable(q, answer)) return false;
  const status = entry?.status;
  const fb = entry?.essayFeedback;
  if (status === 'ungraded' || status === 'manual') return true;
  if (status === 'incorrect') {
    if (fb) return classifyEssayResponse(fb) === 'failed';
    return q.type === 'essay';
  }
  return false;
}

// ── Request body (the same on both platforms) ───────────────────────────────

export interface EssayGradeBody {
  question: string;
  answer: string;
  modelAnswer?: string;
  context?: string;
  answerParts?: Array<{ label?: string; answer?: string; alternatives?: string[] }>;
  type: 'essay' | 'short_answer';
  subject?: string;
  level?: string;
}

export function buildEssayGradeBody(q: any, answer: string, ctx: { subject?: string; level?: string } = {}): EssayGradeBody {
  const parts = Array.isArray(q?.answer_parts)
    ? q.answer_parts.slice(0, 30).map((p: any) => stripUndefined({
      label: typeof p?.label === 'string' ? p.label : undefined,
      answer: typeof p?.answer === 'string' ? p.answer : undefined,
      alternatives: Array.isArray(p?.alternatives) ? p.alternatives.filter((a: unknown) => typeof a === 'string') : undefined,
    }))
    : undefined;
  const modelAnswer = essayModelReference(q);
  return stripUndefined({
    question: String(q?._displayText || q?.question || ''),
    context: String(q?.sectionInstructions || ''),
    answer,
    modelAnswer: modelAnswer || undefined,
    answerParts: parts && parts.length ? parts : undefined,
    type: q?.type === 'short_answer' ? 'short_answer' : 'essay',
    subject: ctx.subject || undefined,
    level: ctx.level || undefined,
  });
}

// ── At submit: mark what is waiting for the grader ──────────────────────────

/** Indices of the items the grader should see, given the local verdicts. */
export function pendingEssayIndices(questions: any[], answers: Record<string | number, unknown>, results: any[]): number[] {
  const out: number[] = [];
  questions.forEach((q, i) => {
    if (needsEssayGrade(q, answers?.[i], results?.[i])) out.push(i);
  });
  return out;
}

/** The pre-graded entry that keeps an item out of the score until it is graded. */
export function ungradedEntry(q: any, answer: unknown) {
  return { question: q, userAnswer: answer, status: 'ungraded', result: { awarded: 0, maxPoints: q?.points || 1 } };
}

/**
 * Grade a paper locally, with every AI-gradable essay held as `ungraded`.
 * Mobile submit uses this instead of `gradeExam(questions, answers, {})`,
 * which scored every essay as `manual` (0 points, counted) or text-matched it.
 */
/**
 * `preGraded`: results already decided during the paper — the "Résultat
 * immédiat" mode grades and locks each answer as it is checked. They are kept
 * as-is and never sent to the grader again.
 */
export function gradeExamPendingEssays(
  questions: any[],
  answers: Record<string | number, unknown>,
  options: Record<string, any> = {},
  preGraded: Record<number, any> = {},
) {
  const local = gradeExam(questions, answers, preGraded, options);
  const pending = pendingEssayIndices(questions, answers, local.results).filter((i) => !preGraded[i]);
  if (pending.length === 0) return { ...local, pending };
  const pre: Record<number, any> = { ...preGraded };
  for (const i of pending) pre[i] = ungradedEntry(questions[i], answers[i]);
  return { ...gradeExam(questions, answers, pre, options), pending };
}

// ── Applying grades to the stored result (pure; used inside the transaction) ─

/** The attempt a result document belongs to. A retake rewrites it. */
export function attemptStamp(doc: any): number | null {
  const v = doc?.created_at_ms ?? doc?.submitted_at_ms;
  return typeof v === 'number' ? v : null;
}

/** The per-item verdict as stored, whichever document shape this is. */
export function storedEntry(doc: any, i: number): any {
  if (Array.isArray(doc?.results)) return doc.results[i] ?? null;
  return doc?.preGradedResults?.[i] ?? doc?.preGradedResults?.[String(i)] ?? null;
}

/** Items in a stored result that still need the grader. */
export function essayJobsFromDoc(questions: any[], doc: any): number[] {
  const answers = doc?.answers || {};
  const out: number[] = [];
  questions.forEach((q, i) => {
    const entry = storedEntry(doc, i);
    if (Array.isArray(doc?.results) || entry) {
      if (needsEssayGrade(q, answers[i], entry)) out.push(i);
      return;
    }
    // Web shape with no pre-graded entry: what the local grader would say.
    if (needsEssayGrade(q, answers[i], gradeSingleQuestion(q, answers[i], null))) out.push(i);
  });
  return out;
}

export interface ApplyContext {
  subject?: string;
  track?: string;
  attemptStamp: number | null;
  now?: number;
}

export type ApplyResult =
  | { kind: 'stale' }
  | { kind: 'unchanged' }
  | { kind: 'patch'; patch: Record<string, unknown>; applied: number[] };

const leanEntry = (r: any) => stripUndefined({
  status: r?.status,
  awarded: r?.result?.awarded ?? 0,
  maxPoints: r?.result?.maxPoints ?? 0,
  essayFeedback: r?.essayFeedback ? leanEssayFeedback(r.essayFeedback) : undefined,
});

/**
 * Fold grader responses into a stored result. Returns the fields to update,
 * or 'stale' when the document now belongs to another attempt, or
 * 'unchanged' when every item was already graded (by another tap/device).
 *
 * Mobile documents carry `results: [{status, awarded, maxPoints}]`; web
 * documents carry `preGradedResults: {i: {status, result, essayFeedback}}`.
 * Both are re-summarised with the SAME `gradeExam`, so the stored percentage
 * is exactly what a fresh grade of the paper would say.
 */
export function applyEssayGrades(questions: any[], doc: any, grades: Record<number, unknown>, ctx: ApplyContext): ApplyResult {
  if (!doc || attemptStamp(doc) !== ctx.attemptStamp) return { kind: 'stale' };
  const answers = doc.answers || {};
  const mobileShape = Array.isArray(doc.results);
  const opts = { subject: ctx.subject, track: ctx.track };

  const pre: Record<number, any> = {};
  if (mobileShape) {
    (doc.results as any[]).forEach((r, i) => {
      if (i >= questions.length || !r) return;
      pre[i] = { question: questions[i], userAnswer: answers[i] ?? null, status: r.status, result: { awarded: r.awarded ?? 0, maxPoints: r.maxPoints ?? (questions[i]?.points || 1) }, essayFeedback: r.essayFeedback };
    });
  } else {
    for (const [k, v] of Object.entries(doc.preGradedResults || {})) {
      const i = Number(k);
      if (Number.isInteger(i) && i < questions.length && v) pre[i] = { ...(v as any), question: questions[i], userAnswer: answers[i] ?? null };
    }
  }

  const applied: number[] = [];
  for (const [k, resp] of Object.entries(grades)) {
    const i = Number(k);
    const q = questions[i];
    if (!q) continue;
    const current = mobileShape || pre[i] ? pre[i] ?? null : gradeSingleQuestion(q, answers[i], null);
    if (!needsEssayGrade(q, answers[i], current)) continue; // already graded: idempotent
    if (classifyEssayResponse(resp) === 'failed') continue; // never replace one non-grade with another
    pre[i] = gradeSingleQuestion(q, answers[i], resp, { subject: ctx.subject });
    applied.push(i);
  }
  if (applied.length === 0) return { kind: 'unchanged' };

  const fresh = gradeExam(questions, answers, pre, opts);
  const patch: Record<string, unknown> = {
    summary: stripUndefined(fresh.summary),
    essay_graded_at_ms: ctx.now ?? Date.now(),
  };
  if (mobileShape) {
    patch.results = fresh.results.map(leanEntry);
  } else {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(pre)) {
      const e = leanEntry(v);
      out[k] = stripUndefined({ status: e.status, result: { awarded: e.awarded, maxPoints: e.maxPoints }, essayFeedback: e.essayFeedback });
    }
    patch.preGradedResults = out;
  }
  return { kind: 'patch', patch, applied };
}

// ── The run (I/O injected) ──────────────────────────────────────────────────

export type GradeOneError = 'rate_limit' | 'network' | 'http';

export class EssayGradeError extends Error {
  kind: GradeOneError;
  constructor(kind: GradeOneError) {
    super(`essay grade ${kind}`);
    this.kind = kind;
  }
}

export interface EssayGradingDeps {
  /** POST /api/grade-essay; resolves the parsed JSON, throws EssayGradeError. */
  gradeOne: (body: EssayGradeBody) => Promise<unknown>;
  readResult: () => Promise<any | null>;
  /**
   * Run `mutate` against the CURRENT document inside a transaction and write
   * the patch it returns (if any). Resolves to what `mutate` returned.
   */
  commit: (mutate: (current: any | null) => ApplyResult) => Promise<ApplyResult>;
}

export interface EssayGradingInput {
  questions: any[];
  subject?: string;
  level?: string;
  concurrency?: number;
  now?: () => number;
}

export type EssayGradingOutcome =
  | { status: 'nothing' }
  | { status: 'missing' }
  | { status: 'stale' }
  | { status: 'graded'; graded: number; failed: number; rateLimited: boolean }
  | { status: 'failed'; failed: number; rateLimited: boolean; offline: boolean };

async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return out;
}

export async function runEssayGrading(deps: EssayGradingDeps, input: EssayGradingInput): Promise<EssayGradingOutcome> {
  const { questions } = input;
  const doc = await deps.readResult();
  if (!doc) return { status: 'missing' };
  const jobs = essayJobsFromDoc(questions, doc);
  if (jobs.length === 0) return { status: 'nothing' };

  const stamp = attemptStamp(doc);
  const answers = doc.answers || {};
  let failed = 0;
  let rateLimited = false;
  let offline = 0;
  const grades: Record<number, unknown> = {};
  await mapLimit(jobs, input.concurrency ?? ESSAY_GRADE_CONCURRENCY, async (i) => {
    try {
      const resp = await deps.gradeOne(buildEssayGradeBody(questions[i], String(answers[i]), { subject: input.subject, level: input.level }));
      if (classifyEssayResponse(resp) === 'failed') { failed++; return; }
      grades[i] = resp;
    } catch (e) {
      failed++;
      if (e instanceof EssayGradeError && e.kind === 'rate_limit') rateLimited = true;
      if (!(e instanceof EssayGradeError) || e.kind === 'network') offline++;
    }
  });

  if (Object.keys(grades).length === 0) {
    return { status: 'failed', failed, rateLimited, offline: offline > 0 && offline === failed };
  }

  const track = doc.track || doc.summary?.track || undefined;
  const result = await deps.commit((current) => applyEssayGrades(questions, current, grades, {
    subject: input.subject, track, attemptStamp: stamp, now: input.now?.(),
  }));
  if (result.kind === 'stale') return { status: 'stale' };
  const graded = result.kind === 'patch' ? result.applied.length : 0;
  return { status: 'graded', graded, failed, rateLimited };
}

// ── One run per paper at a time ─────────────────────────────────────────────

/**
 * Deduplicates concurrent runs per key ("uid:examId"): a second tap, or the
 * results screen asking while the post-submit run is still going, joins the
 * same promise instead of calling the grader twice. Listeners let a screen
 * show "Correction en cours" for a run another screen started.
 */
export function createEssayGradingRegistry() {
  const running = new Map<string, Promise<EssayGradingOutcome>>();
  const last = new Map<string, EssayGradingOutcome>();
  const listeners = new Set<(key: string) => void>();
  const emit = (key: string) => listeners.forEach((l) => { try { l(key); } catch { /* a listener never breaks a run */ } });

  return {
    run(key: string, start: () => Promise<EssayGradingOutcome>): Promise<EssayGradingOutcome> {
      const existing = running.get(key);
      if (existing) return existing;
      const p = start()
        .catch((): EssayGradingOutcome => ({ status: 'failed', failed: 0, rateLimited: false, offline: false }))
        .then((outcome) => {
          running.delete(key);
          last.set(key, outcome);
          emit(key);
          return outcome;
        });
      running.set(key, p);
      emit(key);
      return p;
    },
    isRunning: (key: string) => running.has(key),
    lastOutcome: (key: string) => last.get(key) ?? null,
    subscribe(listener: (key: string) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
