import { doc, getDoc, runTransaction, setDoc, serverTimestamp } from 'firebase/firestore';
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

/**
 * Join this device's map with the server's and write the join, in ONE
 * transaction (P0 validation L-10, F12 follow-up). `{merge:true}` merges field
 * by field, so any write of a record computed from a stale read can lower a
 * score another device just raised; inside a transaction a concurrent write
 * makes Firestore re-run the join against the new value instead. Resolves to
 * the join; throws when the server can't be reached (no blind write then: the
 * device keeps its map and `retryMasteryPushIfPending` tries again).
 */
async function pushJoined(uid: string, local: ProgressMap): Promise<ProgressMap> {
  const ref = masteryDoc(uid);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const lessons = snap.exists() ? snap.data()?.lessons : null;
    const remote = (lessons && typeof lessons === 'object' ? lessons : {}) as ProgressMap;
    const merged = mergeProgress(local, remote);
    if (!sameProgress(remote, merged)) {
      tx.set(ref, { lessons: toWireFormat(merged), updatedAt: serverTimestamp() }, { merge: true });
    }
    return merged;
  });
}

/** A push that could not reach the server, waiting for reconnect / foreground. */
let pushPending = false;

/**
 * The background push: the transactional join above, then fold the server's
 * progress back into the store.
 */
async function pushMergedMastery(uid: string, local: ProgressMap): Promise<void> {
  let merged: ProgressMap;
  try {
    merged = await pushJoined(uid, local);
    pushPending = false;
  } catch (error) {
    pushPending = true;
    console.warn('[Mastery] push deferred (offline?):', error);
    return;
  }
  if (!isSameAccount(uid, useStore.getState())) return;
  // Mark the join as pushed first, so folding it into the store doesn't
  // schedule a redundant push of the same map.
  lastPushed = merged;
  if (!sameProgress(local, merged)) useStore.getState().mergeRemoteProgress(merged);
}

/** Reconnect / foreground: retry a push that could not reach the server. */
export function retryMasteryPushIfPending(): Promise<void> {
  if (!pushPending || pushTimer) return Promise.resolve();
  return runMasteryPush();
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
/**
 * True while the store is still signed in as `uid`. A sign-in sync awaits the
 * network twice; if the account switched meanwhile (A → B), applying A's
 * merged map would put A's mastery on B's device state — so every apply and
 * push re-checks this first and drops the result otherwise.
 */
export function isSameAccount(uid: string, state: { user?: any; isAuthenticated?: boolean } | null | undefined): boolean {
  return !!uid && !!state?.isAuthenticated && state?.user?.uid === uid;
}

export async function syncMasteryOnLogin(uid: string): Promise<void> {
  if (!uid) return;
  const still = () => isSameAccount(uid, useStore.getState());
  if (!still()) return;
  const local = useStore.getState().progress as ProgressMap;
  const remote = await fetchRemoteMastery(uid);
  if (!still()) return;
  const merged = mergeProgress(local, remote);

  if (!sameProgress(local, merged)) useStore.getState().mergeRemoteProgress(merged);
  // Device and server now agree on `merged`: the baseline an offline push
  // diffs against (pushMergedMastery writes only what changed after it).
  lastPushed = merged;
  // Only write when the device is genuinely ahead — a fresh install with
  // nothing local must not clear the server.
  if (!sameProgress(remote, merged)) await pushMergedMastery(uid, merged);

  // Same dance for the review map — independent doc, independent verdicts.
  if (!still()) return;
  const localReview = useStore.getState().review as ReviewMap;
  const remoteReview = await fetchRemoteReview(uid);
  if (!still()) return;
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
        runMasteryPush();
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

function runMasteryPush(): Promise<void> {
  const s = useStore.getState();
  const currentUid = s.user?.uid;
  if (!currentUid || !s.isAuthenticated) return Promise.resolve();
  lastPushed = s.progress as ProgressMap;
  return pushMergedMastery(currentUid, lastPushed).catch((e) => {
    console.warn('[Mastery] push failed:', e);
  });
}

/**
 * Sign-out (explicit logout, NOT an account switch): push what the debounce
 * is still holding BEFORE logout() clears the local map. Stopping the timers
 * used to drop the last ~4 s of work — the result of the very exercise set the
 * student just finished (P0 validation). Callers bound the wait.
 */
export async function flushMasterySync(uid: string): Promise<void> {
  if (!uid || !isSameAccount(uid, useStore.getState())) return;
  const tasks: Promise<void>[] = [];
  if (pushTimer) {
    clearTimeout(pushTimer); pushTimer = null;
    tasks.push(runMasteryPush());
  }
  if (reviewPushTimer) {
    clearTimeout(reviewPushTimer); reviewPushTimer = null;
    const review = useStore.getState().review as ReviewMap;
    lastPushedReview = review;
    tasks.push(pushReview(uid, review));
  }
  await Promise.all(tasks);
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
  pushPending = false;
}

/** Full teardown — for tests and hot-reload, not for sign-out. */
export function disposeMasterySync(): void {
  stopMasterySync();
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
}
