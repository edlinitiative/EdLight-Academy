/**
 * api/_lib/explanationCache.ts — reviewed "Explique-moi" explanations
 * (larger-product-additions doc, item 1, later stage).
 * ───────────────────────────────────────────────────────────────────────────
 * One document per question × language: `explanations/{source}_{id}_{lang}`.
 *
 *   pending    the first canonical worked explanation the LLM wrote for this
 *              question (buildCanonicalExplainPrompt: the server's copy of the
 *              question, key and authored explanation; never a student's
 *              answer). Students keep getting a fresh, personal reply.
 *   approved   an admin read it (possibly edited it) and approved it. It is
 *              then served as Sandra's first reply with NO LLM call, and the
 *              conversation continues normally from it.
 *   rejected   kept so the same bad text is not regenerated; students get a
 *              fresh reply as today.
 *
 * Only a request explainGate VERIFIED (exam question after a submitted
 * attempt, or a quiz-bank question, and no live competition for the caller)
 * ever reads or writes here: the gate's `cacheRef` exists only then. A
 * hint-only, unverifiable or downgraded request never touches this module.
 *
 * Student feedback ("Utile" / "Pas utile") is two counters on the doc. The
 * once-per-day dedupe is `explanationVotes/{hash}` where the hash is
 * sha256(secret | uid | explanation | UTC day): the doc holds no uid, cannot
 * be listed per student, and carries `expiresAt` for a Firestore TTL policy.
 * Nothing here is linked to an account, so nothing survives account deletion
 * as personal data.
 *
 * Both collections are server-only (firestore.rules deny block).
 */
import { createHash } from 'crypto';
import type { CacheRef } from './explainGate';
import type { QuestionContext } from '../../shared/explainContext';

export const EXPLANATIONS = 'explanations';
export const EXPLANATION_VOTES = 'explanationVotes';
export const EXPLANATION_MAX_CHARS = 6000;
const VOTE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const HISTORY_MAX = 20;

export type ExplanationStatus = 'pending' | 'approved' | 'rejected';
export const EXPLANATION_STATUSES: ExplanationStatus[] = ['pending', 'approved', 'rejected'];

export interface ReviewEvent {
  action: 'approve' | 'edit_approve' | 'reject';
  by: string;
  byName?: string;
  at: number;
}

export interface ExplanationDoc {
  key: string;
  source: 'exam' | 'bank';
  sourceId: string;
  examId?: string;
  questionIndex?: number;
  lang: 'fr' | 'ht';
  /** The server's copy at generation time, for the reviewer. Content, not student data. */
  question: string;
  expectedAnswer?: string;
  authoredExplanation?: string;
  subject?: string;
  level?: string;
  questionType?: string;
  text: string;
  /** Present once an admin edited the text: what the model wrote. */
  originalText?: string;
  model: string;
  createdAt: number;
  status: ExplanationStatus;
  reviewedBy: string | null;
  reviewedByName?: string | null;
  reviewedAt: number | null;
  reviewHistory?: ReviewEvent[];
  /** Verified explain requests for this question × language (any status). */
  uses: number;
  /** Of those, how many were answered from the approved text. */
  served: number;
  helpful: number;
  notHelpful: number;
  lastUsedAt?: number;
}

/** The minimal Firestore surface used here (Admin SDK, or the test FakeDb). */
type Snap = { exists: boolean; id?: string; data(): Record<string, any> | undefined };
type Ref = {
  get(): Promise<Snap>;
  create(data: Record<string, any>): Promise<unknown>;
};
type Q = {
  where(field: string, op: any, value: any): Q;
  orderBy(field: string, dir?: 'asc' | 'desc'): Q;
  limit(n: number): Q;
  get(): Promise<{ docs: Array<Snap & { id: string }> }>;
};
type Tx = {
  get(ref: any): Promise<Snap>;
  set(ref: any, data: Record<string, any>, opts?: { merge?: boolean }): void;
  update(ref: any, data: Record<string, any>): void;
  create(ref: any, data: Record<string, any>): void;
};
export interface CacheDb {
  doc(path: string): Ref;
  collection(path: string): Q;
  runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}

const SAFE = /[^A-Za-z0-9_-]/g;

/** `explanations/{source}_{id}_{lang}`: one doc per question × language. */
export function explanationKey(ref: CacheRef, lang: 'fr' | 'ht'): string {
  return `${ref.source}_${ref.id.replace(SAFE, '_').slice(0, 300)}_${lang}`;
}

const KEY_RE = /^(exam|bank)_[A-Za-z0-9_-]{1,300}_(fr|ht)$/;
export const isExplanationKey = (v: unknown): v is string => typeof v === 'string' && KEY_RE.test(v);

export async function getExplanation(db: CacheDb, key: string): Promise<ExplanationDoc | null> {
  const snap = await db.doc(`${EXPLANATIONS}/${key}`).get();
  return snap.exists ? (snap.data() as ExplanationDoc) : null;
}

/** Count one verified request; `served` when the approved text answered it. Never throws. */
export async function recordExplanationUse(db: CacheDb, key: string, served: boolean, now = Date.now()): Promise<void> {
  try {
    const ref = db.doc(`${EXPLANATIONS}/${key}`);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const d = snap.data() || {};
      tx.update(ref, {
        uses: (Number(d.uses) || 0) + 1,
        served: (Number(d.served) || 0) + (served ? 1 : 0),
        lastUsedAt: now,
      });
    });
  } catch (error) {
    console.warn('explanationCache: use not recorded:', error instanceof Error ? error.message : error);
  }
}

/**
 * Store the first canonical explanation as a pending candidate. First write
 * wins (`create`): a concurrent second candidate is dropped, and an existing
 * approved or rejected doc is never overwritten. Returns whether it stored.
 */
export async function storeCandidate(
  db: CacheDb,
  args: { key: string; ref: CacheRef; lang: 'fr' | 'ht'; explain: QuestionContext; text: string; model: string; now?: number },
): Promise<boolean> {
  const { key, ref, lang, explain, text, model } = args;
  const body = text.trim().slice(0, EXPLANATION_MAX_CHARS);
  if (!body) return false;
  const now = args.now ?? Date.now();
  const doc: Record<string, any> = {
    key,
    source: ref.source,
    sourceId: ref.id,
    lang,
    question: explain.question,
    text: body,
    model: String(model || '').slice(0, 120),
    createdAt: now,
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    uses: 1,
    served: 0,
    helpful: 0,
    notHelpful: 0,
    lastUsedAt: now,
  };
  if (ref.examId) doc.examId = ref.examId;
  if (Number.isInteger(ref.questionIndex)) doc.questionIndex = ref.questionIndex;
  if (explain.expectedAnswer) doc.expectedAnswer = explain.expectedAnswer;
  if (explain.explanation) doc.authoredExplanation = explain.explanation;
  if (explain.subject) doc.subject = explain.subject;
  if (explain.level) doc.level = explain.level;
  if (explain.questionType) doc.questionType = explain.questionType;
  try {
    await db.doc(`${EXPLANATIONS}/${key}`).create(doc);
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!/ALREADY_EXISTS|already exists/i.test(msg) && (error as { code?: unknown })?.code !== 6) {
      console.warn('explanationCache: candidate not stored:', msg);
    }
    return false;
  }
}

// ── Student feedback ────────────────────────────────────────────────────────

export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** The dedupe id: no uid in the clear, different every day and per explanation. */
export function voteId(secret: string, uid: string, key: string, day: string): string {
  return createHash('sha256').update(`${secret}|${uid}|${key}|${day}`).digest('hex').slice(0, 40);
}

export type VoteOutcome = 'counted' | 'duplicate' | 'not_found' | 'not_approved';

export async function castVote(
  db: CacheDb,
  args: { key: string; uid: string; helpful: boolean; secret: string; now?: number },
): Promise<VoteOutcome> {
  const now = args.now ?? Date.now();
  const day = utcDay(now);
  const expRef = db.doc(`${EXPLANATIONS}/${args.key}`);
  const voteRef = db.doc(`${EXPLANATION_VOTES}/${voteId(args.secret, args.uid, args.key, day)}`);
  return db.runTransaction(async (tx) => {
    const [exp, vote] = [await tx.get(expRef), await tx.get(voteRef)];
    if (!exp.exists) return 'not_found';
    const d = exp.data() || {};
    if (d.status !== 'approved') return 'not_approved';
    if (vote.exists) return 'duplicate';
    tx.create(voteRef, { day, expiresAt: new Date(now + VOTE_TTL_MS) });
    const field = args.helpful ? 'helpful' : 'notHelpful';
    tx.update(expRef, { [field]: (Number(d[field]) || 0) + 1 });
    return 'counted';
  });
}

// ── Admin review ────────────────────────────────────────────────────────────

export interface ListFilter {
  status?: ExplanationStatus;
  lang?: 'fr' | 'ht';
  subject?: string;
  limit?: number;
}

/**
 * Candidates for the review page, most used first. Filters other than status
 * are applied in memory so no composite index is needed (the collection is
 * bounded by questions × 2 languages, and only verified traffic creates docs).
 */
export async function listExplanations(db: CacheDb, filter: ListFilter = {}): Promise<ExplanationDoc[]> {
  const limit = Math.min(Math.max(1, filter.limit ?? 100), 300);
  let q = db.collection(EXPLANATIONS);
  q = filter.status ? q.where('status', '==', filter.status).limit(1000) : q.orderBy('uses', 'desc').limit(1000);
  const snap = await q.get();
  const fold = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const subject = filter.subject ? fold(filter.subject) : '';
  return snap.docs
    .map((d) => d.data() as ExplanationDoc)
    .filter((d) => !!d && (!filter.lang || d.lang === filter.lang) && (!subject || fold(d.subject).includes(subject)))
    .sort((a, b) => (b.uses || 0) - (a.uses || 0) || (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, limit);
}

export type ReviewAction = 'approve' | 'reject';
export type ReviewOutcome = { ok: true; doc: ExplanationDoc } | { ok: false; error: 'not_found' | 'empty_text' };

export async function reviewExplanation(
  db: CacheDb,
  args: { key: string; action: ReviewAction; text?: string; reviewer: { uid: string; name?: string }; now?: number },
): Promise<ReviewOutcome> {
  const now = args.now ?? Date.now();
  const ref = db.doc(`${EXPLANATIONS}/${args.key}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, error: 'not_found' } as const;
    const d = snap.data() as ExplanationDoc;
    const patch: Record<string, any> = {
      reviewedBy: args.reviewer.uid,
      reviewedByName: args.reviewer.name ? args.reviewer.name.slice(0, 120) : null,
      reviewedAt: now,
    };
    let action: ReviewEvent['action'] = args.action === 'reject' ? 'reject' : 'approve';
    if (args.action === 'approve') {
      patch.status = 'approved';
      if (typeof args.text === 'string') {
        const text = args.text.trim().slice(0, EXPLANATION_MAX_CHARS);
        if (!text) return { ok: false, error: 'empty_text' } as const;
        if (text !== d.text) {
          patch.text = text;
          if (!d.originalText) patch.originalText = d.text;
          action = 'edit_approve';
        }
      }
    } else {
      patch.status = 'rejected';
    }
    const event: ReviewEvent = { action, by: args.reviewer.uid, at: now };
    if (args.reviewer.name) event.byName = args.reviewer.name.slice(0, 120);
    patch.reviewHistory = [...(Array.isArray(d.reviewHistory) ? d.reviewHistory : []), event].slice(-HISTORY_MAX);
    tx.update(ref, patch);
    return { ok: true, doc: { ...d, ...patch } as ExplanationDoc } as const;
  });
}
