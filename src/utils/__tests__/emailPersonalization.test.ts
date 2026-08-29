/**
 * Tests for api/_lib/emailPersonalization.ts — the pure helpers that turn raw
 * Firestore docs into the numbers a reminder email may show. The loader itself
 * is I/O glue; the rules live here.
 */
import {
  firstNameOf,
  aliveStreak,
  countMastered,
  countDueReview,
} from '../../../api/_lib/emailPersonalization';

describe('firstNameOf', () => {
  it('takes the first word and tolerates absence', () => {
    expect(firstNameOf('Ted Jacquet')).toBe('Ted');
    expect(firstNameOf('  Marie ')).toBe('Marie');
    expect(firstNameOf('')).toBeNull();
    expect(firstNameOf(null)).toBeNull();
  });
});

describe('aliveStreak', () => {
  const now = new Date('2026-08-29T12:00:00Z');
  it('accepts a streak active today or yesterday', () => {
    expect(aliveStreak(7, '2026-08-29', now)).toBe(7);
    expect(aliveStreak(7, '2026-08-28', now)).toBe(7);
  });
  it('rejects a stale streak — March must not greet a student in August', () => {
    expect(aliveStreak(7, '2026-03-02', now)).toBeNull();
  });
  it('rejects zero, absent, or malformed values', () => {
    expect(aliveStreak(0, '2026-08-29', now)).toBeNull();
    expect(aliveStreak(7, undefined, now)).toBeNull();
    expect(aliveStreak('7', '2026-08-29', now)).toBeNull();
  });
});

describe('countMastered', () => {
  it('counts only records with a masteredAt stamp', () => {
    expect(countMastered({
      a: { masteredAt: 123, bestPct: 100 },
      b: { bestPct: 90 },
      c: { masteredAt: 456 },
      d: null,
    })).toBe(2);
    expect(countMastered(null)).toBe(0);
    expect(countMastered('junk')).toBe(0);
  });
});

describe('countDueReview', () => {
  it('counts questions missed more recently than answered right', () => {
    expect(countDueReview({
      due: { missedAt: 100 },
      resolved: { missedAt: 100, correctAt: 200 },
      reMissed: { missedAt: 300, correctAt: 200 },
      neverMissed: { correctAt: 50 },
    })).toBe(2);
    expect(countDueReview(undefined)).toBe(0);
  });
});
