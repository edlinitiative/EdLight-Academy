/**
 * api/_lib/explainGate.ts — the server's decision on an "Explique-moi" request.
 * ───────────────────────────────────────────────────────────────────────────
 * The client sends a structured `questionContext` (shared/explainContext.ts):
 * the question, the student's answer, the key, the explanation, ids. Every
 * field of it is client-asserted. Taken at face value it lifted Sandra's
 * never-reveal-the-answer rule ("cette question a déjà été corrigée") and put
 * the client's `expectedAnswer` in the retrieval query, so a student could
 * paste a LIVE arena / tournament / duel question, or a question from an exam
 * still in progress, and receive a worked answer.
 *
 * The rule now: the exception is granted only when the server itself can
 * verify that the question is already corrected FOR THIS UID, and then the
 * question, key and explanation come from the server's own copy, never from
 * the request.
 *
 *   exam question   examId + questionId (flattened index, or the question's own
 *                   id) → users/{uid}/examResults/{examId} must exist and the
 *                   attempt must not be an in-progress (re)take; the question is
 *                   read from the published per-exam file /exams/{examId}.json.
 *   bank question   questionId = a quiz-bank doc id → quizzes/{id} (open
 *                   practice: allowed, but built from the Firestore row).
 *   anything else   no verifiable ids, an id that resolves to nothing, a
 *                   numeric legacy exam route, arena / tournament / duel /
 *                   trivia ids: ordinary hint-only tutoring.
 *
 * And regardless of the above: while the caller has a competition round open
 * (a user tournament they joined that has started and not finished, or an
 * Arena championship in `doors`/`live` they are registered in), the request is
 * downgraded to tutoring. Every failure to verify (read error, fetch error)
 * also downgrades: this gate fails closed.
 *
 * In tutoring mode Sandra still sees the question text (so "explain this"
 * makes sense) and the student's own answer, but never the client's key or
 * explanation, and retrieval searches on the question text only. KB chunks
 * that come back for it keep the graded-material warning.
 */
import { examAnswerText, examExpectedText, sanitizeQuestionContext, type QuestionContext } from '../../shared/explainContext';
import { flattenQuestions } from '../../shared/examUtils';
import { resolveCorrectIndex } from '../../shared/quizKey';
import { isPlaceholderKey } from '../../shared/question/compile';

/** The minimal Firestore surface this gate reads (Admin SDK, or the test fake). */
type DocSnap = { exists: boolean; data(): Record<string, any> | undefined };
type QuerySnap = { docs: Array<DocSnap & { id: string }> };
type Query = {
  where(field: string, op: any, value: any): Query;
  orderBy(field: string, dir?: 'asc' | 'desc'): Query;
  limit(n: number): Query;
  get(): Promise<QuerySnap>;
};
export interface GateDb {
  doc(path: string): { get(): Promise<DocSnap> };
  collection(path: string): Query;
}

export interface GateDeps {
  db: GateDb;
  /** The published exam JSON for an exam_id, or null. */
  fetchExam: (examId: string) => Promise<any | null>;
  now?: number;
}

/** What a downgraded request still shows Sandra: the question and the student's own answer. */
export interface TutorQuestion {
  question: string;
  studentAnswer?: string;
  subject?: string;
  level?: string;
}

export type GateReason =
  | 'verified_exam'
  | 'verified_bank'
  | 'competition_live'
  | 'unverifiable'
  | 'exam_not_submitted'
  | 'question_not_found'
  | 'error';

/**
 * Which canonical question a VERIFIED request is about, for the reviewed
 * explanation cache (api/_lib/explanationCache.ts). Exam questions are keyed
 * by their flattened index (the same index on web and app), bank questions by
 * the quiz doc id. Never present on a downgraded request.
 */
export interface CacheRef {
  source: 'exam' | 'bank';
  /** Stable per question: `${examId}-${index}` or the bank doc id. */
  id: string;
  examId?: string;
  questionIndex?: number;
}

export interface GateResult {
  /** Present only when verified: the SERVER-built context that lifts the rule. */
  explain?: QuestionContext;
  /** Present only when verified: the question's identity for the explanation cache. */
  cacheRef?: CacheRef;
  /** Present when downgraded: hint-only tutoring about this question. */
  tutor?: TutorQuestion;
  /** What the KB is searched with. Never contains a client-supplied key. */
  retrievalQuery: string;
  verified: boolean;
  reason: GateReason;
}

/** A tournament counts as live from this long before its start… */
const LEAD_MS = 15 * 60 * 1000;
/** …until this long after its scheduled end, in case a lazy tick lags. */
const GRACE_MS = 15 * 60 * 1000;
const ARENA_LIVE_STATES = ['doors', 'live'];
const EXAM_ID = /^[A-Za-z0-9_-]{1,120}$/;

// ── Competition ──────────────────────────────────────────────────────────────

/**
 * Is any competition round open for this uid right now? User tournaments are
 * found through users/{uid}/myTournaments (written on join and by the
 * competition engine for team members); the Arena through its own few
 * championship docs. Throws on read failure (the caller fails closed).
 */
export async function hasLiveCompetition(db: GateDb, uid: string, now: number): Promise<boolean> {
  const [mine, arena] = await Promise.all([
    db.collection(`users/${uid}/myTournaments`)
      .where('startsAt', '<=', now + LEAD_MS)
      .orderBy('startsAt', 'desc')
      .limit(25)
      .get(),
    db.collection('tournaments').where('state', 'in', ARENA_LIVE_STATES).limit(10).get(),
  ]);

  const tournamentChecks = mine.docs.map(async (d) => {
    const tid = String(d.data()?.tid || d.id);
    const snap = await db.doc(`userTournaments/${tid}`).get();
    if (!snap.exists) return false;
    const t = snap.data() || {};
    if (t.state === 'finished' || t.state === 'cancelled') return false;
    const endsAt = Number(t.schedule?.endsAt ?? t.endsAt);
    return !Number.isFinite(endsAt) || now <= endsAt + GRACE_MS;
  });
  const arenaChecks = arena.docs.map(async (d) => (await db.doc(`tournaments/${d.id}/players/${uid}`).get()).exists);

  const flags = await Promise.all([...tournamentChecks, ...arenaChecks]);
  return flags.some(Boolean);
}

// ── Exam ─────────────────────────────────────────────────────────────────────

function findExamQuestion(exam: any, questionId: string): { q: any; index: number } | null {
  const flat = flattenQuestions(exam);
  if (/^\d{1,4}$/.test(questionId)) {
    const index = parseInt(questionId, 10);
    return flat[index] ? { q: flat[index], index } : null;
  }
  const index = flat.findIndex((q: any) => q?.id === questionId);
  return index >= 0 ? { q: flat[index], index } : null;
}

function storedAnswer(answers: unknown, index: number): unknown {
  if (!answers || typeof answers !== 'object') return undefined;
  const a = (answers as Record<string, unknown>)[String(index)];
  return a && typeof a === 'object' && 'given' in (a as object) ? (a as { given: unknown }).given : a;
}

type Verdict = { explain?: QuestionContext; cacheRef?: CacheRef; reason: GateReason };

async function verifyExam(ctx: QuestionContext, uid: string, deps: GateDeps): Promise<Verdict> {
  const examId = ctx.examId as string;
  const questionId = ctx.questionId as string;
  // A legacy numeric route is keyed by catalog position, which web and app do
  // not resolve the same way: not verifiable.
  if (!EXAM_ID.test(examId) || /^\d+$/.test(examId)) return { reason: 'unverifiable' };

  const [resultSnap, attemptSnap] = await Promise.all([
    deps.db.doc(`users/${uid}/examResults/${examId}`).get(),
    deps.db.doc(`users/${uid}/examAttempts/${examId}`).get(),
  ]);
  if (!resultSnap.exists) return { reason: 'exam_not_submitted' };
  // A retake in progress keeps the previous result doc: the paper on screen
  // is live again, so the question is not "already corrected" any more.
  const attempt = attemptSnap.exists ? attemptSnap.data() || {} : null;
  if (attempt && attempt.status !== 'submitted') return { reason: 'exam_not_submitted' };

  const exam = await deps.fetchExam(examId);
  if (!exam || exam.exam_id !== examId) return { reason: 'question_not_found' };
  const found = findExamQuestion(exam, questionId);
  if (!found) return { reason: 'question_not_found' };

  const result = resultSnap.data() || {};
  const answer = storedAnswer(result.answers, found.index);
  const explain = sanitizeQuestionContext({
    surface: 'exam_results',
    question: String(found.q._displayText || found.q.question || ''),
    studentAnswer: answer != null ? examAnswerText(found.q, answer) : ctx.studentAnswer,
    expectedAnswer: examExpectedText(found.q),
    explanation: typeof found.q.explanation === 'string' ? found.q.explanation : undefined,
    subject: ctx.subject,
    level: ctx.level,
    questionType: typeof found.q.type === 'string' ? found.q.type : undefined,
    status: ctx.status,
    examId,
    questionId,
  });
  return explain
    ? { explain, reason: 'verified_exam', cacheRef: { source: 'exam', id: `${examId}-${found.index}`, examId, questionIndex: found.index } }
    : { reason: 'question_not_found' };
}

// ── Quiz bank ────────────────────────────────────────────────────────────────

const pick = (row: Record<string, any>, keys: string[]): string => {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
};

function bankOptions(row: Record<string, any>): string[] {
  const raw = row.options ?? row.choices;
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.map(String);
    } catch { /* fall through to option_a… */ }
  }
  const out: string[] = [];
  for (const group of [['option_a', 'optionA', 'A'], ['option_b', 'optionB', 'B'], ['option_c', 'optionC', 'C'], ['option_d', 'optionD', 'D']]) {
    const v = pick(row, group);
    if (v) out.push(v);
  }
  return out;
}

/** The key as text, read the way the clients grade it (shared/quizKey). */
export function bankExpectedText(row: Record<string, any>): string | undefined {
  const raw = pick(row, ['correct_option', 'correctOption', 'answer', 'correct', 'key', 'correct_answer']);
  if (!raw) return undefined;
  const options = bankOptions(row);
  if (options.length >= 2) {
    const i = resolveCorrectIndex(raw, options);
    if (i >= 0) return options[i];
  }
  return isPlaceholderKey(raw) ? undefined : raw;
}

async function verifyBank(ctx: QuestionContext, deps: GateDeps): Promise<Verdict> {
  const snap = await deps.db.doc(`quizzes/${ctx.questionId}`).get();
  if (!snap.exists) return { reason: 'question_not_found' };
  const row = snap.data() || {};
  const question = pick(row, ['question', 'question_text', 'prompt', 'stem']);
  const explain = sanitizeQuestionContext({
    surface: ctx.surface,
    question,
    studentAnswer: ctx.studentAnswer,
    expectedAnswer: bankExpectedText(row),
    explanation: pick(row, ['explanation', 'good_response']) || undefined,
    subject: pick(row, ['subject_code', 'course_code']) || ctx.subject,
    level: ctx.level,
    questionType: ctx.questionType,
    status: ctx.status,
    questionId: ctx.questionId,
  });
  return explain
    ? { explain, reason: 'verified_bank', cacheRef: { source: 'bank', id: String(ctx.questionId) } }
    : { reason: 'question_not_found' };
}

// ── The gate ─────────────────────────────────────────────────────────────────

function downgrade(ctx: QuestionContext, reason: GateReason): GateResult {
  const tutor: TutorQuestion = { question: ctx.question };
  if (ctx.studentAnswer) tutor.studentAnswer = ctx.studentAnswer;
  if (ctx.subject) tutor.subject = ctx.subject;
  if (ctx.level) tutor.level = ctx.level;
  // The question text only: a client "expectedAnswer" never reaches retrieval.
  return { tutor, retrievalQuery: ctx.question, verified: false, reason };
}

export async function gateQuestionContext(ctx: QuestionContext, uid: string, deps: GateDeps): Promise<GateResult> {
  const now = deps.now ?? Date.now();
  try {
    const verification: Promise<Verdict> = ctx.examId
      ? (ctx.questionId ? verifyExam(ctx, uid, deps) : Promise.resolve({ reason: 'unverifiable' as const }))
      : ctx.questionId && ctx.surface !== 'exam_results'
        ? verifyBank(ctx, deps)
        : Promise.resolve({ reason: 'unverifiable' as const });
    const [live, verdict] = await Promise.all([hasLiveCompetition(deps.db, uid, now), verification]);
    if (live) return downgrade(ctx, 'competition_live');
    if (!verdict.explain) return downgrade(ctx, verdict.reason);
    const e = verdict.explain;
    return {
      explain: e,
      ...(verdict.cacheRef ? { cacheRef: verdict.cacheRef } : {}),
      retrievalQuery: [e.question, e.expectedAnswer].filter(Boolean).join('\n'),
      verified: true,
      reason: verdict.reason,
    };
  } catch (error) {
    console.warn('explainGate: verification failed, tutoring only:', error instanceof Error ? error.message : error);
    return downgrade(ctx, 'error');
  }
}

/** Production exam reader: the published per-exam file, bounded in time, briefly cached. */
const examCache = new Map<string, { at: number; exam: any | null }>();
const EXAM_CACHE_MS = 10 * 60 * 1000;

export function examFetcher(origin: string): (examId: string) => Promise<any | null> {
  return async (examId) => {
    const hit = examCache.get(examId);
    if (hit && Date.now() - hit.at < EXAM_CACHE_MS) return hit.exam;
    const res = await fetch(`${origin}/exams/${encodeURIComponent(examId)}.json`, { signal: AbortSignal.timeout(5000) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`exam fetch ${res.status}`);
    const exam = await res.json();
    if (examCache.size > 50) examCache.delete(examCache.keys().next().value as string);
    examCache.set(examId, { at: Date.now(), exam });
    return exam;
  };
}
