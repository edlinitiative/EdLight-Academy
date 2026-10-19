/**
 * P0 code validation (2026-10-19): the web read a quiz key as a letter or a
 * number BEFORE comparing it to the option text, so text keys that look like
 * a letter/number graded the wrong option as correct.
 */
jest.mock('../firebase', () => ({ db: {} }));
import { toDirectItemFromRow } from '../quizBank';

const row = (options: unknown, correct: string) => ({
  question: 'Q ?', question_type: 'multiple_choice', options, correct_answer: correct,
});

describe('quiz-bank answer key resolution (web)', () => {
  it('a text key "1" is the option "1", not the first option', () => {
    const item: any = toDirectItemFromRow(row(JSON.stringify(['0', '1', '2', '3']), '1'));
    expect(item.kind).toBe('mcq');
    expect(item.correctLabel).toBe('1');
  });

  it('a one-letter text key ("d" orbital) is that option, not letter D', () => {
    const item: any = toDirectItemFromRow(row(JSON.stringify(['s', 'p', 'd', 'f']), 'd'));
    expect(item.correctLabel).toBe('d');
  });

  it('still reads letter keys', () => {
    const item: any = toDirectItemFromRow(row(JSON.stringify(['Paris', 'Lyon', 'Nice', 'Brest']), 'B'));
    expect(item.correctLabel).toBe('Lyon');
  });

  it('accepts options stored as a real array', () => {
    const item: any = toDirectItemFromRow(row(['Paris', 'Lyon'], 'Lyon'));
    expect(item.kind).toBe('mcq');
    expect(item.correctLabel).toBe('Lyon');
  });

  it('never builds an MCQ around an out-of-range key', () => {
    const item: any = toDirectItemFromRow(row(JSON.stringify(['a1', 'b1', 'c1', 'd1']), '5'));
    expect(item.kind).not.toBe('mcq');
  });
});
