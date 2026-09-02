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
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import {
  applyExerciseScore,
  applyChapterTestResult,
  type LessonProgress,
  type ProgressMap,
} from '../../shared/mastery';
import { mergeLesson, toWireFormat, MASTERY_PATH } from '../../shared/masteryMerge';

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

/** The whole mastery map for a student. `{}` when signed out or unreachable. */
export async function readMastery(userId?: string | null): Promise<ProgressMap> {
  if (!userId) return {};
  try {
    const snap = await getDoc(masteryDoc(userId));
    const lessons = snap.exists() ? snap.data()?.lessons : null;
    return lessons && typeof lessons === 'object' ? toProgressMap({ lessons }) : {};
  } catch {
    return {};
  }
}

/**
 * Every lesson's mastery record, with one course's legacy `completedLessons`
 * folded in so lessons that were only watched still read as `seen`.
 *
 * The returned map covers ALL courses (it is one document); passing a courseId
 * only decides whose `completed` flags get merged. Callers render by lesson id,
 * so the extra entries are harmless — and it means a caller showing two
 * courses needs one read, not two.
 */
export async function readCourseMastery(
  userId?: string | null,
  courseId?: string | null,
): Promise<ProgressMap> {
  if (!userId) return {};
  try {
    const [masterySnap, progressSnap] = await Promise.all([
      getDoc(masteryDoc(userId)),
      courseId ? getDoc(doc(db, 'users', userId, 'progress', courseId)) : Promise.resolve(null),
    ]);
    return toProgressMap({
      lessons: masterySnap.exists() ? masterySnap.data()?.lessons : null,
      completedLessons: progressSnap?.exists() ? progressSnap.data()?.completedLessons : null,
    });
  } catch {
    return {};
  }
}

/**
 * Read the current record for one lesson, including the legacy `completed`
 * flag — the transitions need the level a lesson is actually AT, and a lesson
 * sitting at `seen` because its video was watched promotes differently from
 * one at `none`.
 */
async function readLessonRecord(
  userId: string,
  courseId: string,
  lessonIds: string[],
): Promise<ProgressMap> {
  const [masterySnap, progressSnap] = await Promise.all([
    getDoc(masteryDoc(userId)),
    getDoc(doc(db, 'users', userId, 'progress', courseId)),
  ]);
  const completed: string[] = progressSnap.exists()
    ? (progressSnap.data()?.completedLessons || [])
    : [];
  const all = toProgressMap({
    lessons: masterySnap.exists() ? masterySnap.data()?.lessons : null,
    completedLessons: completed,
  });
  const out: ProgressMap = {};
  for (const id of lessonIds) out[id] = all[id];
  return out;
}

/**
 * Write back only the lessons that changed. `merge: true` deep-merges the
 * nested map, so sibling lessons — and anything another device wrote between
 * our read and this write — are untouched.
 */
async function writeLessons(userId: string, changed: Record<string, LessonProgress>): Promise<void> {
  const wire = toWireFormat(changed);
  if (Object.keys(wire).length === 0) return;
  await setDoc(masteryDoc(userId), { lessons: wire }, { merge: true });
}

/**
 * Record an exercise score for ONE lesson. Only ever improves the lesson —
 * the promotion rules live in the shared model, so web and mobile agree on
 * what a score is worth. No-ops when the score doesn't beat the record, so a
 * repeat attempt costs no write.
 */
export async function recordLessonExercise(
  userId: string | null | undefined,
  courseId: string | null | undefined,
  lessonId: string | null | undefined,
  pct: number,
): Promise<LessonProgress | null> {
  if (!userId || !courseId || !lessonId) return null;
  try {
    const current = await readLessonRecord(userId, courseId, [lessonId]);
    const next = applyExerciseScore(current[lessonId], pct, Date.now());
    if (!next) return null;
    // Join against what we read, so a concurrent phone write can only ever be
    // improved on, never undone.
    await writeLessons(userId, { [lessonId]: mergeLesson(current[lessonId], next) });
    return next;
  } catch (err) {
    console.warn('[mastery] failed to record exercise score:', err);
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
  try {
    const current = await readLessonRecord(userId, courseId, entries.map(([id]) => id));
    const now = Date.now();
    const changed: Record<string, LessonProgress> = {};
    for (const [lessonId, allCorrect] of entries) {
      const next = applyChapterTestResult(current[lessonId], allCorrect, now);
      if (next) changed[lessonId] = mergeLesson(current[lessonId], next);
    }
    const count = Object.keys(changed).length;
    if (count === 0) return 0;
    await writeLessons(userId, changed);
    return count;
  } catch (err) {
    console.warn('[mastery] failed to record chapter test:', err);
    return 0;
  }
}
