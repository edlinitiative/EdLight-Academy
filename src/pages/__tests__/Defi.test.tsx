import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import useStore from '../../contexts/store';

const mockGet = jest.fn();
const mockAccept = jest.fn();
const mockCreate = jest.fn();
const mockRemember = jest.fn();
jest.mock('../../services/challengeWebService', () => ({
  getChallenge: (...a: any[]) => mockGet(...a),
  acceptChallenge: (...a: any[]) => mockAccept(...a),
  createChallenge: (...a: any[]) => mockCreate(...a),
  rememberReceived: (...a: any[]) => mockRemember(...a),
  listMyChallenges: jest.fn().mockResolvedValue([]),
  listReceivedChallenges: jest.fn().mockResolvedValue([]),
  referralCodeForShare: jest.fn().mockResolvedValue(null),
}));
const bank = {
  capitals: [
    { q: 'Capitale A ?', options: ['A1', 'A2'], answer: 0 },
    { q: 'Capitale B ?', options: ['B1', 'B2'], answer: 1 },
    { q: 'Capitale C ?', options: ['C1', 'C2'], answer: 0 },
  ],
};
jest.mock('../../utils/duelBank', () => ({ loadDuelBank: () => Promise.resolve(bank) }));
jest.mock('../../services/answerEventsService', () => ({ logAnswerEvent: jest.fn() }));
jest.mock('../../utils/telemetry', () => ({ trackEvent: jest.fn() }));
jest.mock('../../hooks/useTrivia', () => ({ useTrivia: () => ({ recordResult: jest.fn(), level: {}, daily: { completedToday: false }, isAuthed: true, profile: {} }) }));
jest.mock('../../components/Leaderboard', () => () => null);

import Defi from '../Defi';

const open = {
  code: 'AB2CD3EF', challengerUid: 'ana', challengerName: 'Ana B.', categoryId: 'capitals',
  questionIdxs: [2, 0], total: 2, challengerScore: 1, createdAt: 1, expiresAt: Date.now() + 1e6,
  opponent: null, status: 'open',
};

function renderAt(code = 'AB2CD3EF') {
  return render(
    <MemoryRouter initialEntries={[`/defi/${code}`]}>
      <Routes><Route path="/defi/:code" element={<Defi />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.scrollTo = jest.fn();
  mockGet.mockReset(); mockAccept.mockReset(); mockRemember.mockReset();
  useStore.setState({ language: 'fr', user: null, showAuthModal: false });
});

it('explains the duel to a signed-out visitor and opens sign-in', () => {
  renderAt();
  expect(screen.getByRole('heading', { name: 'On te défie !' })).toBeInTheDocument();
  expect(mockGet).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /Se connecter pour jouer/ }));
  expect(useStore.getState().showAuthModal).toBe(true);
  // The app is a secondary link, never the main action.
  expect(screen.getByRole('link', { name: /Ouvrir dans l’app/ })).toHaveAttribute('href', 'edlight://defi/AB2CD3EF');
});

it('plays the challenger’s exact questions once and shows the server’s result', async () => {
  useStore.setState({ user: { uid: 'me' } });
  mockGet.mockResolvedValue({ challenge: open });
  mockAccept.mockResolvedValue({ ok: true, result: 'won', challengerScore: 1, opponentScore: 2, total: 2, xpAwarded: 20 });
  renderAt();

  expect(await screen.findByRole('heading', { name: /Ana B\. a fait 1\/2/ })).toBeInTheDocument();
  expect(mockRemember).toHaveBeenCalledWith('me', 'AB2CD3EF');
  const go = await screen.findByRole('button', { name: /Relever le défi/ });
  await waitFor(() => expect(go).not.toBeDisabled());
  fireEvent.click(go);
  // The duel's opening (reveal → 3-2-1); "Commencer" goes straight to the round.
  expect(await screen.findByRole('region', { name: 'Début du défi' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Commencer' }));

  // Question order is the challenger's: index 2 first, then index 0.
  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Capitale C ?');
  fireEvent.click(screen.getByRole('button', { name: /C1/ }));
  fireEvent.click(screen.getByRole('button', { name: /Question suivante/ }));
  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Capitale A ?');
  fireEvent.click(screen.getByRole('button', { name: /A1/ }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Voir les résultats/ })); });

  expect(mockAccept).toHaveBeenCalledWith({ code: 'AB2CD3EF', score: 2 });
  expect(await screen.findByRole('heading', { name: 'Tu as gagné !' })).toBeInTheDocument();
  expect(screen.getByText('+20 XP')).toBeInTheDocument();
});

it('says why when the server refuses the attempt', async () => {
  useStore.setState({ user: { uid: 'me' } });
  mockGet.mockResolvedValue({ challenge: { ...open, questionIdxs: [1], total: 1 } });
  mockAccept.mockResolvedValue({ ok: false, error: 'already_played' });
  renderAt();
  const go = await screen.findByRole('button', { name: /Relever le défi/ });
  await waitFor(() => expect(go).not.toBeDisabled());
  fireEvent.click(go);
  // The duel's opening (reveal → 3-2-1); "Commencer" goes straight to the round.
  expect(await screen.findByRole('region', { name: 'Début du défi' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Commencer' }));
  fireEvent.click(screen.getByRole('button', { name: /B1/ }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Voir les résultats/ })); });
  expect(await screen.findByRole('alert')).toHaveTextContent(/déjà été relevé/);
});

it('refuses to play a duel whose indexes this bank cannot reproduce', async () => {
  useStore.setState({ user: { uid: 'me' } });
  mockGet.mockResolvedValue({ challenge: { ...open, questionIdxs: [0, 7] } });
  renderAt();
  expect(await screen.findByRole('alert')).toHaveTextContent(/autre version des questions/);
  expect(screen.queryByRole('button', { name: /Relever le défi/ })).not.toBeInTheDocument();
});

it('shows the challenger their own duel with the link to send again', async () => {
  useStore.setState({ user: { uid: 'ana' } });
  mockGet.mockResolvedValue({ challenge: open });
  renderAt();
  expect(await screen.findByRole('heading', { name: 'En attente de ton ami' })).toBeInTheDocument();
  expect(screen.getByDisplayValue('https://academy.edlight.org/defi/AB2CD3EF')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Envoyer sur WhatsApp/ }).getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\?text=/);
  expect(mockRemember).not.toHaveBeenCalled();
});

it('reads a played duel from the challenger’s side', async () => {
  useStore.setState({ user: { uid: 'ana' } });
  mockGet.mockResolvedValue({ challenge: { ...open, status: 'played', opponent: { uid: 'me', name: 'Léo', score: 2, playedAt: 5 } } });
  renderAt();
  expect(await screen.findByRole('heading', { name: 'Ton ami t’a battu' })).toBeInTheDocument();
});

it('handles a bad or unknown code', async () => {
  useStore.setState({ user: { uid: 'me' } });
  renderAt('nope');
  expect(await screen.findByRole('heading', { name: 'Défi introuvable' })).toBeInTheDocument();
  expect(mockGet).not.toHaveBeenCalled();
});

it('puts Revanche first after a lost duel, on the same theme', async () => {
  useStore.setState({ user: { uid: 'me' } });
  mockGet.mockResolvedValue({ challenge: open });
  mockAccept.mockResolvedValue({ ok: true, result: 'lost', challengerScore: 1, opponentScore: 0, total: 2, xpAwarded: 0 });
  renderAt();
  const go = await screen.findByRole('button', { name: /Relever le défi/ });
  await waitFor(() => expect(go).not.toBeDisabled());
  fireEvent.click(go);
  // The duel's opening (reveal → 3-2-1); "Commencer" goes straight to the round.
  expect(await screen.findByRole('region', { name: 'Début du défi' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Commencer' }));
  fireEvent.click(screen.getByRole('button', { name: /C2/ }));
  fireEvent.click(screen.getByRole('button', { name: /Question suivante/ }));
  fireEvent.click(screen.getByRole('button', { name: /A2/ }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Voir les résultats/ })); });
  expect(await screen.findByRole('heading', { name: 'Perdu de peu…' })).toBeInTheDocument();
  const rematch = screen.getByRole('link', { name: /Revanche/ });
  expect(rematch).toHaveAttribute('href', '/jeux/trivia');
  expect(rematch).toHaveClass('duel-pill--primary');
  expect(screen.getByRole('button', { name: /Partager/ })).toBeInTheDocument();
});
