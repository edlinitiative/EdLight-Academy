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
 *                  not optimization ("Nou manke w!").
 *   resume-exam    an exam left mid-run is an explicit open loop.
 *   review         a pile of missed questions means the next minutes are worth
 *                  more spent fixing than advancing.
 *   lesson         otherwise: the first lesson of the student's current course
 *                  that still has something to earn, with the ACTION that earns
 *                  it (watch → practice → aim 100 → chapter test) — the same
 *                  ladder the Cours tab teaches.
 *
 * Everything here is pure: state in, recommendation out. No i18n, no
 * navigation — the card owns those.
 */

import { lessonMastery, type ProgressMap, type MasteryLevel } from './mastery';
import type { LastActivity } from '../contexts/store';

/** Silence long enough that re-entry is the message. */
export const INACTIVE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
/** An exam only reads as "in progress" for a few days. */
export const EXAM_RESUME_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
/** Missed questions worth interrupting the lesson flow for. */
export const REVIEW_NUDGE_THRESHOLD = 3;

export type LessonAction = 'watch' | 'practice' | 'perfect' | 'test';

export type NextStep =
  | { kind: 'welcome-back'; resume: LastActivity }
  | { kind: 'resume-exam'; resume: LastActivity }
  | { kind: 'review'; dueCount: number }
  | {
      kind: 'lesson';
      courseId: string;
      courseName: string;
      courseColor?: string;
      unitTitle?: string;
      lessonId: string;
      lessonTitle: string;
      /** Minutes, when the catalog knows it. */
      duration?: number;
      action: LessonAction;
      level: MasteryLevel;
      /** True when the whole course is untouched — "Kòmanse", not "Kontinye". */
      isStart: boolean;
    }
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

/**
 * The first lesson (course order) with something left to earn, preferring
 * early rungs: a lesson never opened outranks one waiting on its chapter test,
 * because the ladder is climbed front to back.
 */
function pickLesson(course: any, progress: ProgressMap): NextStep {
  const units = Array.isArray(course?.modules) ? course.modules : [];
  let fallback: Extract<NextStep, { kind: 'lesson' }> | null = null;
  let touched = 0;

  const build = (unit: any, lesson: any, action: LessonAction, level: MasteryLevel): Extract<NextStep, { kind: 'lesson' }> => ({
    kind: 'lesson',
    courseId: course.id,
    courseName: course.name ?? '',
    courseColor: course.color,
    unitTitle: unit?.title,
    lessonId: lesson.id,
    lessonTitle: lesson.title ?? '',
    duration: typeof lesson.duration === 'number' ? lesson.duration : undefined,
    action,
    level,
    isStart: false, // patched below once `touched` covers the whole course
  });

  let picked: Extract<NextStep, { kind: 'lesson' }> | null = null;
  for (const unit of units) {
    for (const lesson of unit?.lessons ?? []) {
      if (!lesson?.id) continue;
      const level = lessonMastery(progress[lesson.id]);
      if (level !== 'none') touched += 1;
      const action = actionFor(level);
      if (!action) continue;
      // 'watch'/'practice' are where active learning is — take the first;
      // otherwise remember the first polishing step and keep looking.
      if (!picked && (action === 'watch' || action === 'practice')) {
        picked = build(unit, lesson, action, level);
      } else if (!picked && !fallback) {
        fallback = build(unit, lesson, action, level);
      }
    }
  }
  const step = picked ?? fallback;
  return step ? { ...step, isStart: touched === 0 } : null;
}

export function computeNextStep(input: {
  /** Full catalog (for names/lessons); enrolled courses select from it. */
  courses: any[] | undefined;
  enrolledCourses: any[];
  progress: ProgressMap;
  lastActivity: LastActivity | null;
  dueReviewCount: number;
  now: number;
}): NextStep {
  const { courses, enrolledCourses, progress, lastActivity, dueReviewCount, now } = input;

  if (lastActivity && now - lastActivity.ts > INACTIVE_AFTER_MS) {
    return { kind: 'welcome-back', resume: lastActivity };
  }
  if (
    lastActivity?.type === 'exam'
    && now - lastActivity.ts <= EXAM_RESUME_WINDOW_MS
  ) {
    return { kind: 'resume-exam', resume: lastActivity };
  }
  if (dueReviewCount >= REVIEW_NUDGE_THRESHOLD) {
    return { kind: 'review', dueCount: dueReviewCount };
  }

  // Lesson flow: the last-active course first, then enrollment order.
  const byId = new Map<string, any>();
  for (const c of courses ?? []) if (c?.id) byId.set(c.id, c);
  const candidates: any[] = [];
  if (lastActivity?.type === 'lesson' && lastActivity.path) {
    const c = byId.get(lastActivity.path);
    if (c) candidates.push(c);
  }
  for (const ec of enrolledCourses ?? []) {
    const c = byId.get(ec?.id) ?? ec;
    if (c?.id && !candidates.some((x) => x.id === c.id)) candidates.push(c);
  }

  for (const course of candidates) {
    const step = pickLesson(course, progress);
    if (step) return step;
  }
  return null;
}
