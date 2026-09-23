import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import DirectBankQuiz from '../DirectBankQuiz';

jest.mock('../../services/answerEventsService', () => ({ logAnswerEvent: jest.fn() }));
jest.mock('../../services/reviewService', () => ({ recordReviewOutcome: jest.fn() }));
jest.mock('../../utils/shared', () => ({
  useKatex: () => true,
  renderWithKatex: (s: string) => ({ __html: s }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d: string) => d }),
}));

const item = {
  id: 'q1',
  kind: 'mcq',
  stem: 'Calculer : (−3) + (−5)',
  options: ['8', '−2', '−8', '2'],
  correctIndex: 2,
};

const option = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const optionRow = (label: string) => option(label).closest('label')!;

it('does not paint the next choice red, and will not re-grade the same wrong answer', () => {
  const onScore = jest.fn();
  render(<DirectBankQuiz item={item} onScore={onScore} onNext={undefined} onClose={undefined} />);

  fireEvent.click(option('8'));
  fireEvent.click(screen.getByText('Vérifier'));
  expect(onScore).toHaveBeenLastCalledWith(expect.objectContaining({ attemptsLeft: 2 }));
  expect(optionRow('8').className).toContain('radio-option--wrong');

  // The same wrong answer cannot be submitted again.
  expect(screen.getByText('Vérifier')).toBeDisabled();

  // Picking the right one: not red, and checking it scores.
  fireEvent.click(option('−8'));
  expect(optionRow('−8').className).not.toContain('radio-option--wrong');
  fireEvent.click(screen.getByText('Vérifier'));
  expect(onScore).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'correct' }));
});
