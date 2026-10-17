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

it('a right first try carries ONE verdict, folds the other choices and keeps the explanation', () => {
  const { container } = render(<DirectBankQuiz item={{ id: 'q5', kind: 'mcq', stem: 'S', options: ['L’eau', 'L’huile', 'L’air', 'Le mercure'], correctIndex: 0, good: 'Rapport à l’eau.' }} onScore={jest.fn()} onNext={undefined} onClose={undefined} />);
  fireEvent.click(screen.getByLabelText('L’eau'));
  fireEvent.click(screen.getByText('Vérifier'));
  // One verdict: the AnswerStatus — no legacy "Correct" chip above it.
  expect(container.querySelectorAll('.pq-status')).toHaveLength(1);
  expect(screen.getByText('Correct du premier coup')).toBeInTheDocument();
  expect(container.querySelector('.chip--success')).toBeNull();
  expect(screen.queryByText('Correct')).not.toBeInTheDocument();
  // The chosen answer stays on screen, so it is not repeated as "Ta réponse".
  expect(screen.queryByText('Ta réponse')).not.toBeInTheDocument();
  expect(screen.getByLabelText('L’eau')).toBeInTheDocument();
  expect(screen.queryByLabelText('L’huile')).not.toBeInTheDocument();
  expect(screen.getByText('Rapport à l’eau.')).toBeInTheDocument();
  const fold = screen.getByRole('button', { name: 'Voir les 3 autres choix' });
  expect(fold).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(fold);
  expect(screen.getByLabelText('L’huile')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Masquer les autres choix' })).toHaveAttribute('aria-expanded', 'true');
});

it('a miss keeps the wrong and the right choice open, and both "Ta réponse" and "Bonne réponse"', () => {
  const { container } = render(<DirectBankQuiz item={{ id: 'q6', kind: 'mcq', stem: 'S', options: ['a', 'b', 'c', 'd'], correctIndex: 3 }} onScore={jest.fn()} onNext={undefined} onClose={undefined} />);
  for (const l of ['a', 'b', 'c']) { fireEvent.click(screen.getByLabelText(l)); fireEvent.click(screen.getByText('Vérifier')); }
  expect(container.querySelectorAll('.pq-status')).toHaveLength(1);
  expect(container.querySelector('.chip--danger')).toBeNull();
  expect(container.querySelectorAll('.radio-option')).toHaveLength(2);
  expect(container.querySelector('.radio-option--wrong')).toHaveTextContent('c');
  expect(container.querySelector('.radio-option--correct')).toHaveTextContent('d');
  fireEvent.click(screen.getByRole('button', { name: 'Voir les 2 autres choix' }));
  expect(container.querySelectorAll('.radio-option')).toHaveLength(4);
  expect(screen.getByText('Ta réponse')).toBeInTheDocument();
  expect(screen.getByText('Bonne réponse')).toBeInTheDocument();
});
