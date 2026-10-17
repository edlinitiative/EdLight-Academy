/**
 * Effectful half of the auth gate: best-effort profile sync with its own
 * recoverable state, the grade/track reconciliation, and account isolation
 * (what is cleared when the student on this device changes).
 *
 * The rule that shapes all of it: confirming WHO is signed in never waits on
 * Firestore. A signed-in cold launch with no network must reach a usable
 * screen; the profile catches up when it can.
 */

import useStore from '../contexts/store';
import { upsertUserDocument, getUserProfile, updateUserGrade } from '../services/firebase';
import { stopMasterySync } from '../services/masterySync';
import { clearPersistedQueryCache } from '../services/queryPersistence';
import { reportError, trackEvent } from '../services/telemetry';
import { queryClient } from './queryClient';
import {
  createSessionGuard,
  INITIAL_PROFILE_SYNC,
  shouldAttemptProfileSync,
  withTimeout,
  type ProfileSyncState,
  type SessionToken,
} from './sessionLogic';

/** One guard for the whole app: which account async results may land on. */
export const sessionGuard = createSessionGuard();

const PROFILE_TIMEOUT_MS = 15_000;

// ── Profile sync ─────────────────────────────────────────────────────────────

let profileSync: ProfileSyncState = { ...INITIAL_PROFILE_SYNC };
/** The Firebase user object the last sync was for — needed to retry later. */
let lastFirebaseUser: any = null;

export function getProfileSyncState(): ProfileSyncState {
  return profileSync;
}

/**
 * An explicit sign-in (authService) already upserted the document; tell the
 * passive listener so it doesn't immediately do it again.
 */
export function markProfileSynced(uid: string) {
  const now = Date.now();
  profileSync = { uid, status: 'synced', lastAttemptAt: now, lastSuccessAt: now, failures: 0 };
}

/**
 * Upsert users/{uid} (last_seen, name, photo) — best-effort, never throws,
 * never blocks the caller (fire and forget). Throttled per account; failures
 * are retried by `retryProfileSyncIfDue` on foreground / reconnect.
 */
export async function syncProfile(firebaseUser: any, opts: { force?: boolean; reason?: string } = {}): Promise<void> {
  const uid: string | undefined = firebaseUser?.uid;
  if (!uid) return;
  const now = Date.now();
  if (!shouldAttemptProfileSync(profileSync, uid, now, !!opts.force)) return;

  lastFirebaseUser = firebaseUser;
  const prevFailures = profileSync.uid === uid ? profileSync.failures : 0;
  const prevSuccess = profileSync.uid === uid ? profileSync.lastSuccessAt : 0;
  profileSync = { uid, status: 'pending', lastAttemptAt: now, lastSuccessAt: prevSuccess, failures: prevFailures };

  try {
    await withTimeout(upsertUserDocument(firebaseUser, false), PROFILE_TIMEOUT_MS, 'profile upsert');
    if (profileSync.uid !== uid) return; // account changed meanwhile
    profileSync = { uid, status: 'synced', lastAttemptAt: now, lastSuccessAt: Date.now(), failures: 0 };
  } catch (error) {
    if (profileSync.uid !== uid) return;
    profileSync = { ...profileSync, status: 'failed', failures: prevFailures + 1 };
    reportError(error, { flow: 'profile_sync', reason: opts.reason ?? 'auth', failures: prevFailures + 1 });
  }
}

/** Retry a failed sync (backoff respected). Wired to foreground + reconnect. */
export function retryProfileSyncIfDue(reason: string) {
  if (profileSync.status !== 'failed') return;
  const current = sessionGuard.current();
  if (!lastFirebaseUser || !current.uid || lastFirebaseUser.uid !== current.uid) return;
  syncProfile(lastFirebaseUser, { reason }).catch(() => {});
}

function resetProfileSync() {
  profileSync = { ...INITIAL_PROFILE_SYNC };
  lastFirebaseUser = null;
}

// ── Grade / track reconciliation ─────────────────────────────────────────────

/**
 * Sync grade/track with the user doc. Local state was the only home for these
 * (lost on reinstall, invisible to the server), so:
 *   server has it, device doesn't → restore (reinstall / new device);
 *   device has it, server doesn't → backfill (pre-persistence users, and
 *   guests who picked a grade before signing up).
 * Applied only if the same account is still signed in when the read returns.
 */
export async function syncGradeAndTrack(uid: string, token: SessionToken): Promise<void> {
  try {
    const profile = await withTimeout(getUserProfile(uid), PROFILE_TIMEOUT_MS, 'profile read');
    if (!sessionGuard.isCurrent(token)) return;
    const s = useStore.getState();
    if (s.user?.uid !== uid) return;
    const serverGrade = typeof profile?.grade === 'string' && profile.grade ? profile.grade : null;
    if (serverGrade && !s.grade) {
      s.setGrade(serverGrade);
      s.setGradeChosen(true);
    } else if (!serverGrade && s.grade && s.gradeChosen) {
      updateUserGrade(uid, s.grade);
    }
    const serverTrack = typeof profile?.track === 'string' && profile.track ? profile.track : null;
    if (serverTrack && !s.track) s.setTrack(serverTrack);
  } catch {
    // Offline or blocked — the next auth event / launch tries again.
  }
}

// ── Account isolation ────────────────────────────────────────────────────────

/**
 * Wipe the previous student's local state, synchronously, before anything of
 * the next account is applied. Order matters:
 *   1. stop the mastery push (no pending write may carry A's map to B);
 *   2. reset student-owned store fields in ONE update that also drops the
 *      user, so the mastery listener sees "signed out" and pushes nothing;
 *   3. clear the in-memory query cache and the persisted copy;
 *   4. forget the Sandra thread pointer.
 * Device preferences survive (see studentStateReset in contexts/store).
 */
export function clearStudentSession(reason: 'signed-out' | 'account-switch' | 'logout') {
  try { stopMasterySync(); } catch { /* ignore */ }
  try { useStore.getState().logout(); } catch (e) { reportError(e, { flow: 'clear_session', step: 'store' }); }
  clearQueryCaches();
  resetProfileSync();
  import('../services/sandraService')
    .then(({ writeConvId }) => writeConvId(null))
    .catch(() => {});
  trackEvent('session_cleared', { reason });
}

function clearQueryCaches() {
  try { queryClient.cancelQueries().catch(() => {}); } catch { /* ignore */ }
  try { queryClient.clear(); } catch (e) { reportError(e, { flow: 'clear_session', step: 'query_cache' }); }
  clearPersistedQueryCache().catch(() => {});
}

let isolationInstalled = false;

/**
 * Belt and braces for paths that change the store user without going through
 * the auth gate (e.g. ProfileScreen calls `logout()` directly after
 * `logoutUser()`): whenever the store's uid moves AWAY from a known account,
 * drop the query caches. Rehydration (null → A) never triggers it.
 */
export function installAccountIsolation(): () => void {
  if (isolationInstalled) return () => {};
  isolationInstalled = true;
  const unsub = useStore.subscribe((state, prev) => {
    const before = prev.user?.uid ?? null;
    const after = state.user?.uid ?? null;
    if (before && before !== after) clearQueryCaches();
  });
  return () => { unsub(); isolationInstalled = false; };
}
