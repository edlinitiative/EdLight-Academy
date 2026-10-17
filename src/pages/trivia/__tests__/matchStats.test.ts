import { answerTicks, celebrationSize, currentStreak, fastestCorrect, formatSeconds, longestStreak, newThemeRecord } from '../matchStats';

const a = (correct: boolean, ms?: number, selected = correct ? 0 : 1) => ({ question: { q: `q${ms}` }, selected, correct, ms });

it('tells the round in order, timeouts apart from wrong answers', () => {
  expect(answerTicks([a(true), a(false), a(false, 1, -1)])).toEqual(['correct', 'wrong', 'timeout']);
});

it('finds the longest run of correct answers with its question numbers', () => {
  expect(longestStreak([a(true), a(false), a(true), a(true), a(true), a(false)])).toEqual({ length: 3, from: 3, to: 5 });
  expect(longestStreak([a(false), a(false)])).toBeNull();
  expect(currentStreak([a(false), a(true), a(true)])).toBe(2);
  expect(currentStreak([a(true), a(false)])).toBe(0);
});

it('counts only CORRECT answers with a real time as the fastest', () => {
  const f = fastestCorrect([a(false, 300), a(true, 2400), a(true, 1900), a(true)]);
  expect(f).toMatchObject({ ms: 1900, index: 2 });
  expect(fastestCorrect([a(false, 100)])).toBeNull();
  expect(formatSeconds(1900)).toBe('1,9 s');
  expect(formatSeconds(1900, true)).toBe('1.9 s');
});

it('calls a record only when it beats a real earlier game', () => {
  expect(newThemeRecord(null, 90)).toBeNull();
  expect(newThemeRecord({ games: 0, bestPct: 0 }, 90)).toBeNull();
  expect(newThemeRecord({ games: 3, bestPct: 60 }, 60)).toBeNull();
  expect(newThemeRecord({ games: 3, bestPct: 60 }, 80)).toEqual({ prevPct: 60 });
});

it('keeps routine wins small', () => {
  expect(celebrationSize({ score: 7, total: 10, record: false, leveledUp: false })).toBe('routine');
  expect(celebrationSize({ score: 10, total: 10, record: false, leveledUp: false })).toBe('big');
  expect(celebrationSize({ score: 4, total: 10, record: true, leveledUp: false })).toBe('big');
});
