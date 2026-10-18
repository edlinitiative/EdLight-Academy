import { courseOutcomes, __transformCoursesForTests } from '../dataService';

jest.mock('../quizBank', () => ({ loadQuizBankSafe: jest.fn(), normalizeAndIndexQuizBank: jest.fn() }));

const doc = (extra: any = {}) => ({
  id: 'chem-ns1', name: 'Chimie NS I', description: '', number_of_lessons: 1,
  units: [{ unitId: 'U1', title: 'Grandeurs', order: 1, lessons: [{ lessonId: 'CHEM-NSI-U1-L1', title: 'L1', type: 'video', order: 1 }] }],
  ...extra,
});

describe('authored course outcomes pass through the transform', () => {
  it('keeps `outcomes`, `learningOutcomes` or `learning_outcomes`', () => {
    expect(__transformCoursesForTests([doc({ outcomes: ['A', ' B '] })])[0].outcomes).toEqual(['A', 'B']);
    expect(__transformCoursesForTests([doc({ learningOutcomes: ['C'] })])[0].outcomes).toEqual(['C']);
    expect(__transformCoursesForTests([doc({ learning_outcomes: 'D\nE' })])[0].outcomes).toEqual(['D', 'E']);
  });

  it('adds nothing when the document has none (no generated list)', () => {
    const [c] = __transformCoursesForTests([doc()]);
    expect('outcomes' in c).toBe(false);
    expect(courseOutcomes({ outcomes: ['', '  '] })).toBeUndefined();
  });
});
