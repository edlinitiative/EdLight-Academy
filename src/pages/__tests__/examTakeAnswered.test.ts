/**
 * Regression tests for the two "what is still unanswered?" helpers on the
 * exam-taking screen.
 *
 * WHY THIS EXISTS. Four surfaces on that screen answer the same question —
 * the top-bar counter, the per-section badges in the question grid, the grid
 * buttons themselves, and the list of gaps in the Soumettre dialog — and they
 * used to answer it two different ways. The grid and the badges tested
 * `a != null && a !== ''`; the counter tested `isAnswerFilled`. A proof or
 * ladder answer is persisted as JSON (`{"steps":[{"math":""}],"finalAnswer":""}`),
 * so an untouched one is a NON-EMPTY STRING: the grid drew it as answered while
 * the submit dialog listed it as "sans réponse". A candidate deciding whether
 * to hand the paper in was reading contradictory numbers.
 *
 * These tests pin the semantics rather than the styling: which stored values
 * count as an answer, and where the "next gap" jump lands. Grading is not
 * involved — the grader reads `answers` directly and never calls either helper.
 */
jest.mock('react-markdown', () => ({ __esModule: true, default: () => null }));
jest.mock('remark-gfm', () => ({ __esModule: true, default: () => undefined }));
jest.mock('remark-math', () => ({ __esModule: true, default: () => undefined }));
jest.mock('rehype-katex', () => ({ __esModule: true, default: () => undefined }));

import { isAnswerFilled, nextUnansweredIndex } from '../ExamTake';

describe('isAnswerFilled', () => {
  it('treats nothing typed as unanswered', () => {
    expect(isAnswerFilled(undefined)).toBe(false);
    expect(isAnswerFilled(null)).toBe(false);
    expect(isAnswerFilled('')).toBe(false);
  });

  it('counts ordinary answers of every shape', () => {
    expect(isAnswerFilled('c')).toBe(true);           // multiple choice
    expect(isAnswerFilled('vrai')).toBe(true);        // true/false
    expect(isAnswerFilled('12')).toBe(true);          // calculation
    expect(isAnswerFilled('a|b|')).toBe(true);        // one of several blanks
    expect(isAnswerFilled('0')).toBe(true);           // a real numeric answer
  });

  it('does NOT count an untouched proof/ladder scaffold, which is stored as JSON', () => {
    // This is the case the two divergent tests disagreed about.
    expect(isAnswerFilled('{"steps":[{"math":"","justification":""}],"finalAnswer":""}')).toBe(false);
    expect(isAnswerFilled('[{"math":""},{"math":""}]')).toBe(false);
  });

  it('counts a proof scaffold once any step or the final answer has content', () => {
    expect(isAnswerFilled('{"steps":[{"math":"x^2=4"}],"finalAnswer":""}')).toBe(true);
    expect(isAnswerFilled('{"steps":[{"math":"   "}],"finalAnswer":"x=2"}')).toBe(true);
    expect(isAnswerFilled('[{"math":"2x"},{"math":""}]')).toBe(true);
  });

  it('counts text that merely starts like JSON but is not', () => {
    // A student may legitimately answer with a set or an interval.
    expect(isAnswerFilled('{1, 2, 3}')).toBe(true);
    expect(isAnswerFilled('[-3/2, 3]')).toBe(true);
  });

  it('counts a matching answer (a JSON object with no steps key)', () => {
    expect(isAnswerFilled('{"1":"b","2":"a"}')).toBe(true);
  });
});

describe('nextUnansweredIndex', () => {
  it('returns null when the paper is complete', () => {
    expect(nextUnansweredIndex([], 0)).toBeNull();
    expect(nextUnansweredIndex(undefined as unknown as number[], 0)).toBeNull();
  });

  it('jumps forward to the next gap', () => {
    expect(nextUnansweredIndex([2, 5, 9], 0)).toBe(2);
    expect(nextUnansweredIndex([2, 5, 9], 2)).toBe(5);
    expect(nextUnansweredIndex([2, 5, 9], 6)).toBe(9);
  });

  it('wraps around instead of dead-ending on the last gap', () => {
    expect(nextUnansweredIndex([2, 5, 9], 9)).toBe(2);
    expect(nextUnansweredIndex([2, 5, 9], 40)).toBe(2);
  });

  it('stays put when the only gap is the question already open', () => {
    expect(nextUnansweredIndex([4], 4)).toBe(4);
  });
});
