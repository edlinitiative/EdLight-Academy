import {
  lessonEvidence, summarizeCourse, progressCourses, evidenceLine, courseStartTarget, completedByCourse, locateLesson,
} from '../homeJourney';

const course = (id: string, level = 'NSI', subject = 'MATH') => ({
  id, level, subject, name: `Cours ${id}`,
  modules: [
    { title: 'U1', lessons: [{ id: `${id}-1`, title: 'L1' }, { id: `${id}-2`, title: 'L2' }] },
    { title: 'U2', lessons: [{ id: `${id}-3`, title: 'L3' }] },
  ],
});

describe('lessonEvidence', () => {
  it('ranks mastered > practised > completed, from either completion source', () => {
    expect(lessonEvidence('a', { a: { masteredAt: 1, bestPct: 50 } })).toBe('mastered');
    expect(lessonEvidence('a', { a: { bestPct: 0 } })).toBe('practised');
    expect(lessonEvidence('a', { a: { completed: true } })).toBe('completed');
    expect(lessonEvidence('a', {}, new Set(['a']))).toBe('completed');
    expect(lessonEvidence('a', {})).toBeNull();
  });
  it('a finished video is never more than completed', () => {
    expect(lessonEvidence('a', { a: { completed: true } }, new Set(['a']))).toBe('completed');
  });
});

describe('summarizeCourse', () => {
  it('states independent facts over the real lesson count', () => {
    const s = summarizeCourse(course('m'), {
      'm-1': { completed: true },
      'm-2': { bestPct: 80 },
      'm-3': { masteredAt: 5, bestPct: 100 },
    });
    expect(s).toEqual({ total: 3, completed: 3, practised: 2, mastered: 1 });
  });
  it('counts progress-doc completions without inventing practice', () => {
    expect(summarizeCourse(course('m'), {}, new Set(['m-1']))).toEqual({ total: 3, completed: 1, practised: 0, mastered: 0 });
  });
  it('words: zero facts after the first are dropped', () => {
    expect(evidenceLine({ total: 3, completed: 1, practised: 0, mastered: 0 }, false)).toBe('1/3 terminée');
    expect(evidenceLine({ total: 3, completed: 2, practised: 2, mastered: 1 }, false)).toBe('2/3 terminées · 2 pratiquées · 1 maîtrisée');
    expect(evidenceLine({ total: 3, completed: 2, practised: 1, mastered: 0 }, true)).toBe('2/3 fini · 1 pratike');
  });
});

describe('progressCourses', () => {
  it('only courses with evidence, own class first, empty when nothing', () => {
    const a = course('a', 'NSI');
    const b = course('b', 'NSII');
    expect(progressCourses({ courses: [a, b], mastery: {} })).toEqual([]);
    const rows = progressCourses({
      courses: [a, b], grade: 'NS2',
      mastery: { 'a-1': { completed: true }, 'a-2': { completed: true }, 'b-1': { completed: true } },
    });
    expect(rows.map((r) => r.course.id)).toEqual(['b', 'a']);
  });
  it('reads completedByCourse from progress rows', () => {
    const m = completedByCourse([{ courseId: 'a', completedLessons: ['a-1'] }, { courseId: 'x' }]);
    expect(m.get('a')?.has('a-1')).toBe(true);
    expect(m.get('x')?.size).toBe(0);
  });
});

describe('courseStartTarget (LJ-03)', () => {
  const c = course('m');
  it('untouched: start at lesson 1', () => {
    expect(courseStartTarget(c, {})).toMatchObject({ reason: 'start', started: false, ref: { lesson: { id: 'm-1' } } });
  });
  it('resumes the lesson the student was in when unfinished', () => {
    expect(courseStartTarget(c, { 'm-1': { completed: true } }, null, 'm-3'))
      .toMatchObject({ reason: 'resume', started: true, ref: { lesson: { id: 'm-3' }, unitIndex: 1 } });
  });
  it('otherwise the first unfinished lesson', () => {
    expect(courseStartTarget(c, { 'm-1': { completed: true } }, null, 'm-1'))
      .toMatchObject({ reason: 'next', ref: { lesson: { id: 'm-2' } } });
  });
  it('all finished: first not mastered', () => {
    expect(courseStartTarget(c, { 'm-1': { masteredAt: 1 }, 'm-2': { completed: true }, 'm-3': { completed: true } }))
      .toMatchObject({ ref: { lesson: { id: 'm-2' } } });
  });
  it('locates a lesson in its chapter', () => {
    expect(locateLesson(c, 'm-3')).toMatchObject({ unitIndex: 1, index: 2 });
    expect(locateLesson(c, 'nope')).toBeNull();
  });
});
