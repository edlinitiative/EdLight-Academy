import { diffRanks, advanceSnapshot, localDayKey, type RankSnapshot } from '../rankDeltas';

describe('diffRanks', () => {
  it('is positive for climbs, negative for drops, absent for new entrants', () => {
    const baseline = { a: 1, b: 2, c: 3 };
    const current = { a: 2, b: 1, c: 3, d: 4 };
    expect(diffRanks(baseline, current)).toEqual({ a: -1, b: 1 });
  });

  it('returns {} without a baseline', () => {
    expect(diffRanks(undefined, { a: 1 })).toEqual({});
  });
});

describe('advanceSnapshot', () => {
  const ranks = { ted: 9, dudley: 2 };

  it('starts fresh with no stored snapshot (no baseline)', () => {
    const { next, baseline } = advanceSnapshot(null, '2026-W33', '2026-08-10', ranks);
    expect(baseline).toBeUndefined();
    expect(next).toEqual({ week: '2026-W33', date: '2026-08-10', ranks });
  });

  it('starts fresh when the week changes — Monday reset shows no arrows', () => {
    const stored: RankSnapshot = { week: '2026-W32', date: '2026-08-09', ranks: { ted: 3 } };
    const { next, baseline } = advanceSnapshot(stored, '2026-W33', '2026-08-10', ranks);
    expect(baseline).toBeUndefined();
    expect(next.week).toBe('2026-W33');
    expect(next.prev).toBeUndefined();
  });

  it('same day: keeps the morning snapshot and diffs against yesterday', () => {
    const stored: RankSnapshot = {
      week: '2026-W33', date: '2026-08-11', ranks: { ted: 8 },
      prev: { date: '2026-08-10', ranks: { ted: 9 } },
    };
    const { next, baseline } = advanceSnapshot(stored, '2026-W33', '2026-08-11', { ted: 7 });
    expect(next).toBe(stored); // unchanged — ranks stay "as of this morning"
    expect(baseline).toEqual({ ted: 9 });
  });

  it('new day: yesterday becomes the baseline', () => {
    const stored: RankSnapshot = { week: '2026-W33', date: '2026-08-10', ranks: { ted: 9 } };
    const { next, baseline } = advanceSnapshot(stored, '2026-W33', '2026-08-11', { ted: 7 });
    expect(baseline).toEqual({ ted: 9 });
    expect(next).toEqual({
      week: '2026-W33', date: '2026-08-11', ranks: { ted: 7 },
      prev: { date: '2026-08-10', ranks: { ted: 9 } },
    });
  });
});

describe('localDayKey', () => {
  it('formats the local date as YYYY-MM-DD', () => {
    expect(localDayKey(new Date(2026, 7, 10, 23, 59))).toBe('2026-08-10');
    expect(localDayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
