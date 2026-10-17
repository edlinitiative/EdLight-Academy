import { EVIDENCE, practiceParams, readPracticeHandoff } from '../learningJourney';

describe('learningJourney contract', () => {
  it('round-trips a practice handoff and drops unknown values', () => {
    const h = practiceParams({ course: 'chem-ns1', unit: 'U2', lesson: 'L1', mode: 'quiz', from: 'lesson' });
    expect(readPracticeHandoff(h)).toEqual(h);
    expect(readPracticeHandoff({ course: 'x', mode: 'exam', from: 'ads' })).toEqual({ course: 'x', unit: undefined, lesson: undefined, mode: undefined, from: undefined });
    expect(readPracticeHandoff({})).toBeNull();
  });
  it('never calls completion mastery', () => {
    expect(EVIDENCE.completed.fr).not.toMatch(/ma[iî]tris/i);
    expect(EVIDENCE.completed.ht).not.toMatch(/metrize/i);
  });
});
