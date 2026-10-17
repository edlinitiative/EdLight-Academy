/**
 * homeJourney — the pure evidence facts behind Home, the Cours tab and the
 * course page (PRD LJ-01, LJ-02, LJ-10). Mobile port of the web's
 * src/components/journey/home/homeJourney.ts.
 *
 * Sources, and only these:
 *   - catalogue   course.modules[].lessons[] (ids, titles, units)
 *   - mastery     the store `progress` map = users/{uid}/mastery/lessons, the
 *                 ONE doc shared with the web (never derived from the
 *                 per-course progress doc — see memory mastery-storage)
 *   - completion  optionally, users/{uid}/progress/{courseId}.completedLessons
 *                 (what the web and confirmLessonComplete write). It can only
 *                 ever prove `completed`, never practice or mastery.
 *
 * Nothing is inferred beyond them: no weakness, no streak, no blended score.
 * The three counts are independent statements over the same denominator.
 */
import type { ProgressMap } from '../../../utils/mastery';
import type { Evidence } from '../../../utils/learningJourney';

/** Store grade codes the video catalogue covers. */
export const GRADE_TO_LEVEL: Record<string, string> = {
  NS1: 'NSI', NS2: 'NSII', NS3: 'NSIII', NS4: 'NSIV',
};
export const COVERED_LEVELS = ['NSI', 'NSII', 'NSIII', 'NSIV'];
export const LEVEL_LABEL: Record<string, string> = {
  NSI: 'NS I', NSII: 'NS II', NSIII: 'NS III', NSIV: 'NS IV',
};
/** Grades whose class has no video courses: what to offer instead, labelled. */
export const UNCOVERED_SUGGESTION_LEVEL: Record<string, string> = {
  '7e': 'NSI', '8e': 'NSI', '9e': 'NSI', POSTBAC: 'NSIV',
};
export const SUBJECT_ORDER = ['MATH', 'PHYS', 'CHEM', 'SVT', 'ECON', 'FR', 'EN'];

export type LessonRef = {
  course: any;
  unit: any;
  unitIndex: number;
  lesson: any;
  /** Position in the whole course, reading order. */
  index: number;
};

/** Every lesson of a course in reading order, with its unit. */
export function flatLessons(course: any): LessonRef[] {
  const out: LessonRef[] = [];
  const units = Array.isArray(course?.modules) ? course.modules : [];
  units.forEach((unit: any, unitIndex: number) => {
    (unit?.lessons || []).forEach((lesson: any) => {
      if (lesson?.id) out.push({ course, unit, unitIndex, lesson, index: out.length });
    });
  });
  return out;
}

/** The lesson ids a progress document proves completed. */
export function completedSetOf(progressDoc: any): Set<string> {
  return new Set<string>(Array.isArray(progressDoc?.completedLessons) ? progressDoc.completedLessons : []);
}

/** courseId → completed lesson ids, from `useAllProgress()` rows. */
export function completedByCourse(rows: any[] | null | undefined): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const r of rows || []) if (r?.courseId) m.set(String(r.courseId), completedSetOf(r));
  return m;
}

/**
 * The strongest evidence a lesson has, in the shared EVIDENCE vocabulary.
 * `mastered` needs the chapter test (masteredAt); a practice score is
 * `practised`; a completion flag (either source) is `completed`. A finished
 * video is never more than `completed`. The mastery map holds no "opened"
 * record on mobile, so nothing here returns `opened`.
 */
export function lessonEvidence(
  lessonId: string,
  mastery: ProgressMap,
  completed?: Set<string> | null,
): Evidence | null {
  const rec = mastery?.[lessonId];
  if (rec?.masteredAt) return 'mastered';
  if (typeof rec?.bestPct === 'number') return 'practised';
  if (rec?.completed || completed?.has(lessonId)) return 'completed';
  return null;
}

export const isDone = (e: Evidence | null) => e === 'completed' || e === 'practised' || e === 'mastered';

export type EvidenceSummary = {
  total: number;
  /** Lessons whose completion is recorded ("Terminée"). Practised/mastered lessons count too. */
  completed: number;
  /** Lessons with a recorded practice score. */
  practised: number;
  /** Lessons confirmed by a chapter test. */
  mastered: number;
};

/**
 * Independent facts over one real denominator. They are NOT summed or
 * averaged: "6 terminées · 2 maîtrisées" are two statements. A lesson with a
 * practice score or mastery was necessarily worked on, so it also counts as
 * completed (the web counts only the flag; on mobile the flag was never
 * written before LJ-05, so practice is the stronger proof of the same fact).
 */
export function summarizeLessons(lessonIds: string[], mastery: ProgressMap, completed?: Set<string> | null): EvidenceSummary {
  const s: EvidenceSummary = { total: lessonIds.length, completed: 0, practised: 0, mastered: 0 };
  for (const id of lessonIds) {
    const e = lessonEvidence(id, mastery, completed);
    if (isDone(e)) s.completed += 1;
    const rec = mastery?.[id];
    if (typeof rec?.bestPct === 'number' || rec?.masteredAt) s.practised += 1;
    if (rec?.masteredAt) s.mastered += 1;
  }
  return s;
}

export function summarizeCourse(course: any, mastery: ProgressMap, completed?: Set<string> | null): EvidenceSummary {
  return summarizeLessons(flatLessons(course).map((r) => r.lesson.id), mastery, completed);
}

export const touched = (s: EvidenceSummary) => s.completed + s.practised + s.mastered > 0;

/**
 * The Home progress block: the courses the student has real evidence in,
 * scoped to their class when it has courses (other levels only when that is
 * where the evidence is), most-worked first. Empty = render nothing.
 */
export function progressCourses(input: {
  courses: any[] | null | undefined;
  mastery: ProgressMap;
  completedByCourse?: Map<string, Set<string>>;
  grade?: string | null;
  limit?: number;
}): { course: any; summary: EvidenceSummary }[] {
  const level = input.grade ? GRADE_TO_LEVEL[input.grade] : undefined;
  const rows = (input.courses || [])
    .filter((c) => c && !c.comingSoon)
    .map((course) => ({ course, summary: summarizeCourse(course, input.mastery, input.completedByCourse?.get(course.id)) }))
    .filter((r) => touched(r.summary));
  rows.sort((a, b) => {
    const mine = Number(b.course.level === level) - Number(a.course.level === level);
    if (mine) return mine;
    return (b.summary.completed + b.summary.practised + b.summary.mastered)
      - (a.summary.completed + a.summary.practised + a.summary.mastered);
  });
  return rows.slice(0, input.limit ?? 3);
}

/** "6/22 terminées · 2 pratiquées · 1 maîtrisée" — zero facts after the first are dropped. */
export function evidenceLine(s: EvidenceSummary, isCreole: boolean): string {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const pl = (n: number, fr: string) => (isCreole ? '' : n > 1 ? fr : '');
  const parts = [`${s.completed}/${s.total} ${t(`terminée${pl(s.completed, 's')}`, 'fini')}`];
  if (s.practised > 0) parts.push(`${s.practised} ${t(`pratiquée${pl(s.practised, 's')}`, 'pratike')}`);
  if (s.mastered > 0) parts.push(`${s.mastered} ${t(`maîtrisée${pl(s.mastered, 's')}`, 'metrize')}`);
  return parts.join(' · ');
}

/** Where a lesson sits: "Chapitre 2 · Unit title". */
export function locateLesson(course: any, lessonId: string | null | undefined): LessonRef | null {
  if (!lessonId) return null;
  return flatLessons(course).find((r) => r.lesson.id === lessonId) || null;
}

/**
 * The one start/resume target of a course page (LJ-03), on the same rules as
 * Home: the lesson the student was in if unfinished; else the first lesson
 * without completion evidence; else the first not yet mastered; else lesson 1.
 */
export function courseStartTarget(
  course: any,
  mastery: ProgressMap,
  completed?: Set<string> | null,
  lastLessonId?: string | null,
): { ref: LessonRef; started: boolean; reason: 'resume' | 'next' | 'start' } | null {
  const all = flatLessons(course);
  if (all.length === 0) return null;
  const ev = (id: string) => lessonEvidence(id, mastery, completed);
  const started = all.some((r) => ev(r.lesson.id) !== null) || !!(lastLessonId && all.some((r) => r.lesson.id === lastLessonId));
  if (lastLessonId) {
    const at = all.find((r) => r.lesson.id === lastLessonId);
    if (at && !isDone(ev(at.lesson.id))) return { ref: at, started: true, reason: 'resume' };
  }
  const unfinished = all.find((r) => !isDone(ev(r.lesson.id)));
  if (unfinished) return { ref: unfinished, started, reason: started ? 'next' : 'start' };
  const unmastered = all.find((r) => ev(r.lesson.id) !== 'mastered');
  return { ref: unmastered || all[0], started, reason: 'next' };
}
