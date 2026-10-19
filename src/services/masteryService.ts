/**
 * masteryService — per-lesson mastery persistence for the web app.
 *
 * The mastery ladder (see /shared/mastery.ts) needs one record per lesson:
 * `{ completed, bestPct, masteredAt, levelUpAt }`. The web already stored
 * `completedLessons: string[]` on the per-course progress doc, which is enough
 * for the `seen` rung and nothing above it — so the three earned rungs were
 * unreachable no matter what the UI drew.
 *
 * WHERE IT LIVES: `users/{uid}/mastery/lessons`, THE SAME DOCUMENT THE MOBILE
 * APP ALREADY WRITES (mobile/src/services/masterySync.ts). This matters more
 * than it looks. Mastery is meant to be one claim about a student, and most of
 * them use both surfaces — the phone at home, a browser at school. Had the web
 * kept its own store (the obvious choice: a `lessons` map on the per-course
 * progress doc it already reads), a lesson practised on the web would be
 * invisible on the phone and vice versa, and the two would disagree forever
 * without ever erroring.
 *
 *   users/{uid}/mastery/lessons.lessons = {
 *     [lessonId]: { completed?, bestPct?, masteredAt?, levelUpAt? }
 *   }
 *
 * ONE document for ALL courses, keyed by the globally unique lesson id
 * (`CHEM-NSI-U1-L2`) — mobile's reasoning holds here too: a student has a few
 * hundred lessons, each a handful of numbers, so the whole map is tens of KB
 * against a 1 MB limit, and it costs one read instead of N.
 *
 * `completed` is NOT migrated out of `completedLessons`: that array is still
 * what earns `seen`, so existing students keep the progress they have, and
 * `toProgressMap` folds the two sources back together on read.
 *
 * Writes are read-modify-write, but safely: the promotion rules are monotonic
 * (a record only ever improves) and the write touches ONLY the lesson that
 * changed via a merge, so a stale read can't roll back another device's work.
 *
 * And transactionally (P0 validation L-9, L-10): the read and the write run in
 * one Firestore transaction, so a phone writing the same lesson between our
 * read and our write makes the transaction retry against its value instead of
 * being joined with a stale one. A transaction needs the server; when it fails
 * (offline, a token error) the score is NOT dropped any more: it is queued in
 * the write outbox (services/writeOutbox) and replayed through the same
 * transaction at sign-in / reconnect. A blind merge write is never used: a
 * field merge could lower `bestPct`.
 */

import { doc, getDoc, runTransaction } from 'firebase/firestore';
import { db } from './firebase';
import {
  applyExerciseScore,
  applyChapterTestResult,
  type LessonProgress,
  type ProgressMap,
} from '../../shared/mastery';
import { mergeLesson, toWireFormat, MASTERY_PATH } from '../../shared/masteryMerge';
import { queueForReplay, registerOutboxHandler } from './writeOutbox';

/** The one mastery document, shared with the mobile app. */
function masteryDoc(userId: string) {
  return doc(db, 'users', userId, MASTERY_PATH.collection, MASTERY_PATH.doc);
}

/**
 * Fold the two sources into the shape the shared model expects.
 * `lessons` is the mastery doc's map; `completedLessons` is the legacy array
 * off a course's progress doc. Order matters: `completed` is merged IN, never
 * written over a record, or a watched video would flatten a 100% score.
 */
export function toProgressMap(sources: any): ProgressMap {
  const out: ProgressMap = {};
  const lessons = sources?.lessons || {};
  for (const [lessonId, rec] of Object.entries(lessons)) {
    if (rec && typeof rec === 'object') out[lessonId] = { ...(rec as LessonProgress) };
  }
  for (const lessonId of sources?.completedLessons || []) {
    out[lessonId] = { ...(out[lessonId] || {}), completed: true };
  }
  return out;
}

/**
 * A read that says whether it worked. The plain readers below return `{}` on
 * failure, which a surface cannot tell apart from "nothing earned yet" — so a
 * failed read used to render as a fresh start. Learning-journey surfaces use
 * these and show their failed + retry state on `error`.
 *
 * A read served from Firestore's offline cache is `ok`: it is the student's
 * real (if possibly stale) record, not a failure.
 */
export type ReadResult<T> = { status: 'ok'; data: T } | { status: 'error'; data: T; error: unknown };

/** The whole mastery map, with a status. Signed out is `ok` with `{}`. */
export async function readMasteryResult(userId?: string | null): Promise<ReadResult<ProgressMap>> {
  if (!userId) return { status: 'ok', data: {} };
  try {
    const snap = await getDoc(masteryDoc(userId));
    const lessons = snap.exists() ? snap.data()?.lessons : null;
    return { status: 'ok', data: lessons && typeof lessons === 'object' ? toProgressMap({ lessons }) : {} };
  } catch (error) {
    console.warn('[mastery] read failed:', error);
    return { status: 'error', data: {}, error };
  }
}

/** The whole mastery map for a student. `{}` when signed out or unreachable. */
export async function readMastery(userId?: string | null): Promise<ProgressMap> {
  return (await readMasteryResult(userId)).data;
}

/**
 * Every lesson's mastery record, with one course's legacy `completedLessons`
 * folded in so lessons that were only watched still read as `seen` — and a
 * status, so a failed read is not mistaken for an untouched course.
 *
 * The returned map covers ALL courses (it is one document); passing a courseId
 * only decides whose `completed` flags get merged. Callers render by lesson id,
 * so the extra entries are harmless — and it means a caller showing two
 * courses needs one read, not two.
 */
export async function readCourseMasteryResult(
  userId?: string | null,
  courseId?: string | null,
): Promise<ReadResult<ProgressMap>> {
  if (!userId) return { status: 'ok', data: {} };
  try {
    const [masterySnap, progressSnap] = await Promise.all([
      getDoc(masteryDoc(userId)),
      courseId ? getDoc(doc(db, 'users', userId, 'progress', courseId)) : Promise.resolve(null),
    ]);
    return {
      status: 'ok',
      data: toProgressMap({
        lessons: masterySnap.exists() ? masterySnap.data()?.lessons : null,
        completedLessons: progressSnap?.exists() ? progressSnap.data()?.completedLessons : null,
      }),
    };
  } catch (error) {
    console.warn('[mastery] course read failed:', error);
    return { status: 'error', data: {}, error };
  }
}

/** `readCourseMasteryResult` without the status: `{}` when unreachable. */
export async function readCourseMastery(
  userId?: string | null,
  courseId?: string | null,
): Promise<ProgressMap> {
  return (await readCourseMasteryResult(userId, courseId)).data;
}

/**
 * Read the lessons' current records (including the legacy `completed` flag:
 * a lesson at `seen` promotes differently from one at `none`), let `compute`
 * decide what changes, and write ONLY those lessons, all inside one
 * transaction. `merge: true` leaves sibling lessons untouched.
 */
async function transactLessons(
  userId: string,
  courseId: string,
  lessonIds: string[],
  compute: (current: ProgressMap) => Record<string, LessonProgress>,
): Promise<Record<string, LessonProgress>> {
  const masteryRef = masteryDoc(userId);
  const progressRef = doc(db, 'users', userId, 'progress', courseId);
  return runTransaction(db, async (tx) => {
    const masterySnap = await tx.get(masteryRef);
    const progressSnap = await tx.get(progressRef);
    const completed: string[] = progressSnap.exists()
      ? (progressSnap.data()?.completedLessons || [])
      : [];
    const all = toProgressMap({
      lessons: masterySnap.exists() ? masterySnap.data()?.lessons : null,
      completedLessons: completed,
    });
    const current: ProgressMap = {};
    for (const id of lessonIds) current[id] = all[id];
    const changed = compute(current);
    const wire = toWireFormat(changed);
    if (Object.keys(wire).length > 0) tx.set(masteryRef, { lessons: wire }, { merge: true });
    return changed;
  });
}

interface ExercisePayload { courseId: string; lessonId: string; pct: number; at: number }
interface ChapterPayload { courseId: string; perLesson: Record<string, boolean>; at: number }

function exerciseChange(lessonId: string, pct: number, at: number) {
  return (current: ProgressMap): Record<string, LessonProgress> => {
    const next = applyExerciseScore(current[lessonId], pct, at);
    // Join against what the transaction read: only ever an improvement.
    return next ? { [lessonId]: mergeLesson(current[lessonId], next) } : {};
  };
}

function chapterChange(perLesson: Record<string, boolean>, at: number) {
  return (current: ProgressMap): Record<string, LessonProgress> => {
    const changed: Record<string, LessonProgress> = {};
    for (const [lessonId, allCorrect] of Object.entries(perLesson)) {
      const next = applyChapterTestResult(current[lessonId], allCorrect, at);
      if (next) changed[lessonId] = mergeLesson(current[lessonId], next);
    }
    return changed;
  };
}

// Replays of writes a failed transaction queued (same timestamps as the
// original attempt, so `levelUpAt` / `masteredAt` say when it was earned).
registerOutboxHandler('mastery-exercise', async (op) => {
  const p = op.payload as ExercisePayload;
  if (!p?.courseId || !p?.lessonId || typeof p.pct !== 'number') return 'drop';
  await transactLessons(op.uid, p.courseId, [p.lessonId], exerciseChange(p.lessonId, p.pct, p.at || op.createdAt));
  return 'done';
});
registerOutboxHandler('mastery-chapter', async (op) => {
  const p = op.payload as ChapterPayload;
  const ids = Object.keys(p?.perLesson || {});
  if (!p?.courseId || ids.length === 0) return 'drop';
  await transactLessons(op.uid, p.courseId, ids, chapterChange(p.perLesson, p.at || op.createdAt));
  return 'done';
});

/**
 * Record an exercise score for ONE lesson. Only ever improves the lesson:
 * the promotion rules live in the shared model, so web and mobile agree on
 * what a score is worth. No-ops when the score doesn't beat the record, so a
 * repeat attempt costs no write. When the transaction can't run (offline), the
 * score is queued for replay instead of being dropped.
 */
export async function recordLessonExercise(
  userId: string | null | undefined,
  courseId: string | null | undefined,
  lessonId: string | null | undefined,
  pct: number,
): Promise<LessonProgress | null> {
  if (!userId || !courseId || !lessonId) return null;
  const at = Date.now();
  try {
    const changed = await transactLessons(userId, courseId, [lessonId], exerciseChange(lessonId, pct, at));
    return changed[lessonId] ?? null;
  } catch (err) {
    console.warn('[mastery] exercise score queued for retry:', err);
    const payload: ExercisePayload = { courseId, lessonId, pct, at };
    await queueForReplay(userId, 'mastery-exercise', payload);
    return null;
  }
}

/**
 * Promote the lessons a chapter test just confirmed. The test draws from the
 * whole unit, which is exactly why passing it is what earns `mastered` — a
 * lesson can't reach the top by grinding its own exercise set.
 *
 * `perLesson` maps lessonId -> was every question from that lesson correct.
 * A miss never demotes (see the shared model's note on why). Returns how many
 * lessons actually moved.
 */
export async function recordChapterTest(
  userId: string | null | undefined,
  courseId: string | null | undefined,
  perLesson: Record<string, boolean>,
): Promise<number> {
  if (!userId || !courseId) return 0;
  const entries = Object.entries(perLesson || {});
  if (entries.length === 0) return 0;
  const at = Date.now();
  try {
    const changed = await transactLessons(userId, courseId, entries.map(([id]) => id), chapterChange(perLesson, at));
    return Object.keys(changed).length;
  } catch (err) {
    console.warn('[mastery] chapter test queued for retry:', err);
    const payload: ChapterPayload = { courseId, perLesson, at };
    await queueForReplay(userId, 'mastery-chapter', payload);
    return 0;
  }
}
