import { courseLabel, parseUnit, practiceHref, readStudyPrefs, strongSpots, weakSpots } from '../profileData';

describe('parseUnit', () => {
  it('reads the course and unit from a lesson id', () => {
    expect(parseUnit('MATH-NSIV-U12-L3')).toEqual({ course: 'MATH-NSIV', unitNo: 12 });
    expect(parseUnit('chap1')).toBeNull();
    expect(parseUnit(undefined)).toBeNull();
  });
});

describe('weakSpots', () => {
  it('groups due questions by unit, most first, skipping resolved ones', () => {
    const spots = weakSpots({
      a: { missedAt: 2, subjectCode: 'PHYS-NSII', unitNo: 1 },
      b: { missedAt: 3, subjectCode: 'MATH-NSI', unitNo: 4 },
      c: { missedAt: 4, subjectCode: 'MATH-NSI', unitNo: 4 },
      d: { missedAt: 1, correctAt: 5, subjectCode: 'ECON-NSI', unitNo: 2 },
      e: { missedAt: 1, lessonId: 'CHEM-NSI-U3-L1' },
      f: { missedAt: 1 },
    });
    expect(spots.map((s) => [s.unitKey, s.count])).toEqual([
      ['MATH-NSI-U4', 2], ['CHEM-NSI-U3', 1], ['PHYS-NSII-U1', 1],
    ]);
  });
});

describe('strongSpots', () => {
  it('counts only proficient or mastered lessons', () => {
    const spots = strongSpots({
      'MATH-NSI-U1-L1': { masteredAt: 1 },
      'MATH-NSI-U1-L2': { bestPct: 100 },
      'MATH-NSI-U2-L1': { completed: true, bestPct: 75 },
    });
    expect(spots).toEqual([{ unitKey: 'MATH-NSI-U1', course: 'MATH-NSI', unitNo: 1, count: 2 }]);
  });
});

it('links a spot to practice on its unit', () => {
  expect(practiceHref({ course: 'CHEM-NSII', unitNo: 3 })).toBe('/quizzes?course=CHEM-NSII&unit=U3');
});

it('names courses in both languages', () => {
  expect(courseLabel('MATH-NSIII', false)).toBe('Maths NS3');
  expect(courseLabel('ECON-NSI', true)).toBe('Ekonomi NS1');
});

it('accepts only known goals and rhythms from the account', () => {
  expect(readStudyPrefs({ studyGoal: 'bac', studyMinutes: 30 })).toEqual({ studyGoal: 'bac', studyMinutes: 30 });
  expect(readStudyPrefs({ studyGoal: 'rich', studyMinutes: 7 })).toEqual({ studyGoal: null, studyMinutes: null });
  expect(readStudyPrefs(null)).toEqual({ studyGoal: null, studyMinutes: null });
});
