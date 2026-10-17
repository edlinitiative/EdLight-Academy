import {
  chaptersFor, courseWideScope, findCourse, itemsForScope, matchUnit, normalizeCourseCode, poolItems,
  resolvePracticeScope, scopeForChapter, unitOptionsFor, COURSE_WIDE,
} from '../practiceScope';
import { readPracticeHandoff, practiceParams } from '../../../../utils/learningJourney';
import { courses, items, item, u1, ungradable } from './fixtures';

const resolve = (h: any) => resolvePracticeScope(h, courses, items);

describe('course and unit lookup', () => {
  it('reads course codes in either shape', () => {
    expect(normalizeCourseCode('chem-ns1')).toBe('CHEM-NSI');
    expect(normalizeCourseCode('CHEM-NSIV')).toBe('CHEM-NSIV');
    expect(findCourse(courses, 'chem-ns1')?.id).toBe('chem-ns1');
    expect(findCourse(courses, 'CHEM-NSI')?.id).toBe('chem-ns1');
    expect(findCourse(courses, 'bio-ns9')).toBeUndefined();
  });

  it('matches a unit by bank key, number, module id or title', () => {
    const opts = unitOptionsFor(courses[0]);
    expect(matchUnit(opts, 'U1')?.value).toBe('U1');
    expect(matchUnit(opts, 'u2')?.value).toBe('U2');
    expect(matchUnit(opts, '2')?.value).toBe('U2');
    expect(matchUnit(opts, 'CHEM-NSI-U1')?.value).toBe('U1');
    expect(matchUnit(opts, "l'atome")?.value).toBe('U2');
    expect(matchUnit(opts, 'U9')).toBeUndefined();
  });
});

describe('resolvePracticeScope', () => {
  it('resolves the handoff a lesson sends, with real counts and the lesson as attribution only', () => {
    // Exactly what components/journey/lesson/chapterPractice builds.
    const h = readPracticeHandoff(practiceParams({ course: 'CHEM-NSI', unit: 'U1', lesson: 'CHEM-NSI-U1-L1', mode: 'quiz', from: 'lesson' }));
    const s = resolve(h)!;
    expect(s.status).toBe('ok');
    expect(s.unit?.label).toBe('Grandeurs et Mesures');
    expect(s.unitIndex).toBe(1);
    expect(s.poolCount).toBe(4); // every row, the key-less one included
    expect(s.quizCount).toBe(3); // only what a scored quiz can hold
    expect(s.lesson?.title).toBe('Masse et Poids');
    expect(s.nextLesson?.id).toBe('CHEM-NSI-U1-L2');
    expect(itemsForScope(s, items).map((i) => i.id)).toEqual(['r1', 'r2', 'r3', 'r9']);
  });

  it('never mixes subjects in a pool', () => {
    expect(poolItems(items, 'CHEM-NSI', 1).some((i) => i.subjectCode === 'PHYS-NSI')).toBe(false);
  });

  it('derives the unit from a lesson when the handoff has none', () => {
    expect(resolve({ course: 'chem-ns1', lesson: 'CHEM-NSI-U1-L2' })?.unit?.value).toBe('U1');
  });

  it('reports stale or empty scope instead of widening it', () => {
    expect(resolve({ course: 'chem-ns1', unit: 'U9' })?.status).toBe('unknown-unit');
    const empty = resolve({ course: 'chem-ns1', unit: 'U2' })!;
    expect(empty.status).toBe('empty-unit');
    expect(empty.poolCount).toBe(0);
    expect(resolve({ course: 'bio-ns9', unit: 'U1' })?.status).toBe('unknown-course');
    expect(resolve({ course: 'chem-ns1' })?.status).toBe('course-only');
    expect(resolve(null)).toBeNull();
  });

  it('offers the whole course only as an explicit, separately counted choice', () => {
    const empty = resolve({ course: 'chem-ns1', unit: 'U2' })!;
    expect(empty.coursePoolCount).toBe(4);
    const wide = courseWideScope(empty);
    expect(wide.status).toBe('ok');
    expect(wide.unit?.value).toBe(COURSE_WIDE);
    expect(itemsForScope(wide, items)).toHaveLength(4);
  });
});

describe('browse chapters', () => {
  it('splits the bank\'s "Général" catch-all into the course\'s real units', () => {
    const general = { id: 'CHEM-NSI::Général', unit: 'Général', items: [...u1, ungradable, item('u2a', 2)] };
    const chapters = chaptersFor('CHEM-NSI', [general], courses[0]);
    expect(chapters.map((c) => [c.title, c.unitNo, c.items.length])).toEqual([
      ['Grandeurs et Mesures', 1, 4],
      ["L'Atome", 2, 1],
    ]);
  });

  it('keeps authored chapter groups as they are', () => {
    const named = { id: 'PHYS-NSI::Forces', unit: 'Forces', items: [item('f1', 4, { subjectCode: 'PHYS-NSI' })] };
    const chapters = chaptersFor('PHYS-NSI', [named]);
    expect(chapters).toHaveLength(1);
    expect(chapters[0].title).toBe('Forces');
    expect(chapters[0].unitNo).toBeNull();
  });

  it('builds a scope for a picked chapter with real counts', () => {
    const [ch] = chaptersFor('CHEM-NSI', [{ id: 'g', unit: 'Général', items: [...u1, ungradable] }], courses[0]);
    const s = scopeForChapter(ch, courses, items);
    expect(s.status).toBe('ok');
    expect(s.poolCount).toBe(4);
    expect(s.quizCount).toBe(3);
    expect(s.lesson).toBeUndefined();
    expect(s.unitIndex).toBe(1);
  });
});
