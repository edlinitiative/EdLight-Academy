// Importing the screen otherwise drags in the whole data layer at module load
// (useData → dataService → firebase/firestore ESM + Auth init). We only exercise
// the pure isQuizAnswerCorrect helper, so stub the hooks module to sever that
// chain and keep the suite cheap and offline.
import { isQuizAnswerCorrect } from '../QuizzesScreen';

jest.mock('../../hooks/useData', () => ({ usePracticeQuizzes: () => ({ data: [] }) }));

/**
 * Pins the QuizzesScreen scoring bug: the quiz bank stores the correct answer
 * as a LETTER ("B" from correct_answer) while the runner records the selected
 * option TEXT. The helper must map letter → option index → text before
 * comparing, so a text selection matching the lettered answer scores correct.
 */
describe('isQuizAnswerCorrect', () => {
  const question = {
    options: ['Paris', 'London', 'Berlin', 'Madrid'],
    answer: 'B', // stored as a letter → resolves to options[1] === 'London'
  };

  it('grades correct when the given answer is the option TEXT for the lettered answer', () => {
    expect(isQuizAnswerCorrect(question, 'London')).toBe(true);
  });

  it('grades correct when the given answer is already the LETTER', () => {
    expect(isQuizAnswerCorrect(question, 'B')).toBe(true);
  });

  it('grades incorrect when the given text is a different option', () => {
    expect(isQuizAnswerCorrect(question, 'Paris')).toBe(false);
  });

  it('supports the correct_answer / choices field aliases', () => {
    const q = { choices: ['Vrai', 'Faux'], correct_answer: 'A' };
    expect(isQuizAnswerCorrect(q, 'Vrai')).toBe(true);
    expect(isQuizAnswerCorrect(q, 'Faux')).toBe(false);
  });

  it('grades correct when the answer is stored directly as text', () => {
    const q = { options: ['Oui', 'Non'], answer: 'Non' };
    expect(isQuizAnswerCorrect(q, 'Non')).toBe(true);
  });

  it('returns false for empty / missing selections', () => {
    expect(isQuizAnswerCorrect(question, undefined)).toBe(false);
    expect(isQuizAnswerCorrect(question, '')).toBe(false);
  });

  it('returns false for out-of-range / garbage answers', () => {
    // 'Z' → index 25, out of range, and no option text equals 'Z'.
    expect(isQuizAnswerCorrect({ options: ['a', 'b'], answer: 'Z' }, 'a')).toBe(false);
    // Missing stored answer → nothing is ever correct.
    expect(isQuizAnswerCorrect({ options: ['a', 'b'] }, 'a')).toBe(false);
  });
});
