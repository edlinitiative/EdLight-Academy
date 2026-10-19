/**
 * writeOutbox — the phone's persisted queue for writes that must survive an
 * app kill (P0 validation L-3, O-3, D-3).
 * ─────────────────────────────────────────────────────────────────────────
 * React Native Firestore keeps queued writes in MEMORY only, so a lesson
 * completed offline was lost when the app was killed, and a leaderboard award
 * whose POST failed was never retried. Both now go through this outbox
 * (shared/outbox.ts, stored in AsyncStorage, one list per account):
 *
 *   lesson-complete  { courseId, lessonId }   replays confirmLessonComplete
 *                    (arrayUnion — repeat-safe). The op id is deterministic per
 *                    lesson, so completing twice queues once.
 *   xp-award         award body + opId         re-POSTs /api/leaderboard/award;
 *                    the server applies each opId once (duplicate → done).
 *
 * Replayed at sign-in (App.tsx) and on reconnect / foreground
 * (lifecycle/queryLifecycle.ts), only for the account that queued them and
 * only while that account is the one signed in. An operation leaves the queue
 * only when the server confirmed it (or rejected it for good).
 *
 * LJ-05 stays intact: the lesson screen shows a queued completion as pending
 * (`pendingLessonIds`) and celebrates only when the replay is confirmed
 * (`subscribeLessonConfirmed`).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from './firebase';
import { confirmLessonComplete } from './progressTracking';
import useStore from '../contexts/store';
import {
  classifyHttpStatus,
  createOutbox,
  newOperationId,
  type OutboxHandlers,
  type OutboxOp,
  type OutboxResult,
} from '../../../shared/outbox';
import { settleWithin } from '../../../shared/examDraft';

export const AWARD_URL = 'https://academy.edlight.org/api/leaderboard/award';
/** A replayed completion that has not settled by then is left for next time. */
const REPLAY_SETTLE_MS = 15_000;
/** A completion refused this many times (rules, bad ids) is given up on. */
const MAX_REPLAYS = 20;

export const outbox = createOutbox(AsyncStorage as any, { prefix: 'edlight:outbox', maxOps: 60 });

export interface LessonCompletePayload { courseId: string; lessonId: string }

export const lessonOpId = (courseId: string, lessonId: string) =>
  `lesson:${courseId}:${lessonId}`.replace(/[^A-Za-z0-9_:.-]/g, '_').slice(0, 200);

// ── Lesson completion ──────────────────────────────────────────────────────

type LessonListener = (e: { uid: string; courseId: string; lessonId: string; result: 'confirmed' | 'retry' }) => void;
const lessonListeners = new Set<LessonListener>();
/** Completions whose original write is still in flight in THIS session. */
const inflight = new Set<string>();

/**
 * Every NEWLY saved completion — the direct write or a replay — for the plan
 * (services/planEvents marks the matching video task done).
 */
type CompletedListener = (e: { uid: string; courseId: string; lessonId: string }) => void;
const completedListeners = new Set<CompletedListener>();
export function subscribeLessonCompleted(fn: CompletedListener): () => void {
  completedListeners.add(fn);
  return () => { completedListeners.delete(fn); };
}
function emitCompleted(e: Parameters<CompletedListener>[0]) {
  completedListeners.forEach((fn) => { try { fn(e); } catch { /* ignore */ } });
}

export function subscribeLessonOutbox(fn: LessonListener): () => void {
  lessonListeners.add(fn);
  return () => { lessonListeners.delete(fn); };
}

function emitLesson(e: Parameters<LessonListener>[0]) {
  lessonListeners.forEach((fn) => { try { fn(e); } catch { /* a screen's problem */ } });
}

/** Mirror a confirmed completion into the store — only for the same account. */
function applyLocally(uid: string, lessonId: string) {
  const s = useStore.getState() as any;
  if (s?.user?.uid !== uid) return;
  try { s.updateProgress?.(lessonId, { completed: true }); } catch { /* ignore */ }
}

/**
 * The durable "Terminer la leçon": queue first (so a kill can't lose it), then
 * the same honest write as before. Resolves only on the server ack, exactly
 * like `confirmLessonComplete`; a throw leaves the operation queued for replay.
 */
export async function completeLessonDurably(uid: string, courseId: string, lessonId: string): Promise<'saved' | 'already'> {
  const id = lessonOpId(courseId, lessonId);
  const key = `${uid}|${id}`;
  await outbox.enqueue<LessonCompletePayload>(uid, { id, kind: 'lesson-complete', payload: { courseId, lessonId } });
  inflight.add(key);
  try {
    const outcome = await confirmLessonComplete(uid, courseId, lessonId);
    await outbox.remove(uid, id);
    if (outcome === 'saved') emitCompleted({ uid, courseId, lessonId });
    return outcome;
  } finally {
    inflight.delete(key);
  }
}

/** Lessons of this course still waiting for a confirmed save (for LJ-05 UI). */
export async function pendingLessonIds(uid: string | null | undefined, courseId: string | null | undefined): Promise<string[]> {
  if (!uid || !courseId) return [];
  const ops = await outbox.list(uid);
  return ops
    .filter((o) => o.kind === 'lesson-complete' && (o.payload as LessonCompletePayload)?.courseId === courseId)
    .map((o) => (o.payload as LessonCompletePayload).lessonId);
}

async function replayLesson(op: OutboxOp): Promise<OutboxResult> {
  const p = op.payload as LessonCompletePayload;
  if (!p?.courseId || !p?.lessonId) return 'drop';
  if (auth.currentUser?.uid !== op.uid) return 'retry'; // never into another account
  // The original write is still pending in this session: let it finish
  // (replaying now could award the lesson's points twice).
  const key = `${op.uid}|${op.id}`;
  if (inflight.has(key)) return 'retry';
  if ((op.attempts || 0) >= MAX_REPLAYS) return 'drop';
  inflight.add(key);
  const write = confirmLessonComplete(op.uid, p.courseId, p.lessonId);
  write.then(() => inflight.delete(key), () => inflight.delete(key));
  const settled = await settleWithin(write, REPLAY_SETTLE_MS);
  if (settled.status === 'confirmed') {
    applyLocally(op.uid, p.lessonId);
    if (settled.value === 'saved') emitCompleted({ uid: op.uid, courseId: p.courseId, lessonId: p.lessonId });
    emitLesson({ uid: op.uid, courseId: p.courseId, lessonId: p.lessonId, result: 'confirmed' });
    return 'done';
  }
  emitLesson({ uid: op.uid, courseId: p.courseId, lessonId: p.lessonId, result: 'retry' });
  return 'retry';
}

// ── Leaderboard XP award ───────────────────────────────────────────────────

async function postAwardOnce(uid: string, payload: Record<string, unknown>): Promise<OutboxResult> {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) return 'retry'; // never into another account
  let token: string;
  try {
    token = await user.getIdToken();
  } catch {
    return 'retry';
  }
  const res = await fetch(AWARD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const result = classifyHttpStatus(res.status);
  if (result !== 'done') console.error('[Leaderboard] award endpoint returned', res.status);
  return result;
}

/**
 * Award XP durably: queued with a client operation id, POSTed now, and kept
 * for replay if that fails. The server dedupes by opId, so a retry after a
 * lost response never awards twice. Never throws (gameplay must not crash).
 */
export async function awardXpDurably(uid: string, payload: Record<string, unknown>): Promise<void> {
  if (!uid) return;
  const opId = newOperationId();
  const body = { ...payload, opId };
  try {
    await outbox.enqueue(uid, { id: opId, kind: 'xp-award', payload: body });
  } catch { /* storage unavailable: still try the POST once */ }
  let result: OutboxResult;
  try {
    result = await postAwardOnce(uid, body);
  } catch (err) {
    console.error('[Leaderboard] postAward error:', err);
    result = 'retry';
  }
  if (result !== 'retry') await outbox.remove(uid, opId).catch(() => undefined);
}

// ── Replay ─────────────────────────────────────────────────────────────────

/**
 * Replay everything this account queued. Safe to call often: concurrent calls
 * join, and it does nothing unless `uid` is the signed-in account.
 */
const handlers: OutboxHandlers = {
  'lesson-complete': replayLesson,
  'xp-award': (op) => postAwardOnce(op.uid, op.payload as Record<string, unknown>),
};

/** Another service queues its own kind of write and registers its replay. */
export function registerOutboxHandler(kind: string, handler: OutboxHandlers[string]): void {
  handlers[kind] = async (op) => {
    if (auth.currentUser?.uid !== op.uid) return 'retry'; // never into another account
    return handler(op);
  };
}

/** Keep a write that could not reach the server for the next drain. */
export async function queueForReplay(uid: string, kind: string, payload: unknown, id?: string): Promise<void> {
  if (!uid) return;
  await outbox.enqueue(uid, { id, kind, payload }).catch(() => null);
}

export async function drainWriteOutbox(uid: string | null | undefined): Promise<void> {
  if (!uid || auth.currentUser?.uid !== uid) return;
  try {
    await outbox.drain(uid, handlers);
  } catch {
    /* next launch / reconnect tries again */
  }
}
