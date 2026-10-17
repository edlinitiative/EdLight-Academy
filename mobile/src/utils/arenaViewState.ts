/**
 * Arena screen states — what a student is actually looking at, derived once.
 *
 * Pure: no Firestore, no React, no clock of its own. The hooks in
 * hooks/useArena.ts feed it the raw listener values and the screens render the
 * answer. Tested in utils/__tests__/arenaViewState.test.ts.
 *
 * The rule this module exists to enforce: A FAILURE IS NEVER DRESSED AS AN
 * ORDINARY STATE. Before it, a rejected tournament listener became `absent`
 * ("no championship scheduled") and a missing or failed question became
 * `inPause` (the ten-second interval between questions). Both are lies told at
 * the worst moment — a student mid-tournament reading "nothing is on tonight",
 * or sitting on an "interval" that is really a dead connection while the
 * question they could be answering runs out.
 *
 * So every failure has its own state, each with its own explanation and its
 * own action:
 *
 *   loading          first read in flight
 *   unavailable      the event does not exist (deleted, mistyped) or was voided
 *   denied           the rules refused the read — retrying will not help alone
 *   reconnecting     the listener failed or we are serving cache; auto-retrying
 *   waitingStart     doors are open, first question not yet on the clock
 *   questionLoading  the tournament says a question is current; its document
 *                    has not arrived (or is still `pending`)
 *   question         a question is open and the window has not closed
 *   interval         the real pause between questions (closed / revealed)
 *   ended            grading, provisional or final
 *
 * Last-known data is kept through a failure, but always with `stale: true`, so
 * a screen can show it under a "reconnecting" label instead of either hiding it
 * or presenting it as current.
 */

import type { ArenaState } from '../../../shared/arena/state';

export type LiveErrorKind = 'denied' | 'unavailable' | 'other';

/** The minimal shape of one live subscription, as the hooks report it. */
export interface LiveSource<T> {
  /** Last-known value. Kept through an error so the screen can label it stale. */
  data: T | null;
  loading: boolean;
  error: boolean;
  errorKind: LiveErrorKind | null;
  /** The document's existence on the last successful read; null before any read. */
  exists: boolean | null;
  /** The value came from the local cache (offline), not the server. */
  fromCache: boolean;
}

/** Firestore's error codes, reduced to what the student can be told. */
export function classifyFirestoreError(err: unknown): LiveErrorKind {
  const code = String((err as any)?.code ?? '').replace(/^firestore\//, '');
  if (code === 'permission-denied' || code === 'unauthenticated') return 'denied';
  if (
    code === 'unavailable'
    || code === 'deadline-exceeded'
    || code === 'resource-exhausted'
    || code === 'cancelled'
    || code === 'internal'
    || code === 'unknown'
    || code === 'aborted'
    || code === ''
  ) return 'unavailable';
  return 'other';
}

/**
 * Reconnect backoff for a failed listener: 2s, 4s, 8s, 16s, then every 30s.
 * A rules rejection is not retried automatically — it will not change by
 * itself, and hammering it costs reads — the screen offers a manual retry.
 */
export function retryDelayMs(attempt: number, kind: LiveErrorKind | null): number | null {
  if (kind === 'denied') return null;
  const n = Math.max(0, Math.floor(attempt));
  return Math.min(30_000, 2_000 * 2 ** n);
}

// ── Event-level status (Lobby, Doors, Result, Hub) ──────────────────────────

export type EventStatus = 'loading' | 'unavailable' | 'denied' | 'reconnecting' | 'ready';

export interface EventStatusView {
  status: EventStatus;
  /** Showing last-known data that may be out of date. */
  stale: boolean;
}

interface HasState { state: ArenaState }

export function deriveEventStatus<T extends HasState>(t: LiveSource<T>): EventStatusView {
  if (!t.data) {
    if (t.loading) return { status: 'loading', stale: false };
    if (t.error) return { status: t.errorKind === 'denied' ? 'denied' : 'reconnecting', stale: false };
    // Offline with nothing cached, Firestore reports "does not exist" FROM
    // CACHE. That is not evidence the event is gone — only the server can
    // say that.
    if (t.fromCache) return { status: 'reconnecting', stale: false };
    return { status: 'unavailable', stale: false };
  }
  if (t.data.state === 'void') return { status: 'unavailable', stale: false };
  // We have something to show. If the listener has since failed, or the value
  // came from cache, show it — labelled.
  if (t.error) return { status: 'reconnecting', stale: true };
  return { status: 'ready', stale: t.fromCache };
}

// ── Live phase ──────────────────────────────────────────────────────────────

export type LivePhase =
  | 'loading'
  | 'unavailable'
  | 'denied'
  | 'reconnecting'
  | 'waitingStart'
  | 'questionLoading'
  | 'question'
  | 'interval'
  | 'ended';

export interface LiveTournamentLike extends HasState {
  currentQuestion: { index: number; opensAt: number; closesAt: number } | null;
}

export interface LiveQuestionLike {
  index: number;
  state: 'pending' | 'open' | 'closed';
  closesAt: number;
}

export interface LivePhaseView {
  phase: LivePhase;
  /** Some of what is on screen is last-known rather than current. */
  stale: boolean;
  /** A tap now would be sent to the server (the server still decides). */
  answerable: boolean;
}

const ENDED: ArenaState[] = ['grading', 'provisional', 'final'];

export function deriveLivePhase<T extends LiveTournamentLike, Q extends LiveQuestionLike>(
  t: LiveSource<T>,
  q: LiveSource<Q>,
  now: number,
): LivePhaseView {
  const base = deriveEventStatus(t);
  if (base.status === 'loading' || base.status === 'unavailable' || base.status === 'denied') {
    return { phase: base.status, stale: false, answerable: false };
  }
  // No tournament document at all, only a failed listener.
  if (!t.data) return { phase: 'reconnecting', stale: false, answerable: false };

  const tour = t.data;
  const tStale = base.stale;

  if (ENDED.includes(tour.state)) return { phase: 'ended', stale: tStale, answerable: false };
  if (tour.state !== 'live') {
    // draft / registration / doors: the room is not playing yet.
    return { phase: 'waitingStart', stale: tStale, answerable: false };
  }

  const cq = tour.currentQuestion;
  // `live` with nothing on the clock is the server between questions or
  // between rounds — a genuine interval, not a fault.
  if (!cq) return { phase: tStale ? 'reconnecting' : 'interval', stale: tStale, answerable: false };

  const question = q.data && q.data.index === cq.index ? q.data : null;

  if (!question) {
    // The tournament names a question we have not received. Never an
    // interval: the window may be open right now.
    if (q.error || (q.fromCache && !q.loading)) return { phase: 'reconnecting', stale: true, answerable: false };
    return { phase: 'questionLoading', stale: tStale, answerable: false };
  }

  const stale = tStale || q.error || q.fromCache;

  if (question.state === 'pending') return { phase: 'questionLoading', stale, answerable: false };
  if (question.state === 'open' && now < question.closesAt) {
    // The prompt and options do not change once open, and answers travel by
    // API rather than this listener, so a stale-but-open question is still
    // worth answering. The label says the connection is shaky; the receipt
    // says whether the tap landed.
    return { phase: 'question', stale, answerable: true };
  }
  // Open past its close (the reveal is on its way) or closed: the interval.
  return { phase: 'interval', stale, answerable: false };
}

/** True for the phases that are a fault rather than a moment of the event. */
export function isFaultPhase(phase: LivePhase | EventStatus): boolean {
  return phase === 'unavailable' || phase === 'denied' || phase === 'reconnecting';
}
