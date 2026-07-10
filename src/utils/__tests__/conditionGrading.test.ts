import { gradeSingleQuestion, gradeExam } from '../examUtils';

/**
 * Grading contract for the guided "condition builder" answer type.
 *
 * A question carries a `conditions` array: each entry has a fixed `left`
 * expression, an expected `operator`, and an expected `value` (+ optional
 * `alternatives`). The student's answer is a JSON array of `{operator, value}`
 * rows aligned to those conditions. A row is correct iff its operator matches
 * (synonyms like >= / ≥ are equivalent) AND its value matches via the existing
 * answerMatches (numeric tolerance / CAS / text). Scoring is proportional and
 * order-independent; full marks only when every condition is met.
 */

const domainQuestion = {
  type: 'fill_blank',
  points: 4,
  correct: ']0, +∞[ \\ {ln 2}',
  conditions: [
    { left: 'x', operator: '>', value: '0' },
    { left: 'e^x', operator: '≠', value: '2' },
  ],
};

const answer = (rows: Array<{ operator: string; value: string }>) => JSON.stringify(rows);

describe('condition-builder grading', () => {
  it('marks all-correct conditions as correct with full points', () => {
    const r = gradeSingleQuestion(
      domainQuestion,
      answer([{ operator: '>', value: '0' }, { operator: '≠', value: '2' }]),
    );
    expect(r.status).toBe('correct');
    expect(r.result.awarded).toBe(4);
  });

  it('is order-independent', () => {
    const r = gradeSingleQuestion(
      domainQuestion,
      answer([{ operator: '≠', value: '2' }, { operator: '>', value: '0' }]),
    );
    expect(r.status).toBe('correct');
    expect(r.result.awarded).toBe(4);
  });

  it('gives partial credit for one correct condition', () => {
    const r = gradeSingleQuestion(
      domainQuestion,
      answer([{ operator: '>', value: '0' }, { operator: '=', value: '2' }]),
    );
    expect(r.status).toBe('partial');
    expect(r.result.awarded).toBe(2); // 1 of 2 → half of 4
  });

  it('treats operator synonyms (≥ vs >=) as equal', () => {
    const q = {
      type: 'fill_blank',
      points: 2,
      correct: 'x >= 1',
      conditions: [{ left: 'x', operator: '≥', value: '1' }],
    };
    const r = gradeSingleQuestion(q, answer([{ operator: '>=', value: '1' }]));
    expect(r.status).toBe('correct');
  });

  it('rejects a wrong operator even when the value is right', () => {
    const r = gradeSingleQuestion(
      domainQuestion,
      answer([{ operator: '<', value: '0' }, { operator: '≠', value: '2' }]),
    );
    expect(r.status).toBe('partial');
    expect(r.result.awarded).toBe(2);
  });

  it('returns unanswered when no rows are filled', () => {
    const r = gradeSingleQuestion(domainQuestion, answer([{ operator: '', value: '' }]));
    expect(r.status).toBe('unanswered');
  });

  it('does not affect questions without conditions', () => {
    const plain = { type: 'fill_blank', points: 1, correct: '42' };
    const r = gradeSingleQuestion(plain, '42');
    expect(r.status).toBe('correct');
  });

  // Final-submit path: gradeExam duplicates grading logic (does not delegate to
  // gradeSingleQuestion), so conditions must be handled there too.
  it('grades conditions on the final-submit path (gradeExam)', () => {
    const { summary, results } = gradeExam(
      [domainQuestion],
      { 0: answer([{ operator: '>', value: '0' }, { operator: '≠', value: '2' }]) },
    );
    expect(results[0].status).toBe('correct');
    expect(results[0].result.awarded).toBe(4);
    expect(summary.earnedPoints).toBe(4);
  });

  it('gives partial credit on gradeExam too', () => {
    const { results } = gradeExam(
      [domainQuestion],
      { 0: answer([{ operator: '>', value: '0' }, { operator: '=', value: '2' }]) },
    );
    expect(results[0].status).toBe('partial');
    expect(results[0].result.awarded).toBe(2);
  });
});
