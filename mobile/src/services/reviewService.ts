/**
 * Review Service — spaced-repetition scheduling (Adaptive Engine, Slice 2)
 * ────────────────────────────────────────────────────────────────────────
 * Persists a per-subject SM-2 schedule so the app can surface "à réviser
 * aujourd'hui". Reuses the exact SM-2 math already in production for exam
 * study-plan tasks (`computeSRS` / `scoreToQuality` in studyPlanService) — this
 * module only widens *what* gets scheduled (any graded round) and adds the read
 * path the Home card consumes.
 *
 * Storage: users/{uid}/reviewState/{key}  (key = normalized subject in v1)
 *   { key, subject, interval, ease, repetitions, nextReviewMs, lastPct, updatedAtMs }
 *
 * The immutable quizAttempts log remains the source of truth; reviewState is a
 * derived, rebuildable schedule. Writes are fire-and-forget (network-tolerant).
 *
 * Spec: docs/ADAPTIVE_ENGINE.md §5
 */
import { db, auth } from './firebase';
import { doc, getDoc, setDoc, getDocs, collection, serverTimestamp } from 'firebase/firestore';
import { computeSRS, scoreToQuality } from './studyPlanService';
import { dueReviews, type ReviewStateEntry, type ReviewItem } from './adaptiveEngine';
import useStore from '../contexts/store';
import { toReviewWire, type ReviewMap } from '../utils/review';

const DEFAULT_EASE = 2.5;

function cleanUndefined<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

/**
 * Fold a finished graded round into the review schedule for its key (subject).
 * Reads the prior SM-2 state, advances it by the score's quality, writes back.
 * No-ops when signed out. Safe to call fire-and-forget: `recordReview(...).catch(() => {})`.
 */
export async function recordReview(
  userId: string,
  key: string,
  opts: { subject?: string; percentage: number },
): Promise<void> {
  if (!userId || !key || !auth.currentUser) return;
  const ref = doc(db, 'users', userId, 'reviewState', key);

  const snap = await getDoc(ref);
  const prev = snap.exists() ? snap.data() : null;
  const priorState = {
    interval: prev?.interval ?? 0,
    ease: prev?.ease ?? DEFAULT_EASE,
    repetitions: prev?.repetitions ?? 0,
  };

  const quality = scoreToQuality(opts.percentage ?? 0);
  const next = computeSRS(priorState, quality);

  await setDoc(
    ref,
    cleanUndefined({
      key,
      subject: opts.subject,
      interval: next.interval,
      ease: next.ease,
      repetitions: next.repetitions,
      nextReviewMs: next.nextReviewMs,
      lastPct: Math.round(opts.percentage ?? 0),
      updatedAt: serverTimestamp(),
      updatedAtMs: Date.now(),
    }),
    { merge: true },
  );
}

/**
 * Load every review that is due now, priority-sorted (most overdue × coefficient
 * first) via the pure engine. `coefficients` (subject → Bac coefficient) is
 * optional — without it every subject weighs 1 and the queue orders by overdueness.
 * Returns [] when signed out.
 */
export async function loadDueReviews(
  userId: string,
  coefficients: Record<string, number> = {},
  now: number = Date.now(),
): Promise<ReviewItem[]> {
  if (!userId || !auth.currentUser) return [];
  const col = collection(db, 'users', userId, 'reviewState');
  const snap = await getDocs(col);

  const entries: ReviewStateEntry[] = [];
  snap.forEach((d) => {
    const v = d.data() || {};
    if (typeof v.nextReviewMs !== 'number') return;
    entries.push({
      key: d.id,
      subject: v.subject,
      interval: v.interval ?? 0,
      ease: v.ease ?? DEFAULT_EASE,
      repetitions: v.repetitions ?? 0,
      nextReviewMs: v.nextReviewMs,
      coefficient: v.subject ? coefficients[v.subject] : undefined,
    });
  });

  return dueReviews(entries, now);
}

// ── Missed-question review: an awaited, confirmable push (LJ-09) ─────────────
//
// The store records every miss locally at once, and services/masterySync
// mirrors the map to users/{uid}/mastery/review after a 4 s debounce —
// fire-and-forget, failures only logged. That is right for studying offline,
// but a result screen cannot say "your errors are in Révision" on the strength
// of it. `flushReviewPush` writes the given entries NOW and resolves only when
// Firestore acknowledges the write (the JS SDK's setDoc promise settles on the
// server commit, not the local cache), so "confirmed" means confirmed.
// It rejects when signed out, on a write error, or after `timeoutMs` (offline:
// the SDK keeps the write queued and the debounced sync covers it later).

export type ReviewFlushDeps = {
  getState: () => { uid: string | null; review: ReviewMap };
  write: (uid: string, questions: ReturnType<typeof toReviewWire>) => Promise<void>;
};

const defaultFlushDeps: ReviewFlushDeps = {
  getState: () => {
    const s = useStore.getState() as any;
    const uid = s.isAuthenticated && s.user?.uid && auth.currentUser ? String(s.user.uid) : null;
    return { uid, review: (s.review || {}) as ReviewMap };
  },
  // Merge-write: nested `questions.{id}` maps merge, so only the given
  // entries are touched — never another device's newer ones.
  write: (uid, questions) => setDoc(
    doc(db, 'users', uid, 'mastery', 'review'),
    { questions, updatedAt: serverTimestamp() },
    { merge: true },
  ),
};

export class ReviewFlushError extends Error {
  constructor(public reason: 'signed-out' | 'timeout' | 'write-failed', cause?: unknown) {
    super(`review flush: ${reason}`);
    if (cause !== undefined) (this as any).cause = cause;
  }
}

/**
 * Push the review entries for `ids` (all entries when omitted) and resolve once
 * the server has them. See the block comment above.
 */
export async function flushReviewPush(
  ids?: string[],
  { timeoutMs = 12000, deps = defaultFlushDeps }: { timeoutMs?: number; deps?: ReviewFlushDeps } = {},
): Promise<void> {
  const { uid, review } = deps.getState();
  if (!uid) throw new ReviewFlushError('signed-out');
  const subset: ReviewMap = {};
  if (ids && ids.length) {
    for (const id of ids) if (review[id]) subset[id] = review[id];
  } else {
    Object.assign(subset, review);
  }
  const questions = toReviewWire(subset);
  if (Object.keys(questions).length === 0) return;

  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ReviewFlushError('timeout')), timeoutMs);
  });
  try {
    await Promise.race([
      deps.write(uid, questions).catch((e) => { throw new ReviewFlushError('write-failed', e); }),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
