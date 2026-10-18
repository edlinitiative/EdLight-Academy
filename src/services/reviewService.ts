/**
 * reviewService — the web side of Revizyon (missed-question review).
 *
 * Mirrors the mobile flow into the SAME Firestore doc, so a question missed on
 * the phone can be resolved on the web and vice-versa:
 *
 *   users/{uid}/mastery/review   { questions: { [questionId]: ReviewEntry } }
 *
 * The pure model lives in utils/review (identical file on both platforms —
 * timestamps only move forward, so every write is a lattice join and no
 * device can erase another's record).
 *
 * Web has no persisted local store, so this keeps a per-session cache:
 * the first record (or read) pulls the server copy once, outcomes apply
 * locally, and a debounced push writes the merged map back. Everything is
 * best-effort — an offline student keeps practicing and the write just fails
 * quietly (the next session's merge re-derives nothing lost locally-only,
 * which is acceptable for review data on web).
 */
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import {
  applyReviewOutcome,
  mergeReview,
  pruneReview,
  toReviewWire,
  dueQuestionIds,
  type ReviewMap,
  type ReviewMeta,
} from '../utils/review';

const PUSH_DEBOUNCE_MS = 4000;

let cachedUid: string | null = null;
let cachedMap: ReviewMap = {};
let loadPromise: Promise<ReviewReadResult<ReviewMap>> | null = null;
/** recordReviewOutcome calls still applying to the cache (flush waits on them). */
const pendingRecords = new Set<Promise<void>>();
let pushTimer: ReturnType<typeof setTimeout> | null = null;

function reviewDoc(uid: string) {
  return doc(db, 'users', uid, 'mastery', 'review');
}

/** A read that says whether it worked — `error` is never shown as "nothing due". */
export type ReviewReadResult<T> = { status: 'ok'; data: T } | { status: 'error'; data: T; error: unknown };

async function fetchRemote(uid: string): Promise<ReviewReadResult<ReviewMap>> {
  try {
    // A read answered from Firestore's offline cache is a real (if stale)
    // copy of the student's list: `ok`.
    const snap = await getDoc(reviewDoc(uid));
    if (!snap.exists()) return { status: 'ok', data: {} };
    const questions = snap.data()?.questions;
    return { status: 'ok', data: questions && typeof questions === 'object' ? (questions as ReviewMap) : {} };
  } catch (error) {
    console.warn('[review] fetch failed:', error);
    return { status: 'error', data: {}, error };
  }
}

/**
 * The user's review map — server copy joined with anything recorded this
 * session — and whether the server copy could be read. On `error`, `data` is
 * only this session's outcomes, and the next call reads the server again
 * (a failed read is never cached as "nothing due").
 */
export async function loadReviewMapResult(uid: string): Promise<ReviewReadResult<ReviewMap>> {
  if (!uid) return { status: 'ok', data: {} };
  if (cachedUid !== uid) {
    // User switched: drop the previous session's cache and pending push.
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    cachedUid = uid;
    cachedMap = {};
    loadPromise = null;
  }
  if (!loadPromise) {
    const p: Promise<ReviewReadResult<ReviewMap>> = fetchRemote(uid).then((res) => {
      if (res.status === 'ok') {
        if (cachedUid === uid) cachedMap = mergeReview(cachedMap, res.data);
      } else if (loadPromise === p) {
        loadPromise = null; // retry on the next call
      }
      return res;
    });
    loadPromise = p;
  }
  const res = await loadPromise;
  return res.status === 'ok'
    ? { status: 'ok', data: cachedMap }
    : { status: 'error', data: cachedMap, error: res.error };
}

/** The user's review map (`loadReviewMapResult` without the status). */
export async function loadReviewMap(uid: string): Promise<ReviewMap> {
  return (await loadReviewMapResult(uid)).data;
}

function schedulePush(uid: string): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    pushTimer = null;
    if (cachedUid !== uid) return;
    try {
      await setDoc(
        reviewDoc(uid),
        { questions: toReviewWire(cachedMap), updatedAt: serverTimestamp() },
        { merge: true },
      );
    } catch (err) {
      console.warn('[review] push failed:', err);
    }
  }, PUSH_DEBOUNCE_MS);
}

/**
 * Record one answered quiz-bank question. Wrong → due for review; right →
 * resolved (wherever it was missed — phone included). Fire-and-forget: callers
 * never await this on the answer path.
 */
export function recordReviewOutcome(
  uid: string,
  questionId: string,
  correct: boolean,
  meta?: ReviewMeta,
): void {
  // Skip synthetic/positional ids — only real quiz-bank doc ids are stable.
  if (!uid || !questionId || /^q\d+$/.test(questionId)) return;
  const p: Promise<void> = loadReviewMap(uid)
    .then(() => {
      const now = Date.now();
      const next = applyReviewOutcome(cachedMap[questionId], correct, now, meta);
      if (!next) return; // nothing changed (right answer on a never-missed question)
      cachedMap = pruneReview({ ...cachedMap, [questionId]: next }, now);
      schedulePush(uid);
    })
    .catch((err) => console.warn('[review] record failed:', err))
    .finally(() => { pendingRecords.delete(p); });
  pendingRecords.add(p);
}

/** Due question ids, most recently missed first (loads the map if needed). */
export async function loadDueReviewIds(uid: string): Promise<string[]> {
  return (await loadDueReviewIdsResult(uid)).data;
}

/** Due question ids with a status: `error` means the server list was unreadable. */
export async function loadDueReviewIdsResult(uid: string): Promise<ReviewReadResult<string[]>> {
  const res = await loadReviewMapResult(uid);
  const data = dueQuestionIds(res.data);
  return res.status === 'ok' ? { status: 'ok', data } : { status: 'error', data, error: res.error };
}

// ── Confirmed push ──────────────────────────────────────────────────────────
//
// recordReviewOutcome applies each miss to the session cache at once and the
// debounced push mirrors it to users/{uid}/mastery/review 4 s later —
// fire-and-forget, failures only logged. A result screen cannot say "your
// errors are in Révision" on the strength of that. `flushReviewPush` (the web
// port of mobile/src/services/reviewService.ts) writes the given entries NOW
// with a merge and resolves only when Firestore acknowledges the write (the JS
// SDK's setDoc promise settles on the server commit, not the local cache), so
// "confirmed" means confirmed. It rejects when signed out, when a requested id
// was never recorded, on a write error, or after `timeoutMs` (offline: the SDK
// keeps the write queued and the debounced push covers it later).

export type ReviewFlushDeps = {
  getUid: () => string | null;
  write: (uid: string, questions: ReturnType<typeof toReviewWire>) => Promise<void>;
};

const defaultFlushDeps: ReviewFlushDeps = {
  getUid: () => auth.currentUser?.uid || null,
  // Merge-write: nested `questions.{id}` maps merge, so only the given
  // entries are touched — never another device's newer ones.
  write: (uid, questions) => setDoc(
    reviewDoc(uid),
    { questions, updatedAt: serverTimestamp() },
    { merge: true },
  ),
};

export class ReviewFlushError extends Error {
  reason: 'signed-out' | 'not-recorded' | 'timeout' | 'write-failed';

  constructor(reason: 'signed-out' | 'not-recorded' | 'timeout' | 'write-failed', cause?: unknown) {
    super(`review flush: ${reason}`);
    this.name = 'ReviewFlushError';
    this.reason = reason;
    if (cause !== undefined) (this as any).cause = cause;
  }
}

/**
 * Push the review entries for `ids` (every cached entry when omitted) and
 * resolve once the server has them. See the block comment above.
 */
export async function flushReviewPush(
  ids?: string[],
  { timeoutMs = 12000, deps = defaultFlushDeps }: { timeoutMs?: number; deps?: ReviewFlushDeps } = {},
): Promise<void> {
  const uid = deps.getUid();
  if (!uid) throw new ReviewFlushError('signed-out');

  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ReviewFlushError('timeout')), timeoutMs);
  });
  const run = async () => {
    // Outcomes still being applied (the last answer's record may not have
    // reached the cache when the result screen mounts).
    if (pendingRecords.size) await Promise.all([...pendingRecords]);
    if (cachedUid !== uid) throw new ReviewFlushError('not-recorded');
    const subset: ReviewMap = {};
    if (ids && ids.length) {
      for (const id of ids) {
        if (!cachedMap[id]) throw new ReviewFlushError('not-recorded');
        subset[id] = cachedMap[id];
      }
    } else {
      Object.assign(subset, cachedMap);
    }
    const questions = toReviewWire(subset);
    if (Object.keys(questions).length === 0) return;
    try {
      await deps.write(uid, questions);
    } catch (e) {
      throw new ReviewFlushError('write-failed', e);
    }
  };
  try {
    await Promise.race([run(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Test-only: reset the module cache between tests. */
export function __resetReviewCacheForTests(): void {
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  cachedUid = null;
  cachedMap = {};
  loadPromise = null;
  pendingRecords.clear();
}
