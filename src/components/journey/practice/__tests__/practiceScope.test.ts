import { toDirectItemFromRow } from '../../../../services/quizBank';
import { findCourse, isGradable, matchUnit, normalizeCourseCode, resolvePracticeScope, unitOptionsFor } from '../practiceScope';
import { courses, quizBank } from './fixtures';

const resolve = (h: any) => resolvePracticeScope(h, courses, quizBank, toDirectItemFromRow);

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
  expect(matchUnit(opts, 'chem-ns1-u1')?.value).toBe('U1');
  expect(matchUnit(opts, 'U9')).toBeUndefined();
});

it('resolves a valid handoff with real counts and keeps the lesson as attribution', () => {
  const s = resolve({ course: 'chem-ns1', unit: 'U1', lesson: 'CHEM-NSI-U1-L1' })!;
  expect(s.status).toBe('ok');
  expect(s.unit?.label).toBe('Grandeurs et Mesures');
  expect(s.poolCount).toBe(4); // every row, including the key-less one
  expect(s.quizCount).toBe(3); // only what a scored quiz can hold
  expect(s.lesson?.title).toBe('Mesurer une longueur');
  expect(s.nextLesson?.id).toBe('CHEM-NSI-U1-L2');
});

it('derives the unit from a lesson when the link has none', () => {
  expect(resolve({ course: 'CHEM-NSI', lesson: 'CHEM-NSI-U1-L2' })?.unit?.value).toBe('U1');
});

it('reports stale or empty scope instead of widening it', () => {
  expect(resolve({ course: 'chem-ns1', unit: 'U9' })?.status).toBe('unknown-unit');
  const empty = resolve({ course: 'chem-ns1', unit: 'U2' })!;
  expect(empty.status).toBe('empty-unit');
  expect(empty.poolCount).toBe(0);
  expect(resolve({ course: 'bio-ns9', unit: 'U1' })?.status).toBe('unknown-course');
  expect(resolve({ course: 'chem-ns1' })?.status).toBe('course-only');
});

it('knows which questions can be auto-graded', () => {
  expect(isGradable({ kind: 'mcq', options: ['a', 'b'], correctIndex: 1 })).toBe(true);
  expect(isGradable({ kind: 'short', correctText: '' })).toBe(false);
  expect(isGradable({ kind: 'short', correctText: '', alternatives: ['x'] })).toBe(true);
  expect(isGradable({ kind: 'essay', correctText: 'x' })).toBe(false);
});
