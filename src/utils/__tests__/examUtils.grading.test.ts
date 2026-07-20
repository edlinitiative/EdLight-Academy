import { gradeExam, gradeSingleQuestion } from '../examUtils';

// Focused coverage of the core `gradeExam` scoring path — the auto-graded
// question types routed through `checkAnswer` (multiple_choice, multiple_select,
// true_false, fill_blank/calculation/short_answer) plus the summary shape that
// the study-plan / SRS scheduler reads. Scaffold, matching, and condition
// grading are covered in their own sibling suites.

const MATH = { subject: 'Mathématiques' };
const NONMATH = { subject: 'Anglais' };

// ── Per-type fixtures (minimal, one point each unless noted) ────────────────
const mcq = (correct: string, points = 1) => ({ type: 'multiple_choice', points, correct });
const trueFalse = (correct: string) => ({ type: 'true_false', points: 1, correct });
const multiSelect = (correct: string) => ({ type: 'multiple_select', points: 1, correct });
const fillBlank = (correct: string) => ({ type: 'fill_blank', points: 1, correct });
const shortAnswer = (correct: string) => ({ type: 'short_answer', points: 1, correct });

describe('gradeExam — multiple_choice', () => {
  it('scores a fully-correct answer at 100%', () => {
    const { summary, results } = gradeExam([mcq('b')], { 0: 'b' }, {}, MATH);
    expect(summary.percentage).toBe(100);
    expect(summary.correctCount).toBe(1);
    expect(summary.earnedPoints).toBe(1);
    expect(summary.totalPoints).toBe(1);
    expect(results[0].status).toBe('correct');
  });

  it('scores a fully-wrong answer at 0%', () => {
    const { summary, results } = gradeExam([mcq('b')], { 0: 'a' }, {}, MATH);
    expect(summary.percentage).toBe(0);
    expect(summary.correctCount).toBe(0);
    expect(summary.incorrectCount).toBe(1);
    expect(results[0].status).toBe('incorrect');
  });

  it('is case-insensitive on the option key', () => {
    expect(gradeExam([mcq('b')], { 0: 'B' }, {}, MATH).summary.percentage).toBe(100);
  });
});

describe('gradeExam — true_false', () => {
  it('accepts localized true/false variants (vrai/faux)', () => {
    expect(gradeExam([trueFalse('true')], { 0: 'vrai' }, {}, MATH).summary.percentage).toBe(100);
    expect(gradeExam([trueFalse('false')], { 0: 'faux' }, {}, MATH).summary.percentage).toBe(100);
  });

  it('marks the opposite value wrong', () => {
    expect(gradeExam([trueFalse('true')], { 0: 'faux' }, {}, MATH).summary.percentage).toBe(0);
  });
});

describe('gradeExam — multiple_select', () => {
  it('is correct only when the selected set matches (order-independent)', () => {
    const q = multiSelect('a,c');
    expect(gradeExam([q], { 0: JSON.stringify(['c', 'a']) }, {}, MATH).summary.percentage).toBe(100);
  });

  it('marks a partial or extra selection wrong (no partial credit here)', () => {
    const q = multiSelect('a,c');
    expect(gradeExam([q], { 0: JSON.stringify(['a']) }, {}, MATH).summary.percentage).toBe(0);
    expect(gradeExam([q], { 0: JSON.stringify(['a', 'b', 'c']) }, {}, MATH).summary.percentage).toBe(0);
  });
});

describe('gradeExam — fill_blank / short_answer', () => {
  it('accepts an exact numeric match with tolerance and comma decimals', () => {
    expect(gradeExam([fillBlank('3.14')], { 0: '3,14' }, {}, MATH).summary.percentage).toBe(100);
  });

  it('marks a wrong numeric answer incorrect', () => {
    expect(gradeExam([fillBlank('3.14')], { 0: '2' }, {}, MATH).summary.percentage).toBe(0);
  });

  it('fuzzy-matches free text for non-math subjects', () => {
    const q = shortAnswer('the industrial revolution');
    expect(gradeExam([q], { 0: 'The Industrial Revolution' }, {}, NONMATH).summary.percentage).toBe(100);
  });
});

describe('gradeExam — summary aggregation', () => {
  it('computes a partial percentage from mixed correct/wrong/unanswered', () => {
    // 4 one-point MCQs: 2 right, 1 wrong, 1 unanswered → 2/4 = 50%.
    const questions = [mcq('a'), mcq('b'), mcq('c'), mcq('d')];
    const answers = { 0: 'a', 1: 'b', 2: 'x' /* wrong */ /* q3 unanswered */ };
    const { summary } = gradeExam(questions, answers, {}, MATH);
    expect(summary.totalPoints).toBe(4);
    expect(summary.earnedPoints).toBe(2);
    expect(summary.correctCount).toBe(2);
    expect(summary.incorrectCount).toBe(1);
    expect(summary.unanswered).toBe(1);
    expect(summary.percentage).toBe(50);
  });

  it('rounds the percentage to a whole number', () => {
    // 1 of 3 correct → 33.33% → rounds to 33.
    const { summary } = gradeExam([mcq('a'), mcq('b'), mcq('c')], { 0: 'a' }, {}, MATH);
    expect(summary.percentage).toBe(33);
  });

  it('weights the percentage by points, not question count', () => {
    // A 3-point question right + a 1-point question wrong → 3/4 = 75%.
    const { summary } = gradeExam([mcq('a', 3), mcq('b', 1)], { 0: 'a', 1: 'z' }, {}, MATH);
    expect(summary.totalPoints).toBe(4);
    expect(summary.earnedPoints).toBe(3);
    expect(summary.percentage).toBe(75);
  });

  it('reports 0% when nothing is answered', () => {
    const { summary } = gradeExam([mcq('a'), mcq('b')], {}, {}, MATH);
    expect(summary.percentage).toBe(0);
    expect(summary.unanswered).toBe(2);
    expect(summary.autoGraded).toBe(0);
  });
});

// ── Regression guard for the web SRS scheduling bug ─────────────────────────
// The study-plan scheduler must read the score from `result.summary.percentage`.
// Reading a top-level `result.percentage` yields `undefined` (the number lives
// one level down on `summary`), which is exactly the bug that was fixed. These
// assertions pin the returned shape so the mistake can't silently reappear.
describe('gradeExam — returned shape (SRS scheduling regression)', () => {
  const graded = gradeExam([mcq('a')], { 0: 'a' }, {}, MATH);

  it('exposes the score at summary.percentage as a real number', () => {
    expect(typeof graded.summary.percentage).toBe('number');
    expect(Number.isFinite(graded.summary.percentage)).toBe(true);
    expect(graded.summary.percentage).toBe(100);
  });

  it('does NOT expose a top-level percentage (documents the bug shape)', () => {
    expect((graded as { percentage?: number }).percentage).toBeUndefined();
  });

  it('returns exactly { summary, results }', () => {
    expect(Object.keys(graded).sort()).toEqual(['results', 'summary']);
    expect(graded.results).toHaveLength(1);
  });
});

// ── gradeSingleQuestion parity (the per-question entry used for live feedback)
describe('gradeSingleQuestion — basic auto-graded types', () => {
  it('grades a correct multiple_choice', () => {
    expect(gradeSingleQuestion(mcq('b'), 'b', null, MATH).status).toBe('correct');
  });

  it('grades an incorrect fill_blank', () => {
    expect(gradeSingleQuestion(fillBlank('42'), '7', null, MATH).status).toBe('incorrect');
  });

  it('routes an un-keyed essay/short_answer to manual review', () => {
    const essay = { type: 'essay', points: 4, question: 'Discutez.' };
    expect(gradeSingleQuestion(essay, 'Une longue réponse.', null, MATH).status).toBe('manual');
  });
});
