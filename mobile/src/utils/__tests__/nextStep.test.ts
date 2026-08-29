import { computeNextStep, INACTIVE_AFTER_MS, EXAM_RESUME_WINDOW_MS } from '../nextStep';
import type { ProgressMap } from '../mastery';

const NOW = 1_700_000_000_000;

const course = (id: string, lessons: Array<{ id: string; title?: string; duration?: number }>) => ({
  id,
  name: `Course ${id}`,
  color: '#1B6FE0',
  modules: [{ title: 'Unit 1', lessons }],
});

const base = {
  courses: [course('math', [
    { id: 'l1', title: 'Leçon 1', duration: 8 },
    { id: 'l2', title: 'Leçon 2', duration: 10 },
    { id: 'l3', title: 'Leçon 3' },
  ])],
  enrolledCourses: [{ id: 'math' }],
  progress: {} as ProgressMap,
  lastActivity: null,
  dueReviewCount: 0,
  now: NOW,
};

describe('computeNextStep priorities', () => {
  it('a week of silence wins over everything', () => {
    const step = computeNextStep({
      ...base,
      dueReviewCount: 10,
      lastActivity: { type: 'lesson', path: 'math', title: 'x', ts: NOW - INACTIVE_AFTER_MS - 1 },
    });
    expect(step?.kind).toBe('welcome-back');
  });

  it('a recent exam is an open loop to resume', () => {
    const step = computeNextStep({
      ...base,
      lastActivity: { type: 'exam', path: 'exam-1', title: 'Bac', ts: NOW - 1000 },
    });
    expect(step?.kind).toBe('resume-exam');
  });

  it('an old exam does not resume; the lesson flow takes over', () => {
    const step = computeNextStep({
      ...base,
      lastActivity: { type: 'exam', path: 'exam-1', title: 'Bac', ts: NOW - EXAM_RESUME_WINDOW_MS - 1 },
    });
    expect(step?.kind).toBe('lesson');
  });

  it('enough missed questions interrupt the lesson flow', () => {
    const step = computeNextStep({ ...base, dueReviewCount: 3 });
    expect(step).toEqual({ kind: 'review', dueCount: 3 });
  });

  it('two missed questions do not', () => {
    expect(computeNextStep({ ...base, dueReviewCount: 2 })?.kind).toBe('lesson');
  });
});

describe('computeNextStep lesson picking', () => {
  it('an untouched course starts at lesson 1 with "watch"', () => {
    const step = computeNextStep(base);
    expect(step).toMatchObject({
      kind: 'lesson', lessonId: 'l1', action: 'watch', isStart: true, duration: 8,
    });
  });

  it('a watched lesson asks for practice, and is no longer a start', () => {
    const step = computeNextStep({ ...base, progress: { l1: { completed: true } } });
    expect(step).toMatchObject({ kind: 'lesson', lessonId: 'l1', action: 'practice', isStart: false });
  });

  it('skips solid lessons to the first one with active work', () => {
    const step = computeNextStep({
      ...base,
      progress: { l1: { bestPct: 100 }, l2: { bestPct: 80 } },
    });
    // l1 is proficient (needs only the test), l2 familiar (perfect it) — but l3
    // has never been opened: watching new material beats polishing old.
    expect(step).toMatchObject({ kind: 'lesson', lessonId: 'l3', action: 'watch' });
  });

  it('falls back to the chapter test when only polishing remains', () => {
    const step = computeNextStep({
      ...base,
      progress: { l1: { bestPct: 100 }, l2: { bestPct: 100 }, l3: { bestPct: 100 } },
    });
    expect(step).toMatchObject({ kind: 'lesson', lessonId: 'l1', action: 'test' });
  });

  it('a fully mastered course yields nothing', () => {
    const done = { masteredAt: NOW - 5 };
    const step = computeNextStep({
      ...base,
      progress: { l1: done, l2: done, l3: done },
    });
    expect(step).toBeNull();
  });

  it('prefers the last-active course over enrollment order', () => {
    const physics = course('phys', [{ id: 'p1', title: 'P1' }]);
    const step = computeNextStep({
      ...base,
      courses: [...base.courses, physics],
      enrolledCourses: [{ id: 'math' }, { id: 'phys' }],
      lastActivity: { type: 'lesson', path: 'phys', title: 'P1', ts: NOW - 1000 },
    });
    expect(step).toMatchObject({ kind: 'lesson', courseId: 'phys', lessonId: 'p1' });
  });

  it('moves to the next enrolled course when the first is mastered', () => {
    const physics = course('phys', [{ id: 'p1', title: 'P1' }]);
    const done = { masteredAt: NOW - 5 };
    const step = computeNextStep({
      ...base,
      courses: [...base.courses, physics],
      enrolledCourses: [{ id: 'math' }, { id: 'phys' }],
      progress: { l1: done, l2: done, l3: done },
    });
    // The next course is untouched, so its card reads "Kòmanse", not "Kontinye".
    expect(step).toMatchObject({ kind: 'lesson', courseId: 'phys', isStart: true });
  });

  it('returns null with no enrollment and no activity', () => {
    expect(computeNextStep({ ...base, enrolledCourses: [] })).toBeNull();
  });
});
