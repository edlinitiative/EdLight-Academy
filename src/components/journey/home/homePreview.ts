/**
 * Dev-only fixtures for the signed-in Home, so every state can be reviewed and
 * screenshotted without an account: /dashboard?preview=<scenario>.
 * Courses.tsx only honours ?preview outside production builds.
 *
 * The fixtures are built FROM the real catalogue (real course, unit and lesson
 * ids and titles); only the student's records are invented — which is the
 * point of a preview, and why it can never ship.
 */
import type { ProgressMap } from '../../../../shared/mastery';
import type { ReviewMap } from '../../../utils/review';
import { flatLessons } from './homeJourney';

export type HomePreview = {
  scenario: string;
  grade: string | null;
  gradeChosen: boolean;
  lastActivity: { type: 'lesson' | 'exam' | 'quiz'; path: string; title: string; ts: number } | null;
  progress: any[];
  mastery: ProgressMap;
  reviewMap: ReviewMap | 'failed';
  attempts: any[];
  coursesFailed?: boolean;
  loading?: boolean;
  positionSec?: number;
};

export const PREVIEW_SCENARIOS = ['returning', 'new', 'noclass', 'uncovered', 'exam', 'failed', 'loading', 'stale', 'caughtup'];

export function buildHomePreview(scenario: string, courses: any[], courseLevel: (c: any) => string): HomePreview | null {
  if (!PREVIEW_SCENARIOS.includes(scenario)) return null;
  const live = courses.filter((c) => !c.comingSoon);
  const chem = live.find((c) => c.subject === 'CHEM' && courseLevel(c) === 'NSI') || live[0];
  const math = live.find((c) => c.subject === 'MATH' && courseLevel(c) === 'NSI') || live[1] || live[0];
  const base: HomePreview = {
    scenario, grade: 'NS1', gradeChosen: true, lastActivity: null, progress: [], mastery: {}, reviewMap: {}, attempts: [],
  };
  if (!chem) return { ...base, loading: scenario === 'loading', coursesFailed: scenario === 'failed' };
  const cl = flatLessons(chem);
  const ml = math ? flatLessons(math) : [];
  const now = Date.now();
  const due: ReviewMap = {
    q1: { missedAt: now - 86400000, subjectCode: 'CHEM-NSI', unitNo: 1 },
    q2: { missedAt: now - 2 * 86400000, subjectCode: 'CHEM-NSI', unitNo: 1 },
    q3: { missedAt: now - 3 * 86400000, subjectCode: 'MATH-NSI', unitNo: 2 },
  };
  const returning: HomePreview = {
    ...base,
    lastActivity: cl[6] ? { type: 'lesson', path: `/courses/${chem.id}?lesson=${encodeURIComponent(cl[6].lesson.id)}`, title: chem.name, ts: now } : null,
    progress: [
      { courseId: chem.id, completedLessons: cl.slice(0, 6).map((r) => r.lesson.id), watchedVideos: Object.fromEntries(cl.slice(0, 7).map((r) => [r.lesson.id, { completed: true }])), lastAccessedAt: now },
      ...(math ? [{ courseId: math.id, completedLessons: ml.slice(0, 2).map((r) => r.lesson.id), watchedVideos: {}, lastAccessedAt: now - 86400000 * 4 }] : []),
    ],
    mastery: {
      ...(cl[0] ? { [cl[0].lesson.id]: { completed: true, bestPct: 100, masteredAt: now - 86400000 } } : {}),
      ...(cl[1] ? { [cl[1].lesson.id]: { completed: true, bestPct: 100, masteredAt: now - 86400000 } } : {}),
      ...(cl[2] ? { [cl[2].lesson.id]: { completed: true, bestPct: 80 } } : {}),
    },
    reviewMap: due,
    attempts: [{ exam_id: 'preview-1', status: 'submitted', level: 'Baccalauréat', exam_title: 'Chimie' }],
    positionSec: 252,
  };
  switch (scenario) {
    case 'returning': return returning;
    case 'new': return { ...base, grade: 'NS2' };
    case 'noclass': return { ...base, grade: null, gradeChosen: false };
    case 'uncovered': return { ...base, grade: '9e' };
    case 'exam': return { ...returning, lastActivity: { type: 'exam', path: '/exams/terminale/preview-2/take', title: 'Physique · Bac 2024 — Série SMP', ts: now }, attempts: [{ exam_id: 'preview-2', status: 'in_progress', answers: { a: 1, b: 2, c: 3, d: 4 }, level: 'Baccalauréat' }] };
    case 'failed': return { ...returning, coursesFailed: true, reviewMap: due };
    case 'loading': return { ...returning, loading: true };
    case 'stale': return { ...base, lastActivity: { type: 'lesson', path: `/courses/${chem.id}?lesson=GONE-L99`, title: chem.name, ts: now }, progress: returning.progress, mastery: returning.mastery, reviewMap: 'failed' };
    case 'caughtup': return { ...base, progress: live.filter((c) => courseLevel(c) === 'NSI').map((c) => ({ courseId: c.id, completedLessons: flatLessons(c).map((r) => r.lesson.id), watchedVideos: {} })) };
    default: return null;
  }
}
