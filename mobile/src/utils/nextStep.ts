/**
 * The next-step engine — what the Home screen's one dominant card should say.
 *
 * The principle it serves: a student opens the app and knows within two seconds
 * what to do. That means Home has to ANSWER "what now?", not list options. This
 * module computes the answer; the card renders it.
 *
 * Priority order, and why:
 *
 *   welcome-back   a week of silence beats everything — the job is re-entry,
 *                  not optimization ("Nou manke w"). When it is a lesson, the
 *                  exact lesson is resolved (`target`) so the card names it.
 *   resume-exam    an exam left mid-run is an explicit open loop (ExamTake
 *                  clears the activity on submit).
 *   lesson/resume  the lesson the student was IN and has not finished
 *                  (learning-journey PRD LJ-01): resume the actual lesson.
 *   review         a pile of missed questions means the next minutes are worth
 *                  more spent fixing than advancing.
 *   lesson         otherwise: the first lesson of the student's current course
 *                  that still has something to earn, with the ACTION that earns
 *                  it (watch → practice → aim 100 → chapter test) — the same
 *                  ladder the Cours tab teaches. Courses come from the last
 *                  activity, enrolment, then any course with saved evidence.
 *   start / class  nothing to resume (only when `grade` is passed): a real
 *                  first lesson for the student's class, or an honest
 *                  "your class has no video courses" / "choose your class" /
 *                  "coming soon" / "all caught up" — never invented progress.
 *
 * Saved state first (audit #5): when the catalogue is unavailable, a lesson
 * activity still resolves from what the store saved (`fromSaved`), so Home
 * keeps its primary action through a course-feed failure.
 *
 * Everything here is pure: state in, recommendation out. No i18n, no
 * navigation — the card owns those.
 */

import { lessonMastery, type ProgressMap, type MasteryLevel } from './mastery';
import type { LastActivity } from '../contexts/store';
import type { Evidence } from './learningJourney';
import {
  GRADE_TO_LEVEL, UNCOVERED_SUGGESTION_LEVEL, SUBJECT_ORDER, flatLessons, lessonEvidence, isDone,
} from '../components/journey/home/homeJourney';

/** Silence long enough that re-entry is the message. */
export const INACTIVE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
/** An exam only reads as "in progress" for a few days. */
export const EXAM_RESUME_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
/** Missed questions worth interrupting the lesson flow for. */
export const REVIEW_NUDGE_THRESHOLD = 3;

export type LessonAction = 'watch' | 'practice' | 'perfect' | 'test';

export type LessonStep = {
  kind: 'lesson';
  courseId: string;
  courseName: string;
  courseColor?: string;
  /** Catalogue level code (NSI…) when known. */
  courseLevel?: string;
  unitTitle?: string;
  /** 0-based chapter index, when the catalogue placed the lesson. */
  unitIndex?: number;
  lessonId: string;
  lessonTitle: string;
  /** Minutes, when the catalog knows it. */
  duration?: number;
  action: LessonAction;
  level: MasteryLevel;
  /** True when the whole course is untouched — "Kòmanse", not "Kontinye". */
  isStart: boolean;
  /**
   * resume: the lesson they were in, unfinished · next: what follows the
   * lesson they were in · recent: next step in a course they worked in ·
   * start: a first lesson for their class (or a labelled other level).
   */
  reason: 'resume' | 'next' | 'recent' | 'start';
  evidence: Evidence | null;
  /** The lesson is from a level that is not the student's class. */
  otherLevel: boolean;
  /** The last lesson they opened no longer exists in the catalogue. */
  staleLink: boolean;
  /** Resolved from saved activity only — the catalogue was unavailable. */
  fromSaved?: boolean;
};

export type NextStep =
  | { kind: 'welcome-back'; resume: LastActivity; target?: LessonStep | null }
  | { kind: 'resume-exam'; resume: LastActivity }
  | { kind: 'review'; dueCount: number }
  | LessonStep
  /** The student's class has no video courses (7e–9e, after the Bac). */
  | { kind: 'uncovered'; grade: string; suggestion: LessonStep | null }
  /** No class chosen yet: offer the choice (skippable), with a real first lesson. */
  | { kind: 'choose-class'; suggestion: LessonStep | null }
  /** A covered class whose courses are not published yet. */
  | { kind: 'level-empty'; level: string }
  /** Every lesson of their class is mastered. */
  | { kind: 'caught-up'; level: string | null }
  | null;

/** What a lesson at this level still has to earn. `null` when nothing. */
function actionFor(level: MasteryLevel): LessonAction | null {
  switch (level) {
    case 'none': return 'watch';
    case 'seen': return 'practice';
    case 'familiar': return 'perfect';
    case 'proficient': return 'test';
    case 'mastered': return null;
  }
}

type Ctx = {
  progress: ProgressMap;
  completed: (courseId: string) => Set<string> | undefined;
  myLevel?: string;
};

/** Mastery level with a progress-doc completion folded in (it proves `seen`). */
function levelOf(ctx: Ctx, courseId: string, lessonId: string): MasteryLevel {
  const rec = ctx.progress[lessonId];
  const done = !!ctx.completed(courseId)?.has(lessonId);
  return lessonMastery(done ? { ...(rec || {}), completed: true } : rec);
}

function build(
  ctx: Ctx, course: any, unit: any, unitIndex: number | undefined, lesson: any,
  action: LessonAction, level: MasteryLevel, reason: LessonStep['reason'],
): LessonStep {
  return {
    kind: 'lesson',
    courseId: course.id,
    courseName: course.name ?? '',
    courseColor: course.color,
    courseLevel: course.level,
    unitTitle: unit?.title,
    unitIndex,
    lessonId: lesson.id,
    lessonTitle: lesson.title ?? '',
    duration: typeof lesson.duration === 'number' ? lesson.duration : undefined,
    action,
    level,
    isStart: false,
    reason,
    evidence: lessonEvidence(lesson.id, ctx.progress, ctx.completed(course.id)),
    otherLevel: !!ctx.myLevel && !!course.level && course.level !== ctx.myLevel,
    staleLink: false,
  };
}

/**
 * The first lesson (course order) with something left to earn, preferring
 * early rungs: a lesson never opened outranks one waiting on its chapter test,
 * because the ladder is climbed front to back.
 */
function pickLesson(ctx: Ctx, course: any, reason: LessonStep['reason'], afterIndex = -1): LessonStep | null {
  const units = Array.isArray(course?.modules) ? course.modules : [];
  let fallback: LessonStep | null = null;
  let picked: LessonStep | null = null;
  let touchedCount = 0;
  let index = -1;

  for (let unitIndex = 0; unitIndex < units.length; unitIndex += 1) {
    const unit = units[unitIndex];
    for (const lesson of unit?.lessons ?? []) {
      if (!lesson?.id) continue;
      index += 1;
      const level = levelOf(ctx, course.id, lesson.id);
      if (level !== 'none') touchedCount += 1;
      const action = actionFor(level);
      if (!action) continue;
      // 'watch'/'practice' are where active learning is — take the first;
      // otherwise remember the first polishing step and keep looking.
      const r: LessonStep['reason'] = reason === 'next' && index <= afterIndex ? 'recent' : reason;
      if (!picked && (action === 'watch' || action === 'practice')) {
        picked = build(ctx, course, unit, unitIndex, lesson, action, level, r);
      } else if (!picked && !fallback) {
        fallback = build(ctx, course, unit, unitIndex, lesson, action, level, r);
      }
    }
  }
  const step: LessonStep | null = picked ?? fallback;
  return step ? { ...step, isStart: touchedCount === 0 } : null;
}

const subjectRank = (c: any) => {
  const i = SUBJECT_ORDER.indexOf(c?.subject);
  return i === -1 ? 99 : i;
};

/** The lesson activity resolved from what the store saved (catalogue unavailable). */
function fromSavedActivity(ctx: Ctx, a: LastActivity): LessonStep | null {
  if (a.type !== 'lesson' || !a.path || !a.lessonId) return null;
  const level = levelOf(ctx, a.path, a.lessonId);
  const action = actionFor(level);
  if (!action) return null;
  return {
    kind: 'lesson',
    courseId: a.path,
    courseName: a.subtitle ?? '',
    lessonId: a.lessonId,
    lessonTitle: a.title,
    action,
    level,
    isStart: false,
    reason: 'resume',
    evidence: lessonEvidence(a.lessonId, ctx.progress, ctx.completed(a.path)),
    otherLevel: false,
    staleLink: false,
    fromSaved: true,
  };
}

/**
 * The lesson the student was in: resumed when unfinished; otherwise the
 * ladder's next step in that course. `stale` reports a vanished course/lesson.
 */
function resolveLastLesson(
  ctx: Ctx, byId: Map<string, any>, a: LastActivity | null, catalogueReady: boolean,
): { step: LessonStep | null; stale: boolean; resumed: boolean } {
  if (!a || a.type !== 'lesson' || !a.path) return { step: null, stale: false, resumed: false };
  if (!catalogueReady) {
    const step = fromSavedActivity(ctx, a);
    return { step, stale: false, resumed: !!step };
  }
  const course = byId.get(a.path);
  if (!course || course.comingSoon) return { step: null, stale: true, resumed: false };
  const all = flatLessons(course);
  const at = a.lessonId ? all.find((r) => r.lesson.id === a.lessonId) : undefined;
  if (a.lessonId && !at) {
    const step = pickLesson(ctx, course, 'recent');
    return { step: step ? { ...step, staleLink: true } : null, stale: true, resumed: false };
  }
  if (at && !isDone(lessonEvidence(at.lesson.id, ctx.progress, ctx.completed(course.id)))) {
    const level = levelOf(ctx, course.id, at.lesson.id);
    const step = build(ctx, course, at.unit, at.unitIndex, at.lesson, actionFor(level) ?? 'watch', level, 'resume');
    return { step: { ...step, isStart: false }, stale: false, resumed: true };
  }
  return { step: pickLesson(ctx, course, at ? 'next' : 'recent', at ? at.index : -1), stale: false, resumed: false };
}

export function computeNextStep(input: {
  /** Full catalog (for names/lessons); enrolled courses select from it. Undefined = not available. */
  courses: any[] | undefined;
  enrolledCourses: any[];
  progress: ProgressMap;
  lastActivity: LastActivity | null;
  dueReviewCount: number;
  now: number;
  /**
   * The student's class. Passing the key (even as null) turns on the
   * start-of-journey branches; omitting it keeps the legacy "null when there
   * is nothing to continue" contract.
   */
  grade?: string | null;
  /** True once the class question was answered or skipped. */
  gradeChosen?: boolean;
  /** courseId → lesson ids the per-course progress doc proves completed. */
  completedByCourse?: Map<string, Set<string>>;
}): NextStep {
  const { courses, enrolledCourses, progress, lastActivity, dueReviewCount, now } = input;
  const catalogueReady = Array.isArray(courses);
  const live = (courses ?? []).filter((c) => c?.id && !c.comingSoon);
  const byId = new Map<string, any>();
  for (const c of live) byId.set(c.id, c);
  const grade = input.grade ?? null;
  const ctx: Ctx = {
    progress: progress || {},
    completed: (id) => input.completedByCourse?.get(id),
    myLevel: grade ? GRADE_TO_LEVEL[grade] : undefined,
  };

  if (lastActivity && now - lastActivity.ts > INACTIVE_AFTER_MS) {
    const target = lastActivity.type === 'lesson'
      ? resolveLastLesson(ctx, byId, lastActivity, catalogueReady).step
      : null;
    return { kind: 'welcome-back', resume: lastActivity, ...(target ? { target } : {}) };
  }
  if (lastActivity?.type === 'exam' && now - lastActivity.ts <= EXAM_RESUME_WINDOW_MS) {
    return { kind: 'resume-exam', resume: lastActivity };
  }

  const last = resolveLastLesson(ctx, byId, lastActivity, catalogueReady);
  // An unfinished lesson the student was in is an open loop — it outranks review.
  if (last.resumed && last.step) return last.step;
  if (dueReviewCount >= REVIEW_NUDGE_THRESHOLD) {
    return { kind: 'review', dueCount: dueReviewCount };
  }
  if (last.step) return last.step;
  if (!catalogueReady) return null;
  const stale = last.stale;

  // Lesson flow: enrolment order, then any course with saved evidence.
  const candidates: any[] = [];
  const add = (c: any) => { if (c?.id && !c.comingSoon && !candidates.some((x) => x.id === c.id)) candidates.push(c); };
  for (const ec of enrolledCourses ?? []) add(byId.get(ec?.id) ?? ec);
  for (const c of live) {
    if (flatLessons(c).some((r) => levelOf(ctx, c.id, r.lesson.id) !== 'none')) add(c);
  }
  for (const course of candidates) {
    const step = pickLesson(ctx, course, 'recent');
    if (step) return { ...step, staleLink: stale };
  }

  // Legacy contract: callers that don't pass a grade get null here.
  if (!('grade' in input)) return null;

  // Nothing to continue: a real first lesson, honest about class coverage.
  const firstIn = (pool: any[]): LessonStep | null => {
    const ordered = [...pool].sort((a, b) => subjectRank(a) - subjectRank(b));
    for (const c of ordered) {
      const step = pickLesson(ctx, c, 'start');
      if (step) return { ...step, staleLink: stale };
    }
    return null;
  };
  const atLevel = (lvl: string) => live.filter((c) => c.level === lvl);

  if (!grade) {
    const suggestion = firstIn(atLevel('NSI')) ?? firstIn(live);
    if (!input.gradeChosen) return { kind: 'choose-class', suggestion };
    return suggestion;
  }
  const myLevel = ctx.myLevel;
  if (!myLevel) {
    const lvl = UNCOVERED_SUGGESTION_LEVEL[grade] ?? 'NSI';
    const s = firstIn(atLevel(lvl));
    return { kind: 'uncovered', grade, suggestion: s ? { ...s, otherLevel: true } : null };
  }
  const pool = atLevel(myLevel);
  if (pool.length === 0) return { kind: 'level-empty', level: myLevel };
  return firstIn(pool) ?? { kind: 'caught-up', level: myLevel };
}
