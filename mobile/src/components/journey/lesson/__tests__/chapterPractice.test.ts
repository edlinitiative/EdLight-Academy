import { chapterPractice, unitNoFor } from '../chapterPractice';
import { readPracticeHandoff } from '../../../../utils/learningJourney';

const row = (unit: number, lesson?: number) => ({
  subject_code: 'CHEM-NSI', unit_no: unit, lesson_no: lesson, question: `Q${unit}-${lesson}`, options: ['a', 'b'], correct_answer: 'A',
});

describe('chapterPractice', () => {
  const bank = [row(1, 1), row(1, 2), row(1), row(2, 1), { ...row(1, 1), options: [] }];
  it('loading never claims 0 questions', () => {
    expect(chapterPractice({ rawBank: undefined, courseCode: 'CHEM-NSI', module: { unit_no: 1 } })).toEqual({ status: 'loading' });
  });
  it('counts the whole chapter (unit-wide), usable rows only', () => {
    const p = chapterPractice({ rawBank: bank, courseCode: 'CHEM-NSI', module: { unit_no: 1 }, lessonId: 'L1' });
    expect(p).toMatchObject({ status: 'ready', unit: 'U1', count: 3 });
    if (p.status !== 'ready') throw new Error();
    expect(readPracticeHandoff(p.handoff)).toEqual({ course: 'CHEM-NSI', unit: 'U1', lesson: 'L1', mode: 'quiz', from: 'lesson' });
  });
  it('no rows / no scope → none', () => {
    expect(chapterPractice({ rawBank: bank, courseCode: 'CHEM-NSI', module: { unit_no: 7 } })).toEqual({ status: 'none', unit: 'U7' });
    expect(chapterPractice({ rawBank: bank, courseCode: null, module: { unit_no: 1 } })).toMatchObject({ status: 'none' });
    expect(unitNoFor({ order: 3 })).toBe(3);
    expect(unitNoFor({})).toBeNull();
  });
});
