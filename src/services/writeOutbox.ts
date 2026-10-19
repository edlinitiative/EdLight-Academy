/**
 * writeOutbox (web) — retry queue for leaderboard XP awards (P0 validation D-3).
 * ─────────────────────────────────────────────────────────────────────────
 * A failed POST /api/leaderboard/award used to be logged and forgotten, so the
 * board drifted from profile XP. Awards now carry a client operation id and
 * sit in a localStorage outbox (shared/outbox.ts, one list per account) until
 * the server confirms them. They are replayed at sign-in (src/index.tsx), on
 * the browser's `online` event and after every successful award. The server
 * applies each opId once, so a retry after a lost response never double-awards.
 *
 * Lesson completion on the web needs no outbox: Firestore's persistent cache
 * (multi-tab) already survives a tab close (O-2). Transactional writes are
 * different — a transaction needs the server, so offline it fails outright.
 * Mastery and study-plan updates (L-9, P-4) run as transactions and, when one
 * fails, queue themselves here (`queueForReplay`) under a kind whose handler
 * the owning service registers (`registerOutboxHandler`).
 */

import { auth, authedFetch } from './firebase';
import {
  classifyHttpStatus,
  newOperationId,
  type OutboxHandlers,
  type OutboxResult,
} from '../../shared/outbox';
import { outbox } from './outboxStore';

export { outbox };

async function postAwardOnce(uid: string, body: Record<string, unknown>): Promise<OutboxResult> {
  if (!uid || auth.currentUser?.uid !== uid) return 'retry'; // never under another account's token
  const res = await authedFetch('/api/leaderboard/award', body, { timeoutMs: 20_000 });
  const result = classifyHttpStatus(res.status);
  if (result !== 'done') console.error('[Leaderboard] award endpoint returned', res.status);
  return result;
}

const handlers: OutboxHandlers = {
  'xp-award': (op) => postAwardOnce(op.uid, op.payload as Record<string, unknown>),
};

/** A service that queues its own kind of write registers how to replay it. */
export function registerOutboxHandler(kind: string, handler: OutboxHandlers[string]): void {
  handlers[kind] = async (op) => {
    if (auth.currentUser?.uid !== op.uid) return 'retry'; // never into another account
    return handler(op);
  };
}

/** Keep a write that failed (offline transaction) for the next drain. */
export async function queueForReplay(uid: string, kind: string, payload: unknown, id?: string): Promise<void> {
  if (!uid) return;
  installOnlineReplay();
  await outbox.enqueue(uid, { id, kind, payload }).catch(() => null);
}

/** Replay this account's queued writes (no-op unless it is signed in). */
export async function drainWriteOutbox(uid: string | null | undefined): Promise<void> {
  if (!uid || auth.currentUser?.uid !== uid) return;
  // A queue left by an earlier session (drained here at sign-in, possibly while
  // offline) must also be retried on reconnect, not only one queued this session.
  installOnlineReplay();
  try {
    await outbox.drain(uid, handlers);
  } catch { /* next sign-in / reconnect tries again */ }
}

let onlineInstalled = false;
function installOnlineReplay() {
  if (onlineInstalled || typeof window === 'undefined') return;
  onlineInstalled = true;
  window.addEventListener('online', () => { void drainWriteOutbox(auth.currentUser?.uid); });
}

/**
 * Award XP durably. Never throws — an award must never crash gameplay.
 */
export async function awardXpDurably(uid: string, payload: Record<string, unknown>): Promise<void> {
  if (!uid) return;
  installOnlineReplay();
  const opId = newOperationId();
  const body = { ...payload, opId };
  await outbox.enqueue(uid, { id: opId, kind: 'xp-award', payload: body }).catch(() => null);
  let result: OutboxResult;
  try {
    result = await postAwardOnce(uid, body);
  } catch (err) {
    console.error('[Leaderboard] postAward error:', err);
    result = 'retry';
  }
  if (result !== 'retry') {
    await outbox.remove(uid, opId).catch(() => undefined);
    // The network is evidently up: flush anything older that was waiting.
    if (result === 'done') void drainWriteOutbox(uid);
  }
}
