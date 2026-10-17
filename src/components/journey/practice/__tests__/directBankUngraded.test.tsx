import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import DirectBankQuiz from '../../../DirectBankQuiz';

const mockRecord = jest.fn();
jest.mock('../../../../services/answerEventsService', () => ({ logAnswerEvent: jest.fn() }));
jest.mock('../../../../services/reviewService', () => ({ recordReviewOutcome: (...a: any[]) => mockRecord(...a) }));
jest.mock('../../../../utils/shared', () => ({ useKatex: () => true, renderWithKatex: (s: string) => ({ __html: s }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_k: string, d: string) => d }) }));

it('a question without an answer key is shown as not auto-corrected, never wrong', () => {
  const onScore = jest.fn();
  render(<DirectBankQuiz item={{ id: 'q-essay-ish', kind: 'short', stem: 'Explique.', correctText: '' }} onScore={onScore} onNext={undefined} onClose={undefined} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Ma réponse' } });
  fireEvent.click(screen.getByText('Valider ma réponse'));
  expect(screen.getByText('Non corrigée automatiquement')).toBeInTheDocument();
  expect(screen.queryByText(/Incorrect/)).not.toBeInTheDocument();
  expect(screen.getByText(/Aucun corrigé n’est enregistré/)).toBeInTheDocument();
  expect(onScore).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'ungraded' }));
  expect(mockRecord).not.toHaveBeenCalled();
});

it('a first miss keeps the same question open and says how many tries remain', () => {
  render(<DirectBankQuiz item={{ id: 'q2', kind: 'mcq', stem: 'S', options: ['8', '−8'], correctIndex: 1, hints: ['Deux négatifs.'] }} onScore={jest.fn()} onNext={undefined} onClose={undefined} />);
  fireEvent.click(screen.getByLabelText('8'));
  fireEvent.click(screen.getByText('Vérifier'));
  expect(screen.getByText('Pas encore')).toBeInTheDocument();
  expect(screen.getByText(/Même question : il te reste 2 essais/)).toBeInTheDocument();
  expect(screen.getByText('Deux négatifs.')).toBeInTheDocument();
  // The expected answer is not disclosed while tries remain.
  expect(screen.queryByText('Bonne réponse')).not.toBeInTheDocument();
});

it('correct after a retry says so in words', () => {
  render(<DirectBankQuiz item={{ id: 'q3', kind: 'mcq', stem: 'S', options: ['a', 'b', 'c'], correctIndex: 2, good: 'Parce que c.' }} onScore={jest.fn()} onNext={undefined} onClose={undefined} />);
  fireEvent.click(screen.getByLabelText('a'));
  fireEvent.click(screen.getByText('Vérifier'));
  fireEvent.click(screen.getByLabelText('c'));
  fireEvent.click(screen.getByText('Vérifier'));
  expect(screen.getByText('Correct au 2ᵉ essai')).toBeInTheDocument();
  expect(screen.getByText('Parce que c.')).toBeInTheDocument();
});

it('exhausting the tries reveals the expected answer and the explanation', () => {
  render(<DirectBankQuiz item={{ id: 'q4', kind: 'mcq', stem: 'S', options: ['a', 'b', 'c', 'd'], correctIndex: 3, good: 'Parce que d.' }} onScore={jest.fn()} onNext={undefined} onClose={undefined} />);
  for (const l of ['a', 'b', 'c']) { fireEvent.click(screen.getByLabelText(l)); fireEvent.click(screen.getByText('Vérifier')); }
  expect(screen.getByText('Incorrect')).toBeInTheDocument();
  expect(screen.getByText('Bonne réponse').nextSibling).toHaveTextContent('d');
  expect(screen.getByText('Ta réponse').nextSibling).toHaveTextContent('c');
  expect(screen.getByText('Parce que d.')).toBeInTheDocument();
});
