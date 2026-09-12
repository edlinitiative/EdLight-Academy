/**
 * The promise this module makes is strong and easy to break by accident:
 * you see every question in a category before you see any of them twice.
 * These tests are mostly that one sentence, checked from several directions.
 */
import {
  drawRound,
  drawAndRemember,
  questionId,
  loadSeen,
  saveSeen,
} from '../questionRotation';

const bank = (n: number) => Array.from({ length: n }, (_, i) => ({ q: `Question ${i}` }));
const ids = (qs: Array<{ q?: string }>) => qs.map((x) => questionId(x));

describe('drawing a round', () => {
  it('returns the number asked for', () => {
    expect(drawRound(bank(50), 10).questions).toHaveLength(10);
  });

  it('never repeats inside a single round', () => {
    const { questions } = drawRound(bank(50), 10);
    expect(new Set(ids(questions)).size).toBe(10);
  });

  it('never serves a question already seen, while the bag has any left', () => {
    const b = bank(50);
    const seen = ids(b.slice(0, 40));
    const { questions } = drawRound(b, 10, seen);
    expect(ids(questions).some((id) => seen.includes(id))).toBe(false);
  });

  it('serves EVERY question before repeating any', () => {
    // The whole point. 60 questions, rounds of 10: six rounds must cover the
    // bank exactly, with no duplicate anywhere across them.
    const b = bank(60);
    let seen: string[] = [];
    const served: string[] = [];
    for (let round = 0; round < 6; round += 1) {
      const draw = drawRound(b, 10, seen);
      served.push(...ids(draw.questions));
      seen = draw.seen;
    }
    expect(served).toHaveLength(60);
    expect(new Set(served).size).toBe(60);
    expect(new Set(served)).toEqual(new Set(ids(b)));
  });

  it('refills the bag rather than running short', () => {
    const b = bank(12);
    const draw = drawRound(b, 10, ids(b.slice(0, 8)));
    expect(draw.questions).toHaveLength(10);
    expect(new Set(ids(draw.questions)).size).toBe(10);
    expect(draw.recycled).toBe(true);
  });

  it('does not repeat next round what it just recycled', () => {
    // A repeat one round later is the exact annoyance this exists to remove,
    // so the whole recycling round is held back, not just the new-bag part.
    const b = bank(12);
    const first = drawRound(b, 10, ids(b.slice(0, 8)));
    const second = drawRound(b, 2, first.seen);
    const overlap = ids(second.questions).filter((id) => ids(first.questions).includes(id));
    expect(overlap).toEqual([]);
  });

  it('keeps working when the round is bigger than the bank', () => {
    const draw = drawRound(bank(4), 10);
    expect(draw.questions).toHaveLength(4);
    expect(new Set(ids(draw.questions)).size).toBe(4);
  });

  it('handles an empty or missing bank without throwing', () => {
    expect(drawRound([], 10).questions).toEqual([]);
    expect(drawRound(undefined as never, 10).questions).toEqual([]);
  });

  it('drops ids of questions that no longer exist', () => {
    // An admin deleting a question would otherwise leave its id in the list for
    // ever, permanently shrinking the bag.
    const b = bank(20);
    const stale = ['zzz-deleted', 'yyy-deleted'];
    const { seen } = drawRound(b, 5, [...ids(b.slice(0, 3)), ...stale]);
    expect(seen).not.toContain('zzz-deleted');
    expect(seen).not.toContain('yyy-deleted');
  });

  it('actually varies the order between rounds', () => {
    // Guard against a "shuffle" that returns the bank in its original order.
    const b = bank(40);
    const a1 = ids(drawRound(b, 10).questions).join();
    const a2 = ids(drawRound(b, 10).questions).join();
    expect(a1).not.toBe(a2);
  });
});

describe('identifying a question', () => {
  it('is stable for the same text', () => {
    expect(questionId({ q: 'Ki kapital Kanada ?' })).toBe(questionId({ q: 'Ki kapital Kanada ?' }));
  });

  it('differs between different questions', () => {
    expect(questionId({ q: 'A' })).not.toBe(questionId({ q: 'B' }));
  });

  it('is unaffected by option order, which is reshuffled on every load', () => {
    const a = { q: 'Capitale ?', options: ['x', 'y'], answer: 0 };
    const b = { q: 'Capitale ?', options: ['y', 'x'], answer: 1 };
    expect(questionId(a)).toBe(questionId(b));
  });

  it('prefers an explicit id when one exists', () => {
    expect(questionId({ id: 'fs-123', q: 'anything' })).toBe(questionId({ id: 'fs-123', q: 'other' }));
  });

  it('does not throw on a malformed question', () => {
    expect(typeof questionId({} as never)).toBe('string');
  });
});

describe('remembering across rounds', () => {
  beforeEach(() => window.localStorage.clear());

  it('persists what was served and excludes it next time', () => {
    const b = bank(40);
    const first = drawAndRemember('geo', b, 10);
    const second = drawAndRemember('geo', b, 10);
    const overlap = ids(second).filter((id) => ids(first).includes(id));
    expect(overlap).toEqual([]);
  });

  it('keeps categories separate', () => {
    saveSeen('geo', ['a', 'b']);
    expect(loadSeen('sciences')).toEqual([]);
    expect(loadSeen('geo')).toEqual(['a', 'b']);
  });

  it('survives corrupt stored data', () => {
    window.localStorage.setItem('edlight-trivia-seen-v1:geo', '{not json');
    expect(loadSeen('geo')).toEqual([]);
  });

  it('ignores stored data of the wrong shape', () => {
    window.localStorage.setItem('edlight-trivia-seen-v1:geo', '{"a":1}');
    expect(loadSeen('geo')).toEqual([]);
  });

  it('still returns a full round when storage throws', () => {
    // A private window, or site data blocked. The game must not break.
    const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('access denied');
    });
    const setSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    expect(drawAndRemember('geo', bank(40), 10)).toHaveLength(10);
    spy.mockRestore();
    setSpy.mockRestore();
  });
});
