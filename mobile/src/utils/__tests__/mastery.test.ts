import {
  lessonMastery,
  lessonPoints,
  atLeast,
  nextLevel,
  summarize,
  courseLessonIds,
  applyExerciseScore,
  applyChapterTestResult,
  masteryLabel,
  masteryNextStep,
  MASTERY_POINTS,
  FAMILIAR_THRESHOLD,
  type LessonProgress,
} from '../mastery';

describe('lessonMastery', () => {
  it('is none for an untouched lesson', () => {
    expect(lessonMastery(undefined)).toBe('none');
    expect(lessonMastery(null)).toBe('none');
    expect(lessonMastery({})).toBe('none');
  });

  it('counts a watched video as seen', () => {
    expect(lessonMastery({ completed: true })).toBe('seen');
  });

  it('counts a failed attempt as seen, not none', () => {
    expect(lessonMastery({ bestPct: 0 })).toBe('seen');
    expect(lessonMastery({ bestPct: 40 })).toBe('seen');
  });

  it('promotes to familiar at the threshold', () => {
    expect(lessonMastery({ bestPct: FAMILIAR_THRESHOLD - 1 })).toBe('seen');
    expect(lessonMastery({ bestPct: FAMILIAR_THRESHOLD })).toBe('familiar');
    expect(lessonMastery({ bestPct: 99 })).toBe('familiar');
  });

  it('requires a perfect exercise round for proficient', () => {
    expect(lessonMastery({ bestPct: 100 })).toBe('proficient');
  });

  it('only reaches mastered through the chapter test', () => {
    expect(lessonMastery({ bestPct: 100 })).toBe('proficient');
    expect(lessonMastery({ bestPct: 100, masteredAt: 1 })).toBe('mastered');
  });

  it('lets masteredAt outrank a weak score', () => {
    expect(lessonMastery({ bestPct: 10, masteredAt: 1 })).toBe('mastered');
  });
});

describe('points and ordering', () => {
  it('maps levels to the documented point values', () => {
    expect(lessonPoints({})).toBe(0);
    expect(lessonPoints({ completed: true })).toBe(25);
    expect(lessonPoints({ bestPct: 80 })).toBe(50);
    expect(lessonPoints({ bestPct: 100 })).toBe(80);
    expect(lessonPoints({ masteredAt: 1 })).toBe(100);
  });

  it('orders levels low to high', () => {
    expect(atLeast('mastered', 'proficient')).toBe(true);
    expect(atLeast('seen', 'familiar')).toBe(false);
    expect(atLeast('familiar', 'familiar')).toBe(true);
  });

  it('caps nextLevel at the top', () => {
    expect(nextLevel('none')).toBe('seen');
    expect(nextLevel('proficient')).toBe('mastered');
    expect(nextLevel('mastered')).toBe('mastered');
  });
});

describe('summarize', () => {
  const progress = {
    a: { masteredAt: 1 },
    b: { bestPct: 100 },
    c: { bestPct: 75 },
    d: { completed: true },
    e: {},
  };

  it('averages points rather than counting finished videos', () => {
    // 100 + 80 + 50 + 25 + 0 = 255 / 5 = 51
    expect(summarize(['a', 'b', 'c', 'd', 'e'], progress).points).toBe(51);
  });

  it('takes the weakest lesson as the group level', () => {
    expect(summarize(['a', 'b'], progress).level).toBe('proficient');
    expect(summarize(['a', 'e'], progress).level).toBe('none');
    expect(summarize(['a'], progress).level).toBe('mastered');
  });

  it('counts each level', () => {
    const s = summarize(['a', 'b', 'c', 'd', 'e'], progress);
    expect(s.counts).toEqual({ none: 1, seen: 1, familiar: 1, proficient: 1, mastered: 1 });
    expect(s.mastered).toBe(1);
    expect(s.started).toBe(4);
    expect(s.total).toBe(5);
  });

  it('handles an empty group without dividing by zero', () => {
    const s = summarize([], progress);
    expect(s.points).toBe(0);
    expect(s.level).toBe('none');
    expect(s.total).toBe(0);
  });

  it('treats unknown lesson ids as untouched', () => {
    expect(summarize(['nope'], progress).points).toBe(0);
  });
});

describe('courseLessonIds', () => {
  it('flattens units in order', () => {
    const course = {
      modules: [
        { lessons: [{ id: 'l1' }, { id: 'l2' }] },
        { lessons: [{ id: 'l3' }] },
      ],
    };
    expect(courseLessonIds(course)).toEqual(['l1', 'l2', 'l3']);
  });

  it('survives missing or malformed shapes', () => {
    expect(courseLessonIds(undefined)).toEqual([]);
    expect(courseLessonIds({})).toEqual([]);
    expect(courseLessonIds({ modules: [{}, { lessons: null }] })).toEqual([]);
    expect(courseLessonIds({ modules: [{ lessons: [{ id: 'x' }, {}] }] })).toEqual(['x']);
  });
});

describe('applyExerciseScore', () => {
  it('records a first attempt even when it is zero', () => {
    const next = applyExerciseScore(undefined, 0, 1000);
    expect(next).toEqual({ bestPct: 0, levelUpAt: 1000 });
    expect(lessonMastery(next!)).toBe('seen');
  });

  it('keeps the best score, never the latest', () => {
    const first = applyExerciseScore(undefined, 100, 1)!;
    expect(applyExerciseScore(first, 20, 2)).toBeNull();
    expect(lessonMastery(first)).toBe('proficient');
  });

  it('returns null when nothing improves, so callers can skip the write', () => {
    const prev: LessonProgress = { bestPct: 80 };
    expect(applyExerciseScore(prev, 80, 5)).toBeNull();
    expect(applyExerciseScore(prev, 79, 5)).toBeNull();
    expect(applyExerciseScore(prev, 81, 5)).not.toBeNull();
  });

  it('stamps levelUpAt only when the level actually changes', () => {
    // 40 → 60 is a better score but both are `seen`.
    expect(applyExerciseScore({ bestPct: 40 }, 60, 9)!.levelUpAt).toBeUndefined();
    // 40 → 70 crosses into `familiar`.
    expect(applyExerciseScore({ bestPct: 40 }, 70, 9)!.levelUpAt).toBe(9);
  });

  it('clamps out-of-range input', () => {
    expect(applyExerciseScore(undefined, 250, 1)!.bestPct).toBe(100);
    expect(applyExerciseScore(undefined, -5, 1)!.bestPct).toBe(0);
  });

  it('preserves the completed flag', () => {
    expect(applyExerciseScore({ completed: true }, 90, 1)!.completed).toBe(true);
  });
});

describe('applyChapterTestResult', () => {
  it('does nothing when the lesson was missed', () => {
    expect(applyChapterTestResult({ bestPct: 100 }, false, 1)).toBeNull();
  });

  it('never demotes a lesson on a miss', () => {
    const prev: LessonProgress = { masteredAt: 5 };
    expect(applyChapterTestResult(prev, false, 9)).toBeNull();
    expect(lessonMastery(prev)).toBe('mastered');
  });

  it('takes a proficient lesson to mastered', () => {
    const next = applyChapterTestResult({ bestPct: 100 }, true, 77)!;
    expect(lessonMastery(next)).toBe('mastered');
    expect(next.masteredAt).toBe(77);
  });

  it('promotes only one step at a time', () => {
    const seen = applyChapterTestResult({ completed: true }, true, 1)!;
    expect(lessonMastery(seen)).toBe('familiar');
    const familiar = applyChapterTestResult(seen, true, 2)!;
    expect(lessonMastery(familiar)).toBe('proficient');
    const mastered = applyChapterTestResult(familiar, true, 3)!;
    expect(lessonMastery(mastered)).toBe('mastered');
  });

  it('lifts an untouched lesson to seen', () => {
    const next = applyChapterTestResult(undefined, true, 1)!;
    expect(lessonMastery(next)).toBe('seen');
  });

  it('is a no-op once mastered', () => {
    expect(applyChapterTestResult({ masteredAt: 1 }, true, 2)).toBeNull();
  });

  it('writes a level that survives recomputation from the raw record', () => {
    // The promoted record must not depend on in-memory state: re-reading it
    // through lessonMastery has to yield the same level.
    let rec: LessonProgress | undefined = { completed: true };
    for (const expected of ['familiar', 'proficient', 'mastered'] as const) {
      rec = applyChapterTestResult(rec, true, 1)!;
      expect(lessonMastery(JSON.parse(JSON.stringify(rec)))).toBe(expected);
    }
  });
});

describe('copy', () => {
  it('has both languages for every level', () => {
    for (const level of Object.keys(MASTERY_POINTS) as Array<keyof typeof MASTERY_POINTS>) {
      expect(masteryLabel(level, false)).toBeTruthy();
      expect(masteryLabel(level, true)).toBeTruthy();
    }
  });

  it('stops asking for more once mastered', () => {
    expect(masteryNextStep('mastered', false)).toBeNull();
    expect(masteryNextStep('proficient', false)).toBeTruthy();
    expect(masteryNextStep('proficient', true)).toBeTruthy();
  });
});
