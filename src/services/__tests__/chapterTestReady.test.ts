import { chapterTestReady, summarize, type ProgressMap } from '../../../shared/mastery';

// chapterTestReady gates the ONLY route to `mastered`, on both platforms. Too
// strict and the top rung is unreachable; too loose and students are handed a
// whole-unit test before they've practised anything in it.
describe('chapterTestReady', () => {
  const summaryFor = (progress: ProgressMap, ids: string[]) => summarize(ids, progress);

  it('stays closed when nothing in the unit has been practised', () => {
    // Watching every video is not practice — `seen` carries no evidence a test
    // could confirm, so the gate holds.
    expect(chapterTestReady(summaryFor({}, ['a', 'b']))).toBe(false);
    expect(chapterTestReady(summaryFor({ a: { completed: true }, b: { completed: true } }, ['a', 'b']))).toBe(false);
  });

  it('opens as soon as ONE lesson reaches familiar', () => {
    // Not "every lesson proficient": a student who knows one of five lessons
    // well should be able to bank that one.
    expect(chapterTestReady(summaryFor({ a: { bestPct: 70 } }, ['a', 'b', 'c']))).toBe(true);
  });

  it('opens for proficient and stays open once something is mastered', () => {
    expect(chapterTestReady(summaryFor({ a: { bestPct: 100 } }, ['a', 'b']))).toBe(true);
    expect(chapterTestReady(summaryFor({ a: { masteredAt: 1 } }, ['a', 'b']))).toBe(true);
  });

  it('is false for a unit with no lessons at all', () => {
    expect(chapterTestReady(summaryFor({}, []))).toBe(false);
  });

  it('ignores a below-threshold attempt, which only earns `seen`', () => {
    // 69% is a real attempt but not yet familiar, so it must not open the gate.
    expect(chapterTestReady(summaryFor({ a: { bestPct: 69 } }, ['a', 'b']))).toBe(false);
    expect(chapterTestReady(summaryFor({ a: { bestPct: 70 } }, ['a', 'b']))).toBe(true);
  });
});
