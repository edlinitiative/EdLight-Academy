/**
 * trustState — the pure half of the Arène's trust layer.
 *
 * Two questions a student on a bad connection keeps asking, answered from
 * signals the client actually has and never from hope:
 *
 *   · "Am I still connected?"      → connectionState()
 *   · "Did my answer get there?"   → answerReceiptView()
 *
 * The one rule: NEVER CLAIM RECEIPT THAT IS NOT CONFIRMED. The only proof an
 * answer reached the server is the answer endpoint's 200 (`{ ok, recorded }`,
 * api/arena/answer.ts). A request in flight, a request that failed with a
 * network error, a request whose response was lost — all three are
 * "not confirmed", whatever the student tapped.
 *
 * Framework-free so the tests can walk every state without a renderer.
 */

import type { AnswerReceiptStatus } from '../../../utils/arenaPlay';

// ── Connection ──────────────────────────────────────────────────────────────

export type ConnectionState = 'connecting' | 'live' | 'reconnecting';

export interface ConnectionSignals {
  /** `navigator.onLine` — a "false" is reliable, a "true" only means "maybe". */
  online: boolean;
  /** The first tournament snapshot has arrived (from server or cache). */
  hasSnapshot: boolean;
  /** A Firestore listener ended on an error and is being re-opened. */
  listenerLost: boolean;
  /**
   * The last real round trip to our API (presence heartbeat or an answer)
   * failed at the network level. `null` = no round trip made yet.
   */
  lastRoundTripFailed: boolean | null;
  /** The browser came back online and nothing has confirmed the server since. */
  recovering: boolean;
}

export function connectionState(s: ConnectionSignals): ConnectionState {
  if (!s.online || s.listenerLost || s.lastRoundTripFailed === true || s.recovering) {
    // Before the very first snapshot there is nothing to RE-connect to.
    return s.hasSnapshot ? 'reconnecting' : 'connecting';
  }
  return s.hasSnapshot ? 'live' : 'connecting';
}

/**
 * Network-level failures only. A 403 `not_registered` from the presence
 * endpoint is a real answer from a reachable server — the connection is fine.
 */
export function isNetworkFailure(error: string | null | undefined): boolean {
  if (!error) return false;
  if (error === 'offline' || error === 'network') return true;
  const m = /^http_(\d{3})$/.exec(error);
  return !!m && Number(m[1]) >= 500;
}

// ── Answer receipt ──────────────────────────────────────────────────────────

export type ReceiptKind =
  | 'idle'            // nothing chosen, question open
  | 'sending'         // request in flight — "envoyée", NOT "reçue"
  | 'received'        // the server's 200: the only confirmed state
  | 'waitingNetwork'  // failed while offline; held here, resent on reconnect
  | 'failed'          // failed while online; retry offered
  | 'unconfirmedLate' // the question closed before any confirmation came back
  | 'tooLate'         // the server said the window was closed: not counted
  | 'ineligible'      // the server said this account cannot score
  | 'noAnswer';       // the question closed with nothing chosen

const ELIGIBILITY_ERRORS = new Set(['not_registered', 'not_eligible']);

export interface ReceiptInput {
  choice: number | null;
  status: AnswerReceiptStatus | null;
  /** The server's error code, when there was one. */
  error?: string | null;
  online: boolean;
  /** The question still accepts answers (open and before closesAt). */
  questionOpen: boolean;
}

export function answerReceiptView(i: ReceiptInput): ReceiptKind {
  if (i.choice == null) return i.questionOpen ? 'idle' : 'noAnswer';
  if (i.status === 'accepted') return 'received';
  if (i.status === 'rejected') {
    // classifyAnswerResult only calls a code terminal when it is one of the
    // window or eligibility errors, so anything else here is the window.
    return i.error && ELIGIBILITY_ERRORS.has(i.error) ? 'ineligible' : 'tooLate';
  }
  // Sending or retryable: unconfirmed either way.
  if (!i.questionOpen) return 'unconfirmedLate';
  if (i.status === 'retryable') return i.online ? 'failed' : 'waitingNetwork';
  return 'sending';
}

/** `mm:ss` on the question clock. Floors: never round a time up into a better tier. */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm < 10 ? '0' : ''}${mm}:${ss < 10 ? '0' : ''}${ss}`;
}

// ── Duel submission ─────────────────────────────────────────────────────────

export type DuelSubmitKind = 'saving' | 'saved' | 'waitingNetwork' | 'failed' | 'refused';

/**
 * The opponent's one attempt, as a state. `refused` is a server answer the
 * student cannot fix by retrying (already played, expired, own duel); `failed`
 * may never have reached the server, so a retry is offered — and is safe: a
 * second post of a score that DID land comes back `already_played`, which the
 * hook turns back into the recorded result.
 */
export function duelSubmitView(r: { pending: boolean; ok?: boolean; error?: string | null; online: boolean }): DuelSubmitKind {
  if (r.pending) return 'saving';
  if (r.ok) return 'saved';
  if (isNetworkFailure(r.error) || r.error === 'auth') return r.online ? 'failed' : 'waitingNetwork';
  return 'refused';
}
