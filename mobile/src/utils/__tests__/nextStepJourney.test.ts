import { computeNextStep, INACTIVE_AFTER_MS, REVIEW_NUDGE_THRESHOLD } from '../nextStep';

const NOW = 1_700_000_000_000;
const course = (id: string, level: string, subject = 'MATH') => ({
  id, level, subject, name: `C ${id}`,
  modules: [
    { title: 'U1', lessons: [{ id: `${id}1`, title: `${id} L1` }, { id: `${id}2`, title: `${id} L2` }] },
    { title: 'U2', lessons: [{ id: `${id}3`, title: `${id} L3` }] },
  ],
});
const math1 = course('m', 'NSI');
const phys1 = course('p', 'NSI', 'PHYS');
const math2 = course('n', 'NSII');
const base = {
  courses: [phys1, math1, math2],
  enrolledCourses: [],
  progress: {},
  lastActivity: null,
  dueReviewCount: 0,
  now: NOW,
  grade: 'NS1' as string | null,
  gradeChosen: true,
};
const lessonAt = (path: string, lessonId: string) => ({ type: 'lesson' as const, path, lessonId, title: 'x', subtitle: 'C', ts: NOW - 1000 });

describe('LJ-01 continuation', () => {
  it('resumes the exact unfinished lesson, ahead of a review pile', () => {
    const step = computeNextStep({ ...base, dueReviewCount: REVIEW_NUDGE_THRESHOLD + 5, lastActivity: lessonAt('m', 'm3') });
    expect(step).toMatchObject({ kind: 'lesson', reason: 'resume', lessonId: 'm3', unitIndex: 1, unitTitle: 'U2' });
  });

  it('a finished lesson → the ladder step in that course; review can then win', () => {
    const progress = { m1: { completed: true } };
    expect(computeNextStep({ ...base, progress, lastActivity: lessonAt('m', 'm1') }))
      .toMatchObject({ kind: 'lesson', lessonId: 'm1', action: 'practice' });
    expect(computeNextStep({ ...base, progress, dueReviewCount: 3, lastActivity: lessonAt('m', 'm1') }))
      .toEqual({ kind: 'review', dueCount: 3 });
  });

  it('a stale lesson link is flagged and falls back inside the course', () => {
    const step = computeNextStep({ ...base, lastActivity: lessonAt('m', 'gone') });
    expect(step).toMatchObject({ kind: 'lesson', courseId: 'm', lessonId: 'm1', staleLink: true });
  });

  it('a stale course link is flagged on the start lesson', () => {
    const step = computeNextStep({ ...base, lastActivity: lessonAt('deleted', 'x') });
    expect(step).toMatchObject({ kind: 'lesson', reason: 'start', staleLink: true });
  });

  it('catalogue unavailable: the saved lesson activity still resolves', () => {
    const step = computeNextStep({ ...base, courses: undefined, lastActivity: lessonAt('m', 'm2') });
    expect(step).toMatchObject({ kind: 'lesson', reason: 'resume', lessonId: 'm2', fromSaved: true, courseName: 'C' });
    expect(computeNextStep({ ...base, courses: undefined })).toBeNull();
  });

  it('a progress-doc completion counts as finished', () => {
    const step = computeNextStep({
      ...base, lastActivity: lessonAt('m', 'm1'), completedByCourse: new Map([['m', new Set(['m1'])]]),
    });
    expect(step).toMatchObject({ lessonId: 'm1', action: 'practice', reason: 'recent' });
  });

  it('welcome-back names the exact lesson', () => {
    const step = computeNextStep({ ...base, lastActivity: { ...lessonAt('m', 'm2'), ts: NOW - INACTIVE_AFTER_MS - 1 } });
    expect(step).toMatchObject({ kind: 'welcome-back', target: { lessonId: 'm2', reason: 'resume' } });
  });
});

describe('LJ-02 new students and class coverage', () => {
  it('a new NS1 student gets a real first lesson of their class, subject order', () => {
    expect(computeNextStep(base)).toMatchObject({ kind: 'lesson', reason: 'start', courseId: 'm', lessonId: 'm1', isStart: true, otherLevel: false });
  });
  it('7e–9e: uncovered, with a labelled NS I suggestion', () => {
    const step = computeNextStep({ ...base, grade: '8e' });
    expect(step).toMatchObject({ kind: 'uncovered', grade: '8e', suggestion: { courseId: 'm', otherLevel: true } });
  });
  it('post-Bac: uncovered, suggesting NS IV revision (none here → null suggestion)', () => {
    expect(computeNextStep({ ...base, grade: 'POSTBAC' })).toEqual({ kind: 'uncovered', grade: 'POSTBAC', suggestion: null });
  });
  it('covered class with no published courses: level-empty', () => {
    expect(computeNextStep({ ...base, grade: 'NS3' })).toEqual({ kind: 'level-empty', level: 'NSIII' });
  });
  it('everything mastered: caught-up', () => {
    const done = { masteredAt: 1 };
    const progress = Object.fromEntries(['n1', 'n2', 'n3'].map((id) => [id, done]));
    expect(computeNextStep({ ...base, grade: 'NS2', progress })).toEqual({ kind: 'caught-up', level: 'NSII' });
  });
  it('no class yet: choose-class with a real suggestion; skipped → just the lesson', () => {
    expect(computeNextStep({ ...base, grade: null, gradeChosen: false })).toMatchObject({ kind: 'choose-class', suggestion: { lessonId: 'm1' } });
    expect(computeNextStep({ ...base, grade: null, gradeChosen: true })).toMatchObject({ kind: 'lesson', lessonId: 'm1' });
  });
  it('work in another level is continued and labelled', () => {
    const step = computeNextStep({ ...base, progress: { n1: { completed: true } } });
    expect(step).toMatchObject({ kind: 'lesson', courseId: 'n', otherLevel: true, courseLevel: 'NSII' });
  });
});
