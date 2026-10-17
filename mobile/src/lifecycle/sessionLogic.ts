/**
 * Pure decisions behind the auth gate (no Firebase, no React) so they can be
 * unit-tested. The effectful side lives in ./session.ts and App.tsx.
 */

export type AuthTransition =
  /** No account before, none now (cold launch signed out, or a repeat event). */
  | 'still-signed-out'
  /** A known account went away: sign-out, deletion, revoked session. */
  | 'signed-out'
  /** The same account fired again (resume, token refresh, re-subscribe). */
  | 'same-user'
  /** Someone signed in on a device that had no account (guest → student). */
  | 'signed-in'
  /** A different account than the last one known on this device. */
  | 'account-switch';

/**
 * `prevUid` is the account the DEVICE last knew (the persisted store user),
 * not the last Firebase event — so a switch that happens across a restart,
 * or without an explicit logout, is still caught.
 */
export function classifyAuthTransition(prevUid: string | null | undefined, nextUid: string | null | undefined): AuthTransition {
  const prev = prevUid || null;
  const next = nextUid || null;
  if (!prev && !next) return 'still-signed-out';
  if (prev && !next) return 'signed-out';
  if (!prev && next) return 'signed-in';
  return prev === next ? 'same-user' : 'account-switch';
}

/**
 * Must the previous student's local state be wiped before applying this one?
 * A guest's work is deliberately NOT wiped on sign-in: it is carried into the
 * new account by the mastery/grade reconciliation.
 */
export function shouldClearStudentState(t: AuthTransition): boolean {
  return t === 'signed-out' || t === 'account-switch';
}

// ── Stale-result guard ───────────────────────────────────────────────────────

export type SessionToken = { readonly epoch: number; readonly uid: string | null };

/**
 * Async work started for one account must not land on another. `begin(uid)`
 * is called on every auth event; the epoch only moves when the account
 * actually changes, so repeat events for the same student don't cancel that
 * student's in-flight work. Work captures `current()` up front and checks
 * `isCurrent(token)` before applying its result.
 */
export function createSessionGuard() {
  let epoch = 0;
  let uid: string | null = null;
  return {
    begin(nextUid: string | null | undefined): SessionToken {
      const n = nextUid || null;
      if (n !== uid) { epoch += 1; uid = n; }
      return { epoch, uid };
    },
    current(): SessionToken {
      return { epoch, uid };
    },
    isCurrent(token: SessionToken | null | undefined): boolean {
      return !!token && token.epoch === epoch && token.uid === uid;
    },
  };
}

// ── Timeouts ─────────────────────────────────────────────────────────────────

export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Firestore writes made offline never reject — they wait for the server.
 * Anything awaited on a user-visible path gets a ceiling. The underlying
 * operation keeps running (a queued write still lands later); only the wait
 * is abandoned.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'operation'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
    promise.then(
      (v) => { clearTimeout(id); resolve(v); },
      (e) => { clearTimeout(id); reject(e); },
    );
  });
}

// ── Profile sync scheduling ──────────────────────────────────────────────────

export type ProfileSyncStatus = 'idle' | 'pending' | 'synced' | 'failed';

export type ProfileSyncState = {
  uid: string | null;
  status: ProfileSyncStatus;
  lastAttemptAt: number;
  lastSuccessAt: number;
  failures: number;
};

export const INITIAL_PROFILE_SYNC: ProfileSyncState = {
  uid: null, status: 'idle', lastAttemptAt: 0, lastSuccessAt: 0, failures: 0,
};

/** A synced profile is refreshed (last_seen) at most this often. */
export const PROFILE_SYNC_INTERVAL_MS = 60 * 60 * 1000;
/** After a failure, wait this long (× failures, capped) before retrying. */
export const PROFILE_RETRY_BASE_MS = 30 * 1000;
export const PROFILE_RETRY_MAX_MS = 10 * 60 * 1000;

export function retryDelayMs(failures: number): number {
  return Math.min(PROFILE_RETRY_BASE_MS * Math.max(1, failures), PROFILE_RETRY_MAX_MS);
}

/**
 * Should a profile upsert be attempted now for `uid`?
 * `force` (an explicit sign-in) skips the throttle but never doubles an
 * in-flight attempt.
 */
export function shouldAttemptProfileSync(state: ProfileSyncState, uid: string | null | undefined, now: number, force = false): boolean {
  if (!uid) return false;
  if (state.uid !== uid) return true; // a new account always syncs
  if (state.status === 'pending') return false;
  if (force) return true;
  if (state.status === 'idle') return true;
  if (state.status === 'synced') return now - state.lastSuccessAt > PROFILE_SYNC_INTERVAL_MS;
  // failed
  return now - state.lastAttemptAt >= retryDelayMs(state.failures);
}
