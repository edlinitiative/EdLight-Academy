import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import useStore from '../contexts/store';
import type { ProgressMap } from '../utils/mastery';
import { mergeProgress, sameProgress, toWireFormat, MASTERY_PATH } from '../utils/masteryMerge';
import { mergeReview, sameReview, toReviewWire, type ReviewMap } from '../utils/review';

/**
 * Mastery sync.
 *
 * Mastery is the app's core signal, so it cannot live only in AsyncStorage:
 * reinstall the app or change phone and a term's work is gone. This mirrors it
 * to `users/{uid}/mastery/lessons` and merges both ways.
 *
 * ONE DOCUMENT, not one per lesson. A student has a few hundred lessons at
 * most, each a handful of numbers, so the whole map is a few tens of KB — far
 * under the 1 MB limit — and it costs exactly one read at sign-in and one write
 * per debounce window instead of N.
 *
 * The merge is monotonic (see utils/masteryMerge), so this is safe to run in any
 * order, any number of times, from any number of devices.
 *
 * Everything here is best-effort: a student on a bad connection in Port-au-Prince
 * must keep studying with a dead network, so nothing awaits the network on the
 * critical path and every failure is swallowed after a log.
 */

const PUSH_DEBOUNCE_MS = 4000;

function masteryDoc(uid: string) {
  return doc(db, 'users', uid, MASTERY_PATH.collection, MASTERY_PATH.doc);
}

/**
 * Missed-question review lives beside mastery under the same rules block:
 * `users/{uid}/mastery/review`, one doc, same monotonic-merge discipline
 * (see utils/review — timestamps only move forward).
 */
function reviewDoc(uid: string) {
  return doc(db, 'users', uid, 'mastery', 'review');
}

/** Read the server's copy. Returns `{}` when absent or unreachable. */
export async function fetchRemoteMastery(uid: string): Promise<ProgressMap> {
  try {
    const snap = await getDoc(masteryDoc(uid));
    if (!snap.exists()) return {};
    const lessons = snap.data()?.lessons;
    return lessons && typeof lessons === 'object' ? (lessons as ProgressMap) : {};
  } catch (error) {
    console.warn('[Mastery] fetch failed:', error);
    return {};
  }
}

/** Overwrite the server's copy with `progress` (already merged by the caller). */
export async function pushMastery(uid: string, progress: ProgressMap): Promise<void> {
  try {
    await setDoc(
      masteryDoc(uid),
      { lessons: toWireFormat(progress), updatedAt: serverTimestamp() },
      { merge: true },
    );
  } catch (error) {
    console.warn('[Mastery] push failed:', error);
  }
}

/** Read the server's review copy. Returns `{}` when absent or unreachable. */
export async function fetchRemoteReview(uid: string): Promise<ReviewMap> {
  try {
    const snap = await getDoc(reviewDoc(uid));
    if (!snap.exists()) return {};
    const questions = snap.data()?.questions;
    return questions && typeof questions === 'object' ? (questions as ReviewMap) : {};
  } catch (error) {
    console.warn('[Review] fetch failed:', error);
    return {};
  }
}

/** Overwrite the server's review copy with `review` (already merged by the caller). */
export async function pushReview(uid: string, review: ReviewMap): Promise<void> {
  try {
    await setDoc(
      reviewDoc(uid),
      { questions: toReviewWire(review), updatedAt: serverTimestamp() },
      { merge: true },
    );
  } catch (error) {
    console.warn('[Review] push failed:', error);
  }
}

/**
 * Sign-in reconciliation: pull the server's copy, join it with what's on the
 * device, keep the result locally, and write it back when the device knew
 * something the server didn't.
 *
 * This is what restores a student's mastery on a new phone, and what backfills
 * the server for everyone who earned mastery before this shipped.
 */
export async function syncMasteryOnLogin(uid: string): Promise<void> {
  if (!uid) return;
  const local = useStore.getState().progress as ProgressMap;
  const remote = await fetchRemoteMastery(uid);
  const merged = mergeProgress(local, remote);

  if (!sameProgress(local, merged)) useStore.getState().mergeRemoteProgress(merged);
  // Only write when the device is genuinely ahead — a fresh install with
  // nothing local must not clear the server.
  if (!sameProgress(remote, merged)) await pushMastery(uid, merged);

  // Same dance for the review map — independent doc, independent verdicts.
  const localReview = useStore.getState().review as ReviewMap;
  const remoteReview = await fetchRemoteReview(uid);
  const mergedReview = mergeReview(localReview, remoteReview);
  if (!sameReview(localReview, mergedReview)) useStore.getState().mergeRemoteReview(mergedReview);
  if (!sameReview(remoteReview, mergedReview)) await pushReview(uid, mergedReview);
}

// ── Debounced background push ────────────────────────────────────────────────

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let reviewPushTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribe: (() => void) | null = null;
let lastPushed: ProgressMap | null = null;
let lastPushedReview: ReviewMap | null = null;

/**
 * Watch the store and mirror mastery upward as it changes. Debounced, because
 * finishing an exercise set fires several updates in a row and each one would
 * otherwise be its own write.
 */
export function startMasterySync(): () => void {
  if (unsubscribe) return unsubscribe;

  unsubscribe = useStore.subscribe((state, prev) => {
    const uid = state.user?.uid;
    // Signed-in only: a guest has nowhere to sync to, and their work is carried
    // forward by the sign-in reconciliation above once they create an account.
    if (!uid || !state.isAuthenticated) return;

    if (
      state.progress !== prev.progress
      && !(lastPushed && sameProgress(lastPushed, state.progress as ProgressMap))
    ) {
      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = setTimeout(() => {
        pushTimer = null;
        const s = useStore.getState();
        const currentUid = s.user?.uid;
        if (!currentUid || !s.isAuthenticated) return;
        lastPushed = s.progress as ProgressMap;
        pushMastery(currentUid, lastPushed);
      }, PUSH_DEBOUNCE_MS);
    }

    if (
      state.review !== prev.review
      && !(lastPushedReview && sameReview(lastPushedReview, state.review as ReviewMap))
    ) {
      if (reviewPushTimer) clearTimeout(reviewPushTimer);
      reviewPushTimer = setTimeout(() => {
        reviewPushTimer = null;
        const s = useStore.getState();
        const currentUid = s.user?.uid;
        if (!currentUid || !s.isAuthenticated) return;
        lastPushedReview = s.review as ReviewMap;
        pushReview(currentUid, lastPushedReview);
      }, PUSH_DEBOUNCE_MS);
    }
  });

  return unsubscribe;
}

/**
 * Sign-out: drop the pending write and forget the snapshot.
 *
 * Deliberately does NOT unsubscribe. `logout()` clears the local progress map,
 * and an in-flight debounced push would otherwise write that empty map over the
 * server's copy — wiping the very data this exists to protect. Tearing the
 * subscription down instead was the first attempt, but the listener is
 * registered once at mount, so a sign-out then sign-in inside one session left
 * the second session with no live push at all. The subscription stays and gates
 * itself on `isAuthenticated`.
 */
export function stopMasterySync(): void {
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  if (reviewPushTimer) { clearTimeout(reviewPushTimer); reviewPushTimer = null; }
  lastPushed = null;
  lastPushedReview = null;
}

/** Full teardown — for tests and hot-reload, not for sign-out. */
export function disposeMasterySync(): void {
  stopMasterySync();
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
}
