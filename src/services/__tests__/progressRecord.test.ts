import {
  lessonsCompletedIn,
  totalLessonsCompleted,
  courseLessonIdsOf,
  buildCourseRecords,
  quizAccuracy,
  hasAnythingToRecord,
} from '../progressRecord';
import { lessonMastery } from '../../../shared/mastery';

/*
 * These are the numbers that end up on a sheet a student hands to a parent or
 * a head teacher, so each one is pinned to the source it is allowed to come
 * from. The failure this file exists to prevent is the known trap in this
 * codebase: deriving mastery from the per-course progress document instead of
 * the one shared mastery document. That mistake does not throw — it silently
 * caps every lesson at `seen`, and the sheet would under-report a student who
 * has passed chapter tests.
 */

const course = (id: string, name: string, units: Array<[string, string, string[]]>) => ({
  id,
  name,
  level: 'NSI',
  subject: 'CHEM',
  modules: units.map(([unitId, title, lessons]) => ({
    id: unitId,
    title,
    lessons: lessons.map((l) => ({ id: l })),
  })),
});

const CATALOG = [
  course('chem-ns1', 'Chimie NS1', [
    ['U1', 'Unité 1 — La matière', ['C-U1-L1', 'C-U1-L2']],
    ['U2', 'Unité 2 — Les gaz', ['C-U2-L1', 'C-U2-L2']],
  ]),
  course('math-ns1', 'Maths NS1', [['U1', 'Unité 1 — Nombres', ['M-U1-L1']]]),
];

describe('lessonsCompletedIn / totalLessonsCompleted', () => {
  it('is zero for a document with no completedLessons', () => {
    expect(lessonsCompletedIn(undefined)).toBe(0);
    expect(lessonsCompletedIn({ courseId: 'chem-ns1' })).toBe(0);
    expect(lessonsCompletedIn({ courseId: 'chem-ns1', completedLessons: [] })).toBe(0);
  });

  it('counts a lesson once even when the array holds it twice', () => {
    // Both platforms append to this array; a double write must not inflate a
    // figure presented as a record.
    expect(
      lessonsCompletedIn({ courseId: 'chem-ns1', completedLessons: ['A', 'A', 'B'] }),
    ).toBe(2);
  });

  it('ignores empty and non-string entries', () => {
    expect(
      lessonsCompletedIn({ courseId: 'c', completedLessons: ['A', '', null as any, 3 as any] }),
    ).toBe(1);
  });

  it('SUMS across course documents — there is no single total field', () => {
    const docs = [
      { courseId: 'chem-ns1', completedLessons: ['C-U1-L1', 'C-U1-L2'] },
      { courseId: 'math-ns1', completedLessons: ['M-U1-L1'] },
      { courseId: 'phys-ns1', completedLessons: [] },
    ];
    expect(totalLessonsCompleted(docs)).toBe(3);
    expect(totalLessonsCompleted([])).toBe(0);
    expect(totalLessonsCompleted(null)).toBe(0);
  });
});

describe('courseLessonIdsOf', () => {
  it('flattens every unit, in catalog order', () => {
    expect(courseLessonIdsOf(CATALOG[0])).toEqual(['C-U1-L1', 'C-U1-L2', 'C-U2-L1', 'C-U2-L2']);
  });

  it('is empty rather than throwing for a course with no modules', () => {
    expect(courseLessonIdsOf(undefined)).toEqual([]);
    expect(courseLessonIdsOf({ id: 'x' })).toEqual([]);
    expect(courseLessonIdsOf({ id: 'x', modules: [{ id: 'U1' }] })).toEqual([]);
  });
});

describe('buildCourseRecords', () => {
  const docs = [
    {
      courseId: 'chem-ns1',
      completedLessons: ['C-U1-L1', 'C-U1-L2', 'C-U2-L1'],
      totalPoints: 240,
      badges: ['first_lesson', 'unit_done'],
    },
    { courseId: 'math-ns1', completedLessons: ['M-U1-L1'], totalPoints: 30 },
  ];

  // The shared mastery document: one map for ALL courses, keyed by the global
  // lesson id. Note C-U1-L1 is `mastered` here while the progress document
  // only knows it was completed.
  const mastery = {
    'C-U1-L1': { completed: true, bestPct: 100, masteredAt: 1_700_000_000_000 },
    'C-U1-L2': { bestPct: 80 },
    'C-U2-L1': { completed: true },
    'M-U1-L1': { bestPct: 100 },
  };

  it('reads mastery from the shared document, NOT from completedLessons', () => {
    const [chem] = buildCourseRecords(docs, CATALOG, mastery);
    expect(chem.courseId).toBe('chem-ns1');
    // The trap: derived from completedLessons these would all be `seen`.
    expect(chem.units[0].mastery.counts.mastered).toBe(1);
    expect(chem.units[0].mastery.counts.familiar).toBe(1);
    expect(lessonMastery(mastery['C-U1-L2'])).toBe('familiar');
  });

  it('gives a unit the level of its WEAKEST lesson, per the shared model', () => {
    const [chem] = buildCourseRecords(docs, CATALOG, mastery);
    // U1 holds a `mastered` and a `familiar` lesson → the unit is `familiar`.
    expect(chem.units[0].mastery.level).toBe('familiar');
    // U2 holds a `seen` lesson and an untouched one → the unit is `none`.
    expect(chem.units[1].mastery.level).toBe('none');
    expect(chem.units[1].mastery.started).toBe(1);
  });

  it('keeps lessons-completed and mastery as separate figures', () => {
    const [chem] = buildCourseRecords(docs, CATALOG, mastery);
    expect(chem.lessonsCompleted).toBe(3); // progress document
    expect(chem.lessonTotal).toBe(4); // catalog
    expect(chem.mastery.total).toBe(4); // mastery document, all four lessons
    expect(chem.mastery.mastered).toBe(1);
    expect(chem.points).toBe(240);
    expect(chem.badges).toEqual(['first_lesson', 'unit_done']);
  });

  it('counts a lesson practised only on the phone, with no completedLessons entry', () => {
    // The whole point of the shared document: mobile-only work must show up.
    const rows = buildCourseRecords(
      [{ courseId: 'chem-ns1', completedLessons: [] }],
      CATALOG,
      { 'C-U2-L2': { bestPct: 100 } },
    );
    expect(rows[0].lessonsCompleted).toBe(0);
    expect(rows[0].mastery.counts.proficient).toBe(1);
    expect(rows[0].mastery.started).toBe(1);
  });

  it('lists only courses the student has a progress document for', () => {
    const rows = buildCourseRecords([docs[1]], CATALOG, mastery);
    expect(rows.map((r) => r.courseId)).toEqual(['math-ns1']);
  });

  it('sorts by lessons finished, fullest course first', () => {
    const rows = buildCourseRecords(docs, CATALOG, mastery);
    expect(rows.map((r) => r.courseId)).toEqual(['chem-ns1', 'math-ns1']);
  });

  it('survives a progress document whose course is not in the catalog', () => {
    const rows = buildCourseRecords([{ courseId: 'gone-ns9', completedLessons: ['X'] }], CATALOG, {});
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('gone-ns9');
    expect(rows[0].unknownCourse).toBe(true);
    expect(rows[0].units).toEqual([]);
    expect(rows[0].lessonTotal).toBe(0);
    expect(rows[0].lessonsCompleted).toBe(1);
  });

  it('drops units that hold no lessons rather than printing an empty row', () => {
    const thin = [{ id: 'c', name: 'C', modules: [{ id: 'U1', title: 'Vide', lessons: [] }] }];
    const rows = buildCourseRecords([{ courseId: 'c', completedLessons: [] }], thin, {});
    expect(rows[0].units).toEqual([]);
  });

  it('returns nothing for a student with no progress documents', () => {
    expect(buildCourseRecords([], CATALOG, mastery)).toEqual([]);
    expect(buildCourseRecords(null, CATALOG, mastery)).toEqual([]);
  });
});

describe('quizAccuracy', () => {
  it('is null — not 0 % — when no question has been answered', () => {
    expect(quizAccuracy(0, 0)).toBeNull();
    expect(quizAccuracy(undefined, undefined)).toBeNull();
    expect(quizAccuracy(5, 0)).toBeNull();
  });

  it('rounds to a whole percent', () => {
    expect(quizAccuracy(1, 3)).toBe(33);
    expect(quizAccuracy(2, 3)).toBe(67);
    expect(quizAccuracy(7, 10)).toBe(70);
  });

  it('cannot exceed 100 % on inconsistent counters', () => {
    expect(quizAccuracy(12, 10)).toBe(100);
    expect(quizAccuracy(-3, 10)).toBe(0);
  });
});

describe('hasAnythingToRecord', () => {
  const none = { lessons: 0, courses: [], quizQuestions: 0, exams: 0, streakBest: 0 };

  it('is false when every source is empty', () => {
    expect(hasAnythingToRecord(none)).toBe(false);
  });

  it('is true on mastery alone, with no completed lessons', () => {
    const courses = buildCourseRecords(
      [{ courseId: 'chem-ns1', completedLessons: [] }],
      CATALOG,
      { 'C-U1-L1': { bestPct: 100 } },
    );
    expect(hasAnythingToRecord({ ...none, courses })).toBe(true);
  });

  it('is true on any single source', () => {
    expect(hasAnythingToRecord({ ...none, lessons: 1 })).toBe(true);
    expect(hasAnythingToRecord({ ...none, quizQuestions: 4 })).toBe(true);
    expect(hasAnythingToRecord({ ...none, exams: 1 })).toBe(true);
    expect(hasAnythingToRecord({ ...none, streakBest: 2 })).toBe(true);
  });
});
