import {
  applyReviewOutcome, isDue, dueQuestionIds, pruneReview, mergeReview,
  sameReview, toReviewWire, RESOLVED_TTL_MS, type ReviewMap,
} from '../review';

const NOW = 1_700_000_000_000;

describe('applyReviewOutcome', () => {
  it('stamps missedAt on a wrong answer', () => {
    const e = applyReviewOutcome(undefined, false, NOW, { subjectCode: 'MATH', unitNo: 2, lessonId: 'l1' });
    expect(e).toEqual({ missedAt: NOW, subjectCode: 'MATH', unitNo: 2, lessonId: 'l1' });
  });

  it('ignores a correct answer on a never-missed question', () => {
    expect(applyReviewOutcome(undefined, true, NOW)).toBeNull();
  });

  it('resolves a missed question on a correct answer', () => {
    const missed = applyReviewOutcome(undefined, false, NOW)!;
    const resolved = applyReviewOutcome(missed, true, NOW + 1000)!;
    expect(isDue(resolved)).toBe(false);
    expect(resolved.correctAt).toBe(NOW + 1000);
  });

  it('re-missing a resolved question makes it due again', () => {
    const cycle = applyReviewOutcome(
      applyReviewOutcome(applyReviewOutcome(undefined, false, NOW)!, true, NOW + 1)!,
      false, NOW + 2,
    )!;
    expect(isDue(cycle)).toBe(true);
  });

  it('timestamps never move backwards', () => {
    const e = applyReviewOutcome({ missedAt: NOW }, false, NOW - 5000)!;
    expect(e.missedAt).toBe(NOW);
  });

  it('keeps existing meta over later meta', () => {
    const e = applyReviewOutcome({ missedAt: NOW, lessonId: 'a' }, false, NOW + 1, { lessonId: 'b' })!;
    expect(e.lessonId).toBe('a');
  });
});

describe('dueQuestionIds', () => {
  it('lists due questions, most recently missed first', () => {
    const map: ReviewMap = {
      old: { missedAt: NOW - 100 },
      fresh: { missedAt: NOW },
      fixed: { missedAt: NOW - 50, correctAt: NOW - 10 },
    };
    expect(dueQuestionIds(map)).toEqual(['fresh', 'old']);
  });
});

describe('pruneReview', () => {
  it('drops resolved entries past the TTL, keeps due ones forever', () => {
    const ancient = NOW - RESOLVED_TTL_MS - 1000;
    const map: ReviewMap = {
      staleResolved: { missedAt: ancient - 10, correctAt: ancient },
      freshResolved: { missedAt: NOW - 20, correctAt: NOW - 10 },
      ancientDue: { missedAt: ancient },
    };
    const pruned = pruneReview(map, NOW);
    expect(Object.keys(pruned).sort()).toEqual(['ancientDue', 'freshResolved']);
  });
});

describe('mergeReview', () => {
  it('is a lattice join: latest timestamps win, both sides keep their work', () => {
    const phone: ReviewMap = { q1: { missedAt: NOW }, q2: { missedAt: NOW - 100, correctAt: NOW - 50 } };
    const tablet: ReviewMap = { q1: { missedAt: NOW - 10, correctAt: NOW + 5 }, q3: { missedAt: NOW - 30 } };
    const merged = mergeReview(phone, tablet);
    expect(merged.q1).toEqual({ missedAt: NOW, correctAt: NOW + 5 });
    expect(isDue(merged.q1)).toBe(false);
    expect(merged.q2).toEqual({ missedAt: NOW - 100, correctAt: NOW - 50 });
    expect(merged.q3).toEqual({ missedAt: NOW - 30 });
  });

  it('is commutative and idempotent', () => {
    const a: ReviewMap = { q1: { missedAt: 5 }, q2: { missedAt: 1, correctAt: 3 } };
    const b: ReviewMap = { q1: { missedAt: 2, correctAt: 9 } };
    expect(mergeReview(a, b)).toEqual(mergeReview(b, a));
    expect(mergeReview(mergeReview(a, b), b)).toEqual(mergeReview(a, b));
  });
});

describe('sameReview / toReviewWire', () => {
  it('sameReview compares the timestamps that matter', () => {
    expect(sameReview({ q: { missedAt: 1 } }, { q: { missedAt: 1 } })).toBe(true);
    expect(sameReview({ q: { missedAt: 1 } }, { q: { missedAt: 2 } })).toBe(false);
    expect(sameReview({ q: { missedAt: 1 } }, {})).toBe(false);
  });

  it('toReviewWire strips undefined fields and empty entries', () => {
    const wire = toReviewWire({
      q1: { missedAt: 1, subjectCode: undefined as any },
      q2: {},
      q3: undefined,
    });
    expect(wire).toEqual({ q1: { missedAt: 1 } });
  });
});
