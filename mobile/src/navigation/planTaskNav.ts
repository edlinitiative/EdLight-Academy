/**
 * Study-plan task → the navigation action that opens THAT task.
 *
 * The shared planTaskRoute (shared/studyPlanTasks.ts) decides what a task is;
 * this turns it into a tab + nested screen. Every action is pushed with
 * `initial: false` so the tab's own root stays underneath: leaving the task
 * steps back into the tab instead of exiting it.
 *
 * The exam case relies on the Exams tab carrying ExamOverview for EVERY grade:
 * since TestFlight build 63 the tab is ExamsNavigator for all grades. (Build 61
 * had a Quiz-only stack there for 7e–NS3, so an SVT exam task fell through to
 * "Chimie, Choisis un niveau".)
 */
import { planTaskRoute, type PlanTaskRoute } from '../../../shared/studyPlanTasks';
import { practiceParams } from '../utils/learningJourney';

export interface TabNavAction {
  tab: 'Exams' | 'Courses';
  params: { screen: string; params: Record<string, unknown>; initial: false };
}

export function navActionForRoute(route: PlanTaskRoute): TabNavAction | null {
  switch (route.kind) {
    case 'exam':
      return {
        tab: 'Exams',
        params: { screen: 'ExamOverview', params: { level: route.levelSlug, examId: route.examId }, initial: false },
      };
    case 'practice':
      return {
        tab: 'Courses',
        params: {
          screen: 'Quizzes',
          params: { handoff: practiceParams({ course: route.course, unit: route.unit }) },
          initial: false,
        },
      };
    case 'lesson':
      return {
        tab: 'Courses',
        params: {
          screen: 'CourseDetail',
          params: route.lessonId ? { courseId: route.courseId, lessonId: route.lessonId } : { courseId: route.courseId },
          initial: false,
        },
      };
    default:
      return null;
  }
}

/** Task → action, or null when the task lacks the id it needs (row not tappable). */
export function planTaskNavAction(
  task: any,
  resolveCourseId?: (codeOrId: string) => string | undefined,
): TabNavAction | null {
  return navActionForRoute(planTaskRoute(task, { resolveCourseId }));
}
