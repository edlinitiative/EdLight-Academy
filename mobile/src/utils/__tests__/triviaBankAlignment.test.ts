/**
 * The Kreyòl option at a position must translate the French option at that
 * position — otherwise a Kreyòl player is graded against another answer's
 * translation. randomizeBank used to shuffle only the French list.
 */
import { TRIVIA_QUESTIONS } from '../../data/triviaData';
import { bankHash, correctText } from '../../../../shared/duelGrading';

describe('trivia bank: FR/HT options stay paired after shuffling', () => {
  const banks = TRIVIA_QUESTIONS as unknown as Record<string, any[]>;

  it('identical FR/HT option sets are in the same order', () => {
    const misaligned: string[] = [];
    for (const [cat, qs] of Object.entries(banks)) {
      for (const q of qs) {
        if (!Array.isArray(q.optionsHt)) continue;
        const sameSet = [...q.options].sort().join('|') === [...q.optionsHt].sort().join('|');
        if (sameSet && q.optionsHt.some((h: string, i: number) => h !== q.options[i])) misaligned.push(`${cat}: ${q.q}`);
      }
    }
    expect(misaligned).toEqual([]);
  });

  it('every question has a gradable correct answer and every deck a bank hash', () => {
    for (const [cat, qs] of Object.entries(banks)) {
      expect(bankHash(qs)).toMatch(/^b[0-9a-f]{8}$/);
      for (const q of qs) expect({ cat, ok: correctText(q) !== null }).toEqual({ cat, ok: true });
    }
  });
});
