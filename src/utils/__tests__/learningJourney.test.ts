import { practiceHref, readPracticeHandoff, evidenceLabel } from '../learningJourney';

test('practice handoff round-trips and drops unknown values', () => {
  const href = practiceHref({ course: 'chem-ns1', unit: 'u2', lesson: 'l5', mode: 'quiz', from: 'lesson' });
  const back = readPracticeHandoff(new URL(`https://x${href}`).searchParams);
  expect(back).toEqual({ course: 'chem-ns1', unit: 'u2', lesson: 'l5', mode: 'quiz', from: 'lesson' });
  expect(readPracticeHandoff(new URLSearchParams('course=a&mode=weird&from=evil'))).toEqual({ course: 'a', unit: undefined, lesson: undefined, mode: undefined, from: undefined });
  expect(readPracticeHandoff(new URLSearchParams('unit=1'))).toBeNull();
});

test('completion is never labelled mastery', () => {
  expect(evidenceLabel('completed', false)).toBe('Terminée');
  expect(evidenceLabel('mastered', true)).toBe('Metrize');
});
