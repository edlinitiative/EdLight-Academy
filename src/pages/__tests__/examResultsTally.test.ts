/**
 * Regression test for the ExamResults correctness tally.
 *
 * WHY THIS EXISTS. The results page used to print `summary.correctCount`
 * under the label "Réponses correctes". That field is not a count: in
 * shared/examUtils.ts, a partially correct answer does
 * `correctCount += awarded / pts`, so the number can be 2.3333333333333335
 * and the four displayed "counts" do not add up to the number of questions.
 *
 * `statusTally` replaced it by counting the per-question verdicts. These tests
 * pin the two properties the UI now depends on: the buckets are integers, and
 * they always sum to the number of questions.
 */
// The page imports the Markdown renderer chain, which ships ESM-only and is
// not in Jest's transform set. `statusTally` is pure and touches none of it,
// so the chain is stubbed rather than transformed (these mocks are hoisted
// above the import below by babel-plugin-jest-hoist).
jest.mock('react-markdown', () => ({ __esModule: true, default: () => null }));
jest.mock('remark-gfm', () => ({ __esModule: true, default: () => undefined }));
jest.mock('remark-math', () => ({ __esModule: true, default: () => undefined }));
jest.mock('rehype-katex', () => ({ __esModule: true, default: () => undefined }));

import { statusTally } from '../ExamResults';

const q = (status: string, awarded = 0, maxPoints = 1) => ({
  status,
  result: { awarded, maxPoints },
  question: { type: 'multiple_choice' },
});

describe('statusTally', () => {
  it('buckets every verdict and totals the questions', () => {
    const tally = statusTally([
      q('correct', 1),
      q('scaffold-complete', 2, 2),
      q('partial', 1.5, 3),
      q('incorrect'),
      q('incorrect'),
      q('unanswered'),
      q('manual'),
    ]);

    expect(tally).toEqual({
      right: 2,       // correct + scaffold-complete
      partial: 1,
      wrong: 2,
      blank: 1,       // unanswered
      pending: 1,     // awaiting human correction
      total: 7,
    });
  });

  it('keeps every bucket an integer even when partial credit is fractional', () => {
    const tally = statusTally([q('partial', 1 / 3, 1), q('partial', 2 / 3, 1), q('correct', 1)]);
    for (const [key, value] of Object.entries(tally)) {
      expect(Number.isInteger(value)).toBe(true);
      expect(`${key}:${value}`).not.toMatch(/\./);
    }
  });

  it('always sums the displayed buckets back to the question count', () => {
    const decks = [
      [],
      [q('correct', 1)],
      [q('manual'), q('manual')],
      [q('correct', 1), q('partial', 0.5), q('incorrect'), q('unanswered'), q('manual')],
    ];
    for (const deck of decks) {
      const { right, partial, wrong, blank, pending, total } = statusTally(deck);
      expect(right + partial + wrong + blank + pending).toBe(total);
      expect(total).toBe(deck.length);
    }
  });

  it('files an unrecognised verdict as pending, never as an empty answer', () => {
    // "we cannot score this yet" is the safe fallback; "you left it blank"
    // would be an accusation the data does not support.
    const tally = statusTally([{ status: 'some-future-status' } as any]);
    expect(tally.pending).toBe(1);
    expect(tally.blank).toBe(0);
    expect(tally.total).toBe(1);
  });

  it('survives a malformed row rather than throwing on a results page', () => {
    expect(statusTally(null as any).total).toBe(0);
    expect(statusTally([null, undefined] as any).pending).toBe(2);
  });
});
