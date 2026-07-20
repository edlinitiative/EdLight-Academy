import {
  gradeExam,
  gradeScaffoldBlanks,
} from '../examUtils';

/**
 * Grading regression suite.
 *
 * Pins the two P0 bugs that scored ~0% invisibly to tsc:
 *  - the exam grader must consume the RAW answers map ({ [index]: value }),
 *    NOT a { given: ... } wrapper;
 *  - each gradable question type (multiple_choice + mcq/qcm aliases,
 *    true_false, fill_blank / short_answer, scaffold, conditions) must grade
 *    a correct answer as correct.
 */

// A mixed exam exercising every single-answer gradable type + its aliases.
const mixedExam = [
  { type: 'multiple_choice', correct: 'c', points: 1 },
  { type: 'mcq', correct: 'b', points: 1 }, // alias of multiple_choice
  { type: 'qcm', correct: 'a', points: 1 }, // alias of multiple_choice
  { type: 'true_false', correct: 'Vrai', points: 1 },
  { type: 'fill_blank', correct: 'Paris', points: 1 },
  { type: 'short_answer', correct: '42', points: 1 },
];

describe('gradeExam — mixed gradable types', () => {
  it('scores a fully-correct raw answer map at 100% with every question correct', () => {
    const answers = { 0: 'c', 1: 'b', 2: 'a', 3: 'vrai', 4: 'Paris', 5: '42' };
    const { summary } = gradeExam(mixedExam, answers);
    expect(summary.percentage).toBe(100);
    expect(summary.correctCount).toBe(mixedExam.length); // correctCount === total
    expect(summary.incorrectCount).toBe(0);
    expect(summary.earnedPoints).toBe(summary.totalPoints);
  });

  it('scores a fully-wrong answer map at 0% with zero correct', () => {
    const answers = { 0: 'a', 1: 'a', 2: 'b', 3: 'faux', 4: 'London', 5: '0' };
    const { summary } = gradeExam(mixedExam, answers);
    expect(summary.percentage).toBe(0);
    expect(summary.correctCount).toBe(0);
    expect(summary.incorrectCount).toBe(mixedExam.length);
  });

  it('scores a partial answer map with the right correct count', () => {
    // 3 of 6 correct → 50%.
    const answers = { 0: 'c', 1: 'b', 2: 'a', 3: 'faux', 4: 'London', 5: '0' };
    const { summary } = gradeExam(mixedExam, answers);
    expect(summary.correctCount).toBe(3);
    expect(summary.incorrectCount).toBe(3);
    expect(summary.percentage).toBe(50);
  });

  it('true_false grades accent/case/synonym variants of the stored answer', () => {
    const exam = [
      { type: 'true_false', correct: 'Vrai', points: 1 },
      { type: 'true_false', correct: 'Faux', points: 1 },
    ];
    // 'true'/'vrai'/'v' all normalize to true; 'false'/'non' to false.
    expect(gradeExam(exam, { 0: 'true', 1: 'non' }).summary.percentage).toBe(100);
    expect(gradeExam(exam, { 0: 'faux', 1: 'vrai' }).summary.percentage).toBe(0);
  });
});

describe('gradeExam — RAW answer-map regression (P0 bug pin)', () => {
  const exam = [{ type: 'multiple_choice', correct: 'c', points: 1 }];

  it('grades answers passed as the raw map { 0: "c" } correctly', () => {
    const { summary } = gradeExam(exam, { 0: 'c' });
    expect(summary.percentage).toBe(100);
    expect(summary.correctCount).toBe(1);
  });

  it('does NOT expect a { given: ... } wrapper — a wrapped answer grades wrong', () => {
    // The old bug read answers[i].given; the fixed grader consumes answers[i]
    // directly, so a wrapper object stringifies to "[object Object]" and misses.
    const { summary } = gradeExam(exam, { 0: { given: 'c' } });
    expect(summary.percentage).toBe(0);
    expect(summary.correctCount).toBe(0);
  });
});

describe('gradeExam — subject-gated fuzzy matching', () => {
  // A Kreyòl short-answer where the student typed a significant word subset of
  // the expected phrase. Only the non-math fuzzy path should accept it.
  const exam = [{ type: 'fill_blank', correct: 'Lakou Souvnans', points: 1 }];
  const answers = { 0: 'Souvnans' };

  it('rejects the word-subset answer for a math subject (strict path)', () => {
    const { summary } = gradeExam(exam, answers, {}, { subject: 'Mathématiques' });
    expect(summary.percentage).toBe(0);
  });

  it('accepts the word-subset answer for a language subject (fuzzy path)', () => {
    const { summary } = gradeExam(exam, answers, {}, { subject: 'Kreyòl' });
    expect(summary.percentage).toBe(100);
  });
});

describe('gradeExam — scaffold & conditions types', () => {
  it('grades a filled scaffold question against its answer_parts', () => {
    const exam = [
      {
        type: 'short_answer',
        scaffold_text: 'x = {0}, y = {1}',
        scaffold_blanks: ['x', 'y'],
        answer_parts: [{ answer: '4' }, { answer: '9' }],
        points: 1,
      },
    ];
    const answers = { 0: JSON.stringify({ scaffold: ['4', '9'] }) };
    const { summary } = gradeExam(exam, answers);
    expect(summary.percentage).toBe(100);
    expect(summary.correctCount).toBe(1);
  });

  it('gives partial credit for a half-correct scaffold', () => {
    const exam = [
      {
        type: 'short_answer',
        scaffold_text: 'x = {0}, y = {1}',
        scaffold_blanks: ['x', 'y'],
        answer_parts: [{ answer: '4' }, { answer: '9' }],
        points: 2,
      },
    ];
    const answers = { 0: JSON.stringify({ scaffold: ['4', '0'] }) };
    const { results } = gradeExam(exam, answers);
    expect(results[0].status).toBe('partial');
    expect(results[0].result.awarded).toBe(1); // 1 of 2 blanks → half of 2 pts
  });

  it('grades a guided condition-builder answer', () => {
    const exam = [
      {
        type: 'short_answer',
        conditions: [
          { left: 'x', operator: '>', value: '2' },
          { left: 'x', operator: '≤', value: '5' },
        ],
        points: 1,
      },
    ];
    // Operator synonyms are normalized ('<=' → '≤'); order-independent.
    const answers = {
      0: JSON.stringify([
        { operator: '<=', value: '5' },
        { operator: '>', value: '2' },
      ]),
    };
    const { summary } = gradeExam(exam, answers);
    expect(summary.percentage).toBe(100);
  });
});

describe('gradeScaffoldBlanks — unit', () => {
  const parts = [{ answer: '3' }, { answer: 'x^2', alternatives: ['x*x'] }];

  it('marks every blank correct for exact + alternative matches', () => {
    const res = gradeScaffoldBlanks(['3', 'x*x'], parts);
    expect(res.every((r: any) => r.correct)).toBe(true);
  });

  it('marks a blank incorrect when the value does not match', () => {
    const res = gradeScaffoldBlanks(['3', 'y'], parts);
    expect(res[0].correct).toBe(true);
    expect(res[1].correct).toBe(false);
  });
});
