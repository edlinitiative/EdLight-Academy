import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TriviaGames, { TriviaQuiz } from '../TriviaGames';

const mockRecord = jest.fn().mockResolvedValue({ xpEarned: 10, guest: true });
const mockQuestions = [
  { q: 'Deux plus deux ?', qHt: 'De plis de ?', options: ['4', '5'], optionsHt: ['kat', 'senk'], answer: 0, explanation: '2 + 2 = 4.', explanationHt: 'De ak de fè kat.' },
  { q: 'Trois plus trois ?', qHt: 'Twa plis twa ?', options: ['6', '7'], answer: 0, explanation: '3 + 3 = 6.' },
];
jest.mock('../../hooks/useTrivia', () => ({ useTrivia: () => ({ recordResult: mockRecord, level: {}, daily: { completedToday: false }, isAuthed: false, profile: {} }) }));
jest.mock('../../hooks/useStreak', () => ({ useStreak: () => ({ streak: {} }) }));
jest.mock('../../hooks/useTriviaContent', () => ({ useTriviaContent: () => ({ categories: [{ id: 'maths_eclair', name: 'Maths éclair', color: '#123456' }], questions: { maths_eclair: mockQuestions } }) }));
jest.mock('../../services/answerEventsService', () => ({ logAnswerEvent: jest.fn() }));
jest.mock('../../utils/telemetry', () => ({ trackEvent: jest.fn() }));
jest.mock('../../components/Leaderboard', () => () => null);
jest.mock('../../components/ArenaBanner', () => () => null);

beforeEach(() => { window.scrollTo = jest.fn(); localStorage.clear(); });
afterEach(() => { jest.useRealTimers(); });

function quiz(timed = false, isCreole = false) {
  const finish = jest.fn();
  render(<TriviaQuiz category="maths_eclair" count={2} questions={mockQuestions} onFinish={finish} onBack={jest.fn()} isCreole={isCreole} timed={timed} />);
  return finish;
}

it('untimed practice stays answerable and explains the answer in the selected language', () => {
  jest.useFakeTimers();
  quiz(false, true);
  act(() => { jest.advanceTimersByTime(30000); });
  fireEvent.click(screen.getByRole('button', { name: 'A kat' }));
  expect(screen.getByRole('status')).toHaveTextContent('De ak de fè kat.');
});

it('times out once, records the missed answer, and finishes only once', () => {
  jest.useFakeTimers();
  const finish = quiz(true);
  act(() => { jest.advanceTimersByTime(15000); });
  expect(screen.getByRole('status')).toHaveTextContent('Temps écoulé');
  fireEvent.click(screen.getByRole('button', { name: 'Question suivante →' }));
  fireEvent.click(screen.getByRole('button', { name: 'A 6' }));
  const result = screen.getByRole('button', { name: 'Voir les résultats' });
  fireEvent.click(result);
  fireEvent.click(result);
  expect(finish).toHaveBeenCalledTimes(1);
  expect(finish).toHaveBeenCalledWith(1, 2, [expect.objectContaining({ selected: -1, correct: false }), expect.objectContaining({ selected: 0, correct: true })]);
});

it('starts directly from a topic, reviews errors without awarding again, and replays directly', async () => {
  render(<MemoryRouter initialEntries={['/jeux/trivia']}><Routes><Route path="/jeux/:gameId" element={<TriviaGames />} /></Routes></MemoryRouter>);
  expect(screen.getByText(/10 questions · Sans chrono/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Maths éclair — 2 questions' }));
  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/plus/);
  fireEvent.click(screen.getByRole('button', { name: /B [57]/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Question suivante →' }));
  fireEvent.click(screen.getByRole('button', { name: /A [46]/ }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Voir les résultats' })); });
  expect(mockRecord).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Revoir mes erreurs' }));
  expect(screen.getByText(/Ta réponse/)).toBeInTheDocument();
  expect(screen.getByText(/Bonne réponse/)).toBeInTheDocument();
  expect(mockRecord).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Rejouer avec de nouvelles questions' }));
  expect(screen.getByRole('button', { name: /A [46]/ })).toBeEnabled();
});
