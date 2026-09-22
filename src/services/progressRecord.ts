/**
 * progressRecord — the arithmetic behind the printable progress record (/releve).
 *
 * The record page is a new VIEW over figures the app already holds; nothing
 * here computes a new claim about a student. It exists as a separate, pure
 * module for one reason: every number that ends up on a sheet somebody hands
 * to a head teacher has to be testable without a browser or a Firestore.
 *
 * THE TWO SOURCES, AND WHY THEY ARE NOT INTERCHANGEABLE
 * ─────────────────────────────────────────────────────
 * 1. `users/{uid}/progress/{courseId}` — ONE DOCUMENT PER COURSE, carrying
 *    `completedLessons: string[]`, `totalPoints` and `badges`. "Lessons
 *    completed" is a SUM across those documents, never a single field.
 * 2. `users/{uid}/mastery/lessons` — ONE document for ALL courses, shared with
 *    the mobile app, read through masteryService (`readMastery`) and
 *    aggregated with the shared model (`summarize`).
 *
 * Mastery is NEVER derived from source 1. `completedLessons` can only ever
 * prove the `seen` rung, so deriving mastery from it would silently cap every
 * lesson at 25/100 and render a student who has passed chapter tests as if
 * they had never earned anything. The two sources answer different questions —
 * "how much have I been through" and "how well do I know it" — and this module
 * keeps them in separate fields for exactly that reason.
 *
 * WHAT THIS MODULE REFUSES TO COMPUTE, deliberately: no grade, no average, no
 * mark out of 20, no "mention", no Bac prediction, no rank or percentile, no
 * study time. The app measures none of those, so no function here can be asked
 * for one by mistake.
 */

import { summarize, type MasterySummary, type ProgressMap } from '../../shared/mastery';

/** The shape `getAllUserProgress` returns: one entry per course document. */
export interface CourseProgressDoc {
  courseId: string;
  completedLessons?: string[];
  totalPoints?: number;
  badges?: string[];
}

/** The catalog shape `useCourses()` yields (dataService.transformFirestoreCourses). */
export interface CatalogCourse {
  id: string;
  name?: string;
  level?: string;
  subject?: string;
  modules?: Array<{ id?: string; title?: string; lessons?: Array<{ id?: string }> }>;
}

export interface UnitRecord {
  unitId: string;
  title: string;
  /** Mastery over this unit's lessons, from the shared mastery document. */
  mastery: MasterySummary;
}

export interface CourseRecord {
  courseId: string;
  /** The catalog name, or the raw course id when the catalog has no entry. */
  name: string;
  level: string;
  subject: string;
  /** Distinct lesson ids in this course's `completedLessons`. */
  lessonsCompleted: number;
  /** Lessons the catalog lists for this course; 0 when it is unknown. */
  lessonTotal: number;
  points: number;
  badges: string[];
  /** Units that have at least one lesson. Empty when the catalog is missing. */
  units: UnitRecord[];
  /** Mastery over every lesson of the course. */
  mastery: MasterySummary;
  /** True when the catalog has no entry for this course id. */
  unknownCourse: boolean;
}

/**
 * Lessons finished in ONE course document.
 *
 * Deduplicated: `completedLessons` is appended to by both platforms, and a
 * lesson that got written twice must not be counted twice on a document
 * somebody reads as a record. (The Profil page takes the raw array length;
 * the difference is zero unless the data is already wrong.)
 */
export function lessonsCompletedIn(doc: CourseProgressDoc | null | undefined): number {
  const ids = doc?.completedLessons;
  if (!Array.isArray(ids)) return 0;
  return new Set(ids.filter((id) => typeof id === 'string' && id !== '')).size;
}

/** Lessons finished across every course document. A sum, not a field. */
export function totalLessonsCompleted(docs: CourseProgressDoc[] | null | undefined): number {
  return (docs || []).reduce((n, d) => n + lessonsCompletedIn(d), 0);
}

/** Every lesson id of a catalog course, in catalog order (quizzes included). */
export function courseLessonIdsOf(course: CatalogCourse | null | undefined): string[] {
  const units = Array.isArray(course?.modules) ? course!.modules! : [];
  return units.flatMap((u) =>
    (Array.isArray(u?.lessons) ? u.lessons : []).map((l) => l?.id).filter(Boolean) as string[],
  );
}

/**
 * One record row per course the student has actually touched.
 *
 * A course with no progress document is left out entirely — the record states
 * what was done, and listing every catalog course with a row of zeros would
 * turn a student's work into a list of what they have not done.
 *
 * Sorted by lessons finished, then by name, so the fullest course leads.
 */
export function buildCourseRecords(
  docs: CourseProgressDoc[] | null | undefined,
  courses: CatalogCourse[] | null | undefined,
  mastery: ProgressMap,
): CourseRecord[] {
  const byId = new Map<string, CatalogCourse>();
  for (const c of courses || []) if (c?.id) byId.set(String(c.id), c);

  const rows: CourseRecord[] = [];
  for (const doc of docs || []) {
    if (!doc?.courseId) continue;
    const course = byId.get(String(doc.courseId));
    const lessonIds = courseLessonIdsOf(course);
    const units: UnitRecord[] = (course?.modules || [])
      .map((u, i) => {
        const ids = (Array.isArray(u?.lessons) ? u.lessons : [])
          .map((l) => l?.id)
          .filter(Boolean) as string[];
        return {
          unitId: String(u?.id || `u${i + 1}`),
          title: String(u?.title || ''),
          mastery: summarize(ids, mastery),
        };
      })
      .filter((u) => u.mastery.total > 0);

    rows.push({
      courseId: String(doc.courseId),
      name: String(course?.name || doc.courseId),
      level: String(course?.level || ''),
      subject: String(course?.subject || ''),
      lessonsCompleted: lessonsCompletedIn(doc),
      lessonTotal: lessonIds.length,
      points: typeof doc.totalPoints === 'number' ? doc.totalPoints : 0,
      badges: Array.isArray(doc.badges) ? doc.badges.filter(Boolean) : [],
      units,
      mastery: summarize(lessonIds, mastery),
      unknownCourse: !course,
    });
  }

  return rows.sort(
    (a, b) => b.lessonsCompleted - a.lessonsCompleted || a.name.localeCompare(b.name),
  );
}

/**
 * Quiz accuracy as a whole percent, or `null` when no question has been
 * answered. `null` is not 0%: a student who has never taken a quiz has no
 * accuracy, and printing "0 %" beside their name would be a false statement.
 */
export function quizAccuracy(
  totalCorrect: number | null | undefined,
  totalQuestions: number | null | undefined,
): number | null {
  const asked = typeof totalQuestions === 'number' ? totalQuestions : 0;
  if (asked <= 0) return null;
  const right = typeof totalCorrect === 'number' ? totalCorrect : 0;
  return Math.round((Math.max(0, Math.min(right, asked)) / asked) * 100);
}

/**
 * Does this student have anything at all to put on a record?
 *
 * Used to decide between the sheet and an honest "nothing recorded yet"
 * message. Mastery counts here even with no completed lessons: a lesson can be
 * practised on the phone without the web's `completedLessons` ever hearing.
 */
export function hasAnythingToRecord(input: {
  lessons: number;
  courses: CourseRecord[];
  quizQuestions: number;
  exams: number;
  streakBest: number;
}): boolean {
  return (
    input.lessons > 0
    || input.quizQuestions > 0
    || input.exams > 0
    || input.streakBest > 0
    || input.courses.some((c) => c.mastery.started > 0)
  );
}
