import { getDailyChallengeQuestions, DAILY_GEO_CAP } from '../dailyChallenge';

/** n dummy questions for a bank. */
const bank = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({ q: `${prefix}-${i}`, options: ['a', 'b'], answer: 0 }));

const BIG_MAP = {
  capitals: bank('cap', 60),
  currencies: bank('cur', 60),
  flags: bank('flag', 60),
  histoire_haiti: bank('hist', 40),
  sciences: bank('sci', 40),
};

const geoCount = (qs: any[]) =>
  qs.filter((q) => ['capitals', 'currencies', 'flags'].includes(q.__category)).length;

describe('getDailyChallengeQuestions', () => {
  it('serves the requested count', () => {
    expect(getDailyChallengeQuestions(BIG_MAP, '2026-08-10')).toHaveLength(10);
  });

  it('caps geography at DAILY_GEO_CAP even though those banks dominate the pool', () => {
    for (const date of ['2026-08-10', '2026-08-11', '2026-08-12', '2026-09-01']) {
      const qs = getDailyChallengeQuestions(BIG_MAP, date);
      expect(geoCount(qs)).toBeLessThanOrEqual(DAILY_GEO_CAP);
    }
  });

  it('is deterministic per date and varies across dates', () => {
    const a1 = getDailyChallengeQuestions(BIG_MAP, '2026-08-10').map((q: any) => q.q);
    const a2 = getDailyChallengeQuestions(BIG_MAP, '2026-08-10').map((q: any) => q.q);
    const b = getDailyChallengeQuestions(BIG_MAP, '2026-08-11').map((q: any) => q.q);
    expect(a1).toEqual(a2);
    expect(a1).not.toEqual(b);
  });

  it('tops back up from geography when the hand-written pool is too small', () => {
    const small = { capitals: bank('cap', 60), histoire_haiti: bank('hist', 2) };
    const qs = getDailyChallengeQuestions(small, '2026-08-10');
    expect(qs).toHaveLength(10);
    expect(geoCount(qs)).toBe(8); // 2 rest + 8 geo fill
  });

  it('returns [] for an empty pool', () => {
    expect(getDailyChallengeQuestions({}, '2026-08-10')).toEqual([]);
  });
});
