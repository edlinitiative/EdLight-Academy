import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

let mockTrivia: any;
jest.mock('../../../hooks/useTrivia', () => ({ useTrivia: () => mockTrivia }));
jest.mock('../../../components/games/Duels', () => ({ DuelPanel: ({ primary }: any) => <div data-testid="duel" data-primary={String(primary)} /> }));
jest.mock('../../../utils/telemetry', () => ({ trackEvent: jest.fn() }));
jest.mock('../useMatchSound', () => ({ useMatchSound: () => jest.fn() }));

import MatchResults from '../MatchResults';

const q = (n: number) => ({ q: `Question ${n} ?`, options: ['a', 'b'], answer: 0 });
const answers = [
  { question: q(1), selected: 0, correct: true, ms: 3000 },
  { question: q(2), selected: 0, correct: true, ms: 1200 },
  { question: q(3), selected: 0, correct: true, ms: 4000 },
  { question: q(4), selected: 1, correct: false, ms: 900 },
  { question: q(5), selected: -1, correct: false, ms: 15000 },
];
const level = { level: 4, xpIntoLevel: 120, xpForNext: 400, xpToNext: 280, progressPct: 30 };
const base = {
  answers, score: 3, total: 5, category: 'maths_eclair', categoryName: 'Maths éclair', mode: 'practice' as const,
  isAuthed: true, isCreole: false, saving: false, saveError: false,
  reward: { xpEarned: 30, leveledUp: false, prevLevel: 4, newLevel: 4 },
  onReplay: jest.fn(), onHome: jest.fn(), onReview: jest.fn(), onStartDuelRound: jest.fn(), onPickDuel: jest.fn(),
};
const renderIt = (props: any = {}) => render(<MemoryRouter><MatchResults {...base} {...props} /></MemoryRouter>);

beforeEach(() => {
  mockTrivia = { profile: { leaderboard: { optedIn: true, school: 'Lycée Pétion', displayName: 'Mika' } }, level };
});

it('explains the round from its own answers: streak, fastest correct, XP and level', () => {
  renderIt();
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Pas mal');
  expect(screen.getByRole('list', { name: /3 justes, 1 fausse, 1 sans réponse/ })).toBeInTheDocument();
  expect(screen.getByText('3 de suite')).toBeInTheDocument();
  expect(screen.getByText('questions 1 à 3')).toBeInTheDocument();
  // Fastest CORRECT answer (1,2 s), not the faster wrong one (0,9 s).
  expect(screen.getByText('1,2 s')).toBeInTheDocument();
  expect(screen.getByText('+30 XP')).toBeInTheDocument();
  expect(screen.getByText('3 × 10 XP')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '120');
  expect(screen.getByText('280 XP avant le niveau 5')).toBeInTheDocument();
  expect(screen.getByText('+30 XP pour Lycée Pétion')).toBeInTheDocument();
});

it('never credits the school when the student is not on the weekly board', () => {
  mockTrivia.profile.leaderboard.optedIn = false;
  renderIt();
  expect(screen.queryByText(/pour Lycée Pétion/)).not.toBeInTheDocument();
});

it('claims a record only against a real earlier best, and celebrates it bigger', () => {
  const { container, rerender } = renderIt({ prevTheme: { games: 2, bestPct: 40 } });
  expect(screen.getByText('Nouveau record sur ce thème')).toBeInTheDocument();
  expect(container.querySelector('.mx-res')).toHaveAttribute('data-size', 'big');
  rerender(<MemoryRouter><MatchResults {...base} prevTheme={{ games: 0, bestPct: 0 }} /></MemoryRouter>);
  expect(screen.queryByText('Nouveau record sur ce thème')).not.toBeInTheDocument();
  expect(container.querySelector('.mx-res')).toHaveAttribute('data-size', 'routine');
});

it('keeps one coral action: Rejouer, or the duel on a duel round', () => {
  const { rerender } = renderIt();
  expect(screen.getByRole('button', { name: 'Rejouer' })).toHaveClass('an-go');
  expect(screen.getByTestId('duel')).toHaveAttribute('data-primary', 'false');
  rerender(<MemoryRouter><MatchResults {...base} mode="duel" /></MemoryRouter>);
  expect(screen.getByRole('button', { name: /Rejouer une manche défi/ })).toHaveClass('an-ghost');
  expect(screen.getByTestId('duel')).toHaveAttribute('data-primary', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Revoir mes erreurs' }));
  expect(base.onReview).toHaveBeenCalled();
});

it('shows a guest preview without claiming anything was saved', () => {
  mockTrivia = { profile: {}, level };
  renderIt({ isAuthed: false, reward: { xpEarned: 30, guest: true } });
  expect(screen.getByText(/n’est pas sauvegardée/)).toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Créer un compte' })).toBeInTheDocument();
});
