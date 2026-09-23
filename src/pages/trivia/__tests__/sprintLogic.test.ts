import {
  accuracy, formatClock, questionKey, updateBank, sessionFromResults, appendHistory, mastery,
  loadBank, saveBank, loadScratch, saveScratch,
} from '../sprintLogic';

const q = (text: string, category = 'maths', answer = 0) => ({ q: text, qHt: text, options: ['a', 'b'], answer, category });

describe('sprint accuracy and clock', () => {
  it('is null before any answer, then correct over answered', () => {
    expect(accuracy(0, 0)).toBeNull();
    expect(accuracy(5, 6)).toBe(83);
    expect(accuracy(9, 6)).toBe(100); // never above 100
  });
  it('formats mm:ss and never goes negative', () => {
    expect(formatClock(125)).toBe('02:05');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(-4)).toBe('00:00');
  });
  it('keys a question on its normalised French text', () => {
    expect(questionKey({ q: '  Deux   plus deux ?' })).toBe('deux plus deux ?');
  });
});

describe('error bank', () => {
  it('adds misses, bumps repeats to the front, and drops what was answered right', () => {
    let bank = updateBank([], [{ question: q('A'), correct: false }, { question: q('B'), correct: false }], 1);
    expect(bank.map((b) => b.question.q)).toEqual(['A', 'B']);
    bank = updateBank(bank, [{ question: q('B'), correct: false }], 2);
    expect(bank[0].question.q).toBe('B');
    expect(bank[0].misses).toBe(2);
    bank = updateBank(bank, [{ question: q('A'), correct: true }], 3);
    expect(bank.map((b) => b.question.q)).toEqual(['B']);
  });
  it('round-trips through storage', () => {
    localStorage.clear();
    saveBank(updateBank([], [{ question: q('C'), correct: false }]));
    expect(loadBank()[0].question.q).toBe('C');
  });
  it('survives corrupt storage', () => {
    localStorage.setItem('edl-sprint-error-bank-v1', '{not json');
    expect(loadBank()).toEqual([]);
  });
});

describe('mastery from history', () => {
  it('shows nothing until a sprint is played', () => {
    expect(mastery([])).toEqual([]);
    expect(appendHistory([], sessionFromResults([]))).toEqual([]);
  });
  it('sums every sprint per category, weakest first', () => {
    const s1 = sessionFromResults([
      { question: q('1', 'maths'), correct: true },
      { question: q('2', 'maths'), correct: false },
      { question: q('3', 'chimie'), correct: true },
    ]);
    const s2 = sessionFromResults([{ question: q('4', 'maths'), correct: false }]);
    const rows = mastery(appendHistory(appendHistory([], s1), s2));
    expect(rows).toEqual([
      { category: 'maths', correct: 1, answered: 3, pct: 33 },
      { category: 'chimie', correct: 1, answered: 1, pct: 100 },
    ]);
  });
});

describe('scratchpad', () => {
  it('is kept per session', () => {
    saveScratch('s1', 'f = 1/2π√(LC)');
    expect(loadScratch('s1')).toBe('f = 1/2π√(LC)');
    expect(loadScratch('s2')).toBe('');
  });
});
