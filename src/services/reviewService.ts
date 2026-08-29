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
import { db } from './firebase';
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
let loadPromise: Promise<ReviewMap> | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;

function reviewDoc(uid: string) {
  return doc(db, 'users', uid, 'mastery', 'review');
}

async function fetchRemote(uid: string): Promise<ReviewMap> {
  try {
    const snap = await getDoc(reviewDoc(uid));
    if (!snap.exists()) return {};
    const questions = snap.data()?.questions;
    return questions && typeof questions === 'object' ? (questions as ReviewMap) : {};
  } catch (err) {
    console.warn('[review] fetch failed:', err);
    return {};
  }
}

/** The user's review map — server copy joined with anything recorded this session. */
export async function loadReviewMap(uid: string): Promise<ReviewMap> {
  if (!uid) return {};
  if (cachedUid !== uid) {
    // User switched: drop the previous session's cache and pending push.
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    cachedUid = uid;
    cachedMap = {};
    loadPromise = null;
  }
  if (!loadPromise) {
    loadPromise = fetchRemote(uid).then((remote) => {
      cachedMap = mergeReview(cachedMap, remote);
      return cachedMap;
    });
  }
  await loadPromise;
  return cachedMap;
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
  void loadReviewMap(uid)
    .then(() => {
      const now = Date.now();
      const next = applyReviewOutcome(cachedMap[questionId], correct, now, meta);
      if (!next) return; // nothing changed (right answer on a never-missed question)
      cachedMap = pruneReview({ ...cachedMap, [questionId]: next }, now);
      schedulePush(uid);
    })
    .catch((err) => console.warn('[review] record failed:', err));
}

/** Due question ids, most recently missed first (loads the map if needed). */
export async function loadDueReviewIds(uid: string): Promise<string[]> {
  const map = await loadReviewMap(uid);
  return dueQuestionIds(map);
}

/** Test-only: reset the module cache between tests. */
export function __resetReviewCacheForTests(): void {
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  cachedUid = null;
  cachedMap = {};
  loadPromise = null;
}
