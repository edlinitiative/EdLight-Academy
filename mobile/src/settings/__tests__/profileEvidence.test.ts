import { countLessonEvidence, lessonEvidence } from '../profileEvidence';

describe('profile evidence', () => {
  it('a finished video is "completed", never mastered', () => {
    expect(lessonEvidence({ completed: true })).toBe('completed');
  });
  it('counts each lesson once at its strongest evidence', () => {
    expect(countLessonEvidence({
      a: { completed: true },
      b: { completed: true, bestPct: 60 },
      c: { bestPct: 100 },
      d: { completed: true, bestPct: 100, masteredAt: 1 },
      e: {},
      f: undefined,
    })).toEqual({ completed: 1, practised: 2, mastered: 1 });
    expect(countLessonEvidence(null)).toEqual({ completed: 0, practised: 0, mastered: 0 });
  });
});
