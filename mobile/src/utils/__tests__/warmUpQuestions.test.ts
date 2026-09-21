/**
 * The Arena waiting room's practice questions.
 *
 * Two properties, and the second one is the reason this is its own module:
 * the banks are shared module state, so a shuffle done carelessly here
 * reorders the Trivia tab's game and the daily challenge from inside the
 * Arena's waiting room.
 */
import { pickWarmUpQuestions, WARMUP_POOL } from '../warmUpQuestions';
import { TRIVIA_QUESTIONS } from '../../data/triviaData';

describe('pickWarmUpQuestions', () => {
  it('returns the number asked for', () => {
    expect(pickWarmUpQuestions(12)).toHaveLength(12);
    expect(pickWarmUpQuestions(1)).toHaveLength(1);
    expect(pickWarmUpQuestions(0)).toHaveLength(0);
  });

  it('never mutates the shared banks', () => {
    const before = WARMUP_POOL.map((k) => (TRIVIA_QUESTIONS[k] as any[]).map((q) => q.q).join('|'));
    pickWarmUpQuestions(30);
    pickWarmUpQuestions(30);
    const after = WARMUP_POOL.map((k) => (TRIVIA_QUESTIONS[k] as any[]).map((q) => q.q).join('|'));
    expect(after).toEqual(before);
  });

  it('hands back usable questions — a prompt, options, and an answer in range', () => {
    for (const q of pickWarmUpQuestions(20)) {
      expect(typeof q.q).toBe('string');
      expect(q.q.length).toBeGreaterThan(0);
      expect(Array.isArray(q.options)).toBe(true);
      expect(q.options.length).toBeGreaterThan(1);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(q.options.length);
    }
  });

  it('mixes categories rather than drilling one', () => {
    // Twelve questions from one bank would be a quiz on Haitian history, not a
    // warm-up for a general-knowledge tournament.
    const picks = pickWarmUpQuestions(40).map((q) => q.q);
    const fromHistory = (TRIVIA_QUESTIONS.histoire_haiti as any[]).map((q) => q.q);
    const allFromHistory = picks.every((q) => fromHistory.includes(q));
    expect(allFromHistory).toBe(false);
  });

  it('asks for more than it has without breaking', () => {
    expect(pickWarmUpQuestions(100_000).length).toBeGreaterThan(0);
  });
});
