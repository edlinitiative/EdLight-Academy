import { mergeLesson, mergeProgress, sameProgress, toWireFormat } from '../masteryMerge';
import { lessonMastery } from '../mastery';

describe('mergeLesson', () => {
  it('keeps the better score from either side', () => {
    expect(mergeLesson({ bestPct: 40 }, { bestPct: 90 }).bestPct).toBe(90);
    expect(mergeLesson({ bestPct: 90 }, { bestPct: 40 }).bestPct).toBe(90);
  });

  it('never un-completes a lesson', () => {
    expect(mergeLesson({ completed: true }, {}).completed).toBe(true);
    expect(mergeLesson({}, { completed: true }).completed).toBe(true);
  });

  it('keeps mastery earned on either device', () => {
    expect(mergeLesson({ masteredAt: 500 }, {}).masteredAt).toBe(500);
    expect(mergeLesson({}, { masteredAt: 500 }).masteredAt).toBe(500);
  });

  it('keeps the date mastery was FIRST earned', () => {
    expect(mergeLesson({ masteredAt: 900 }, { masteredAt: 200 }).masteredAt).toBe(200);
  });

  it('keeps the most recent level-up as the what-is-new signal', () => {
    expect(mergeLesson({ levelUpAt: 100 }, { levelUpAt: 700 }).levelUpAt).toBe(700);
  });

  it('handles either side being absent', () => {
    expect(mergeLesson(undefined, { bestPct: 70 }).bestPct).toBe(70);
    expect(mergeLesson({ bestPct: 70 }, undefined).bestPct).toBe(70);
    expect(mergeLesson(undefined, undefined)).toEqual({});
  });

  it('preserves a legitimate zero score rather than treating it as absent', () => {
    expect(mergeLesson({ bestPct: 0 }, undefined).bestPct).toBe(0);
    expect(lessonMastery(mergeLesson({ bestPct: 0 }, undefined))).toBe('seen');
  });

  it('is commutative — sync order cannot change the outcome', () => {
    const a = { completed: true, bestPct: 70, masteredAt: 900, levelUpAt: 100 };
    const b = { bestPct: 100, masteredAt: 200, levelUpAt: 700 };
    expect(mergeLesson(a, b)).toEqual(mergeLesson(b, a));
  });

  it('is idempotent — re-syncing changes nothing', () => {
    const a = { completed: true, bestPct: 80, masteredAt: 5 };
    expect(mergeLesson(a, mergeLesson(a, a))).toEqual(mergeLesson(a, a));
  });
});

describe('mergeProgress', () => {
  it('carries lessons that exist on only one side', () => {
    const local = { l1: { bestPct: 100 } };
    const remote = { l2: { completed: true } };
    const out = mergeProgress(local, remote);
    expect(Object.keys(out).sort()).toEqual(['l1', 'l2']);
    expect(out.l1!.bestPct).toBe(100);
    expect(out.l2!.completed).toBe(true);
  });

  it('never loses work done offline on a second device', () => {
    // The failure mode a naive last-write-wins sync would cause.
    const phone = { l1: { masteredAt: 10 }, l2: { bestPct: 100 } };
    const staleTablet = { l1: { completed: true } };
    const out = mergeProgress(staleTablet, phone);
    expect(lessonMastery(out.l1)).toBe('mastered');
    expect(lessonMastery(out.l2)).toBe('proficient');
  });

  it('survives empty and missing maps', () => {
    expect(mergeProgress({}, {})).toEqual({});
    expect(mergeProgress(undefined as any, { a: { bestPct: 1 } }).a!.bestPct).toBe(1);
  });
});

describe('sameProgress', () => {
  it('is true for equivalent maps', () => {
    expect(sameProgress({ a: { bestPct: 70 } }, { a: { bestPct: 70 } })).toBe(true);
  });

  it('ignores levelUpAt, which is presentation-only', () => {
    expect(sameProgress({ a: { bestPct: 70, levelUpAt: 1 } }, { a: { bestPct: 70, levelUpAt: 9 } })).toBe(true);
  });

  it('detects a new lesson, a better score, and new mastery', () => {
    expect(sameProgress({ a: { bestPct: 70 } }, { a: { bestPct: 70 }, b: { completed: true } })).toBe(false);
    expect(sameProgress({ a: { bestPct: 70 } }, { a: { bestPct: 100 } })).toBe(false);
    expect(sameProgress({ a: { bestPct: 70 } }, { a: { bestPct: 70, masteredAt: 3 } })).toBe(false);
  });
});

describe('toWireFormat', () => {
  it('strips undefined, which Firestore rejects outright', () => {
    const wire = toWireFormat({ a: { completed: true, bestPct: undefined, masteredAt: undefined } });
    expect(wire.a).toEqual({ completed: true });
    expect(Object.values(wire).some((r) => Object.values(r).includes(undefined as any))).toBe(false);
  });

  it('drops lessons that carry no information', () => {
    expect(toWireFormat({ a: {}, b: undefined, c: { bestPct: 0 } })).toEqual({ c: { bestPct: 0 } });
  });

  it('round-trips through JSON without changing any level', () => {
    const progress = {
      a: { completed: true },
      b: { bestPct: 70 },
      c: { bestPct: 100 },
      d: { masteredAt: 12 },
    };
    const back = JSON.parse(JSON.stringify(toWireFormat(progress)));
    for (const id of Object.keys(progress)) {
      expect(lessonMastery(back[id])).toBe(lessonMastery((progress as any)[id]));
    }
  });
});
