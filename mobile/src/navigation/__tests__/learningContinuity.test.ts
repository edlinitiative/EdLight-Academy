import {
  MAX_AGE_MS,
  isPristineLaunch,
  learningStateToNavState,
  readLearningState,
  snapshotLearningState,
} from '../learningContinuity';

const NOW = 1_800_000_000_000;
const ctx = { uid: 'u1', now: NOW, examsRoot: 'ExamLanding' as const };

const rootWith = (tab: string, stack?: Array<{ name: string; params?: any }>, extraRoot?: any) => ({
  index: extraRoot ? 1 : 0,
  routes: [
    {
      name: 'Main',
      state: {
        index: 0,
        routes: [{ name: tab, ...(stack ? { state: { index: stack.length - 1, routes: stack } } : {}) }],
      },
    },
    ...(extraRoot ? [extraRoot] : []),
  ],
});

describe('learning continuity: snapshot', () => {
  it('saves the course and exact lesson, dropping one-shot params', () => {
    const snap = snapshotLearningState(rootWith('Courses', [
      { name: 'CourseList', params: { resetAt: 5 } },
      { name: 'CourseDetail', params: { courseId: 'math-ns1', courseName: 'Maths NS1', lessonId: 'l-3', autoplay: true, chapterIndex: 2 } },
    ]), 'u1', NOW);
    expect(snap).toEqual({
      v: 1, uid: 'u1', savedAt: NOW, tab: 'Courses',
      stack: [{ name: 'CourseDetail', params: { courseId: 'math-ns1', courseName: 'Maths NS1', lessonId: 'l-3', chapterIndex: 2 } }],
    });
  });

  it('never saves the exam runner or results: stops at the overview (which offers Reprendre)', () => {
    const snap = snapshotLearningState(rootWith('Exams', [
      { name: 'ExamLanding' },
      { name: 'ExamBrowser', params: { level: 'terminale', explicit: true } },
      { name: 'ExamOverview', params: { level: 'terminale', examId: 'bac-2023-math' } },
      { name: 'ExamTake', params: { level: 'terminale', examId: 'bac-2023-math', autostart: true } },
    ]), 'u1', NOW);
    expect(snap?.stack.map((r) => r.name)).toEqual(['ExamBrowser', 'ExamOverview']);
    expect(snap?.stack[0].params).toEqual({ level: 'terminale' });
  });

  it('drops the practice handoff object (one-shot) but keeps the course', () => {
    const snap = snapshotLearningState(rootWith('Courses', [
      { name: 'CourseList' },
      { name: 'Quizzes', params: { courseId: 'phys-ns2', handoff: { from: 'lesson' } } },
    ]), 'u1', NOW);
    expect(snap?.stack).toEqual([{ name: 'Quizzes', params: { courseId: 'phys-ns2' } }]);
  });

  it('stops at a malformed id instead of saving it', () => {
    const snap = snapshotLearningState(rootWith('Courses', [
      { name: 'CourseList' },
      { name: 'CourseDetail', params: { courseId: '../../etc' } },
    ]), 'u1', NOW);
    expect(snap?.stack).toEqual([]);
  });

  it('returns null on a root modal so the place underneath is kept', () => {
    expect(snapshotLearningState(rootWith('Courses', undefined, { name: 'Sandra' }), 'u1', NOW)).toBeNull();
    expect(snapshotLearningState({ index: 0, routes: [{ name: 'Loading' }] }, 'u1', NOW)).toBeNull();
    expect(snapshotLearningState(null, 'u1', NOW)).toBeNull();
  });
});

describe('learning continuity: restore validation', () => {
  const saved = (over: any = {}) => JSON.stringify({
    v: 1, uid: 'u1', savedAt: NOW - 1000, tab: 'Courses',
    stack: [{ name: 'CourseDetail', params: { courseId: 'math-ns1', lessonId: 'l-3' } }],
    ...over,
  });

  it('round-trips into a partial state with the tab root underneath', () => {
    const rec = readLearningState(saved(), ctx)!;
    expect(learningStateToNavState(rec, ctx)).toEqual({
      index: 0,
      routes: [{
        name: 'Main',
        state: {
          index: 0,
          routes: [{
            name: 'Courses',
            state: { index: 1, routes: [{ name: 'CourseList' }, { name: 'CourseDetail', params: { courseId: 'math-ns1', lessonId: 'l-3' } }] },
          }],
        },
      }],
    });
  });

  it('uses the grade-dependent Exams root supplied at restore', () => {
    const rec = readLearningState(saved({ tab: 'Exams', stack: [{ name: 'ExamHistory' }] }), { ...ctx, examsRoot: 'Quizzes' })!;
    const st = learningStateToNavState(rec, { examsRoot: 'Quizzes' });
    expect(st.routes[0].state.routes[0].state.routes).toEqual([{ name: 'Quizzes' }, { name: 'ExamHistory' }]);
  });

  it('rejects another account, a guest record for a student, expired and future records, junk', () => {
    expect(readLearningState(saved({ uid: 'u2' }), ctx)).toBeNull();
    expect(readLearningState(saved({ uid: null }), ctx)).toBeNull();
    expect(readLearningState(saved(), { ...ctx, uid: null })).toBeNull();
    expect(readLearningState(saved({ savedAt: NOW - MAX_AGE_MS - 1 }), ctx)).toBeNull();
    expect(readLearningState(saved({ savedAt: NOW + 3_600_000 }), ctx)).toBeNull();
    expect(readLearningState('{not json', ctx)).toBeNull();
    expect(readLearningState(saved({ v: 2 }), ctx)).toBeNull();
    expect(readLearningState(saved({ tab: 'ArenaLive' }), ctx)).toBeNull();
  });

  it('re-validates stored params (a tampered record cannot inject screens or params)', () => {
    const rec = readLearningState(saved({
      stack: [
        { name: 'CourseDetail', params: { courseId: 'ok-id', autoplay: true, evil: 'x' } },
        { name: 'ArenaLive', params: { tournamentId: 't' } },
      ],
    }), ctx)!;
    expect(rec.stack).toEqual([{ name: 'CourseDetail', params: { courseId: 'ok-id' } }]);
  });

  it('never restores into a course that is gone from the catalog', () => {
    const rec = readLearningState(saved(), { ...ctx, courseExists: () => false })!;
    expect(rec.stack).toEqual([]);
    expect(learningStateToNavState(rec, ctx)!.routes[0].state.routes[0].state.routes).toEqual([{ name: 'CourseList' }]);
    // Unknown (no catalog cached yet) is allowed: the screen has its own not-found state.
    expect(readLearningState(saved(), { ...ctx, courseExists: () => undefined })!.stack).toHaveLength(1);
  });

  it('plain Home is not worth a reset', () => {
    const rec = readLearningState(saved({ tab: 'Dashboard', stack: [] }), ctx)!;
    expect(learningStateToNavState(rec, ctx)).toBeNull();
  });
});

describe('learning continuity: only an untouched launch is restored', () => {
  it('pristine: Main on Home with nothing pushed', () => {
    expect(isPristineLaunch({ index: 0, routes: [{ name: 'Main' }] })).toBe(true);
    expect(isPristineLaunch(rootWith('Dashboard'))).toBe(true);
  });
  it('not pristine: a deep link, notification or tap already moved the student', () => {
    expect(isPristineLaunch(rootWith('Trivia'))).toBe(false);
    expect(isPristineLaunch({ index: 1, routes: [{ name: 'Main' }, { name: 'Defi', params: { code: 'X' } }] })).toBe(false);
    expect(isPristineLaunch({ index: 0, routes: [{ name: 'Main', state: { index: 0, routes: [
      { name: 'Dashboard' },
      { name: 'Courses', state: { index: 1, routes: [{ name: 'CourseList' }, { name: 'CourseDetail' }] } },
    ] } }] })).toBe(false);
    expect(isPristineLaunch({ index: 0, routes: [{ name: 'Loading' }] })).toBe(false);
  });
});
