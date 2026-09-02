import { toProgressMap } from '../masteryService';
import { lessonMastery, summarize } from '../../../shared/mastery';

// toProgressMap is the seam between how the web has ALWAYS stored progress
// (completedLessons: string[] on users/{uid}/progress/{courseId}) and the
// per-lesson records the mastery ladder needs (users/{uid}/mastery/lessons —
// the same document the mobile app writes). The two sides come from two
// different documents, and getting the join wrong would either erase existing
// students' progress or quietly ignore what they did on their phone.
describe('toProgressMap', () => {
  it('returns an empty map for a missing or empty doc', () => {
    expect(toProgressMap(undefined)).toEqual({});
    expect(toProgressMap(null)).toEqual({});
    expect(toProgressMap({})).toEqual({});
  });

  it('keeps existing students at `seen` from completedLessons alone', () => {
    const map = toProgressMap({ completedLessons: ['L1', 'L2'] });
    expect(lessonMastery(map.L1)).toBe('seen');
    expect(lessonMastery(map.L2)).toBe('seen');
  });

  it('reads the earned rungs from the lessons map', () => {
    const map = toProgressMap({
      lessons: {
        L1: { bestPct: 80 },
        L2: { bestPct: 100 },
        L3: { masteredAt: 1_700_000_000_000 },
      },
    });
    expect(lessonMastery(map.L1)).toBe('familiar');
    expect(lessonMastery(map.L2)).toBe('proficient');
    expect(lessonMastery(map.L3)).toBe('mastered');
  });

  it('merges both sources without letting completedLessons flatten a higher rung', () => {
    // The bug to avoid: writing `completed` last must not overwrite bestPct.
    const map = toProgressMap({
      completedLessons: ['L1'],
      lessons: { L1: { bestPct: 100 } },
    });
    expect(map.L1).toEqual({ bestPct: 100, completed: true });
    expect(lessonMastery(map.L1)).toBe('proficient');
  });

  it('marks a completed lesson that has no record yet', () => {
    const map = toProgressMap({ completedLessons: ['L9'], lessons: { L1: { bestPct: 90 } } });
    // L9 was only watched — no exercise score, so it stops at `seen`. The
    // sibling record must not leak into it.
    expect(map.L9).toEqual({ completed: true });
    expect(lessonMastery(map.L9)).toBe('seen');
    expect(lessonMastery(map.L1)).toBe('familiar');
  });

  it('reads a record the MOBILE app wrote, `completed` and all', () => {
    // Mobile writes the full record into the mastery doc, including the
    // completed flag. The web must read it as-is rather than needing the
    // lesson to also appear in its own course-level completedLessons array.
    const map = toProgressMap({
      lessons: { L1: { completed: true, bestPct: 100, masteredAt: 1_700_000_000_000 } },
      completedLessons: [],
    });
    expect(lessonMastery(map.L1)).toBe('mastered');
    expect(map.L1?.completed).toBe(true);
  });

  it('carries lessons from OTHER courses through untouched', () => {
    // The mastery doc holds every course at once, so a read for math still
    // returns the chemistry lessons. Callers render by lesson id, and dropping
    // them here would mean one read per course instead of one in total.
    const map = toProgressMap({
      lessons: { 'MATH-U1-L1': { bestPct: 100 }, 'CHEM-U1-L1': { bestPct: 80 } },
      completedLessons: ['MATH-U1-L2'],
    });
    expect(Object.keys(map).sort()).toEqual(['CHEM-U1-L1', 'MATH-U1-L1', 'MATH-U1-L2']);
    expect(lessonMastery(map['CHEM-U1-L1'])).toBe('familiar');
  });

  it('ignores malformed entries in the lessons map', () => {
    const map = toProgressMap({ lessons: { L1: null, L2: 'nope', L3: { bestPct: 75 } } });
    expect(map.L1).toBeUndefined();
    expect(map.L2).toBeUndefined();
    expect(lessonMastery(map.L3)).toBe('familiar');
  });

  it('feeds summarize so a unit bar means mastery, not videos watched', () => {
    const map = toProgressMap({
      completedLessons: ['L1'],
      lessons: { L2: { bestPct: 100 }, L3: { masteredAt: 1 } },
    });
    const s = summarize(['L1', 'L2', 'L3'], map);
    // seen(25) + proficient(80) + mastered(100) = 205 / 3
    expect(s.points).toBe(68);
    // A group is only as strong as its weakest lesson.
    expect(s.level).toBe('seen');
    expect(s.mastered).toBe(1);
    expect(s.started).toBe(3);
  });

  it('counts an untouched lesson as none, not as started', () => {
    const s = summarize(['A', 'B'], toProgressMap({ completedLessons: ['A'] }));
    expect(s.started).toBe(1);
    expect(s.counts.none).toBe(1);
    expect(s.level).toBe('none');
  });
});
