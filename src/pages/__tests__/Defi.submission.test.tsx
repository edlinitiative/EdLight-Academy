/**
 * /defi/:code — the submission half: saving → saved, a failed post with a
 * safe retry, and a lost reply recovered from the server's own record.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import useStore from '../../contexts/store';

const mockGet = jest.fn();
const mockAccept = jest.fn();
jest.mock('../../services/challengeWebService', () => ({
  getChallenge: (...a: any[]) => mockGet(...a),
  acceptChallenge: (...a: any[]) => mockAccept(...a),
  createChallenge: jest.fn(),
  rememberReceived: jest.fn(),
  listMyChallenges: jest.fn().mockResolvedValue([]),
  listReceivedChallenges: jest.fn().mockResolvedValue([]),
  referralCodeForShare: jest.fn().mockResolvedValue(null),
}));
const bank = { capitals: [{ q: 'Capitale A ?', options: ['A1', 'A2'], answer: 0 }] };
jest.mock('../../utils/duelBank', () => ({ loadDuelBank: () => Promise.resolve(bank) }));
jest.mock('../../services/answerEventsService', () => ({ logAnswerEvent: jest.fn() }));
jest.mock('../../utils/telemetry', () => ({ trackEvent: jest.fn() }));
jest.mock('../../hooks/useTrivia', () => ({ useTrivia: () => ({ recordResult: jest.fn(), level: {}, daily: { completedToday: false }, isAuthed: true, profile: {} }) }));
jest.mock('../../components/Leaderboard', () => () => null);

import Defi from '../Defi';

const open = {
  code: 'AB2CD3EF', challengerUid: 'ana', challengerName: 'Ana B.', categoryId: 'capitals',
  questionIdxs: [0], total: 1, challengerScore: 0, createdAt: 1, expiresAt: Date.now() + 3 * 86_400_000 + 60_000,
  opponent: null, status: 'open',
};

let onlineFlag = true;
beforeAll(() => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => onlineFlag });
});
beforeEach(() => {
  onlineFlag = true;
  window.scrollTo = jest.fn();
  mockGet.mockReset(); mockAccept.mockReset();
  useStore.setState({ language: 'fr', user: { uid: 'me' }, showAuthModal: false });
});

async function playOnce() {
  render(
    <MemoryRouter initialEntries={['/defi/AB2CD3EF']}>
      <Routes><Route path="/defi/:code" element={<Defi />} /></Routes>
    </MemoryRouter>,
  );
  const go = await screen.findByRole('button', { name: /Relever le défi/ });
  await waitFor(() => expect(go).not.toBeDisabled());
  fireEvent.click(go);
  // The duel's opening (reveal → 3-2-1); "Commencer" goes straight to the round.
  expect(await screen.findByRole('region', { name: 'Début du défi' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Commencer' }));
  fireEvent.click(screen.getByRole('button', { name: /A1/ }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Voir les résultats/ })); });
}

it('states expiry and what the challenger will see before playing', async () => {
  mockGet.mockResolvedValue({ challenge: open });
  render(
    <MemoryRouter initialEntries={['/defi/AB2CD3EF']}>
      <Routes><Route path="/defi/:code" element={<Defi />} /></Routes>
    </MemoryRouter>,
  );
  expect(await screen.findByText(/Expire dans 3 jours/)).toBeInTheDocument();
  expect(screen.getByText(/Ton score est envoyé à ton ami à la fin de la dernière question/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Comment le gagnant est décidé/ })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Signaler un problème/ }).getAttribute('href')).toMatch(/^mailto:info@edlight\.org/);
});

it('confirms a saved round and says what the challenger now sees', async () => {
  mockGet.mockResolvedValue({ challenge: open });
  mockAccept.mockResolvedValue({ ok: true, result: 'won', challengerScore: 0, opponentScore: 1, total: 1, xpAwarded: 20 });
  await playOnce();
  expect(await screen.findByText('Manche enregistrée ✓')).toBeInTheDocument();
  expect(screen.getByText(/Ana B\. voit maintenant ton score, 1\/1/)).toBeInTheDocument();
});

it('a network failure is "not saved yet" with a retry, never "saved"', async () => {
  mockGet.mockResolvedValue({ challenge: open });
  mockAccept.mockResolvedValueOnce({ ok: false, error: 'network' })
    .mockResolvedValueOnce({ ok: true, result: 'won', challengerScore: 0, opponentScore: 1, total: 1, xpAwarded: 20 });
  await playOnce();
  expect(await screen.findByText('Ta manche n’est pas encore enregistrée')).toBeInTheDocument();
  expect(screen.queryByText('Manche enregistrée ✓')).toBeNull();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Réessayer/ })); });
  expect(mockAccept).toHaveBeenCalledTimes(2);
  // The resend carries the same picks, so the server grades the same attempt.
  expect(mockAccept.mock.calls[1][0]).toEqual({ code: 'AB2CD3EF', score: 1, answers: ['A1'], bankHash: expect.stringMatching(/^b[0-9a-f]{8}$/) });
  expect(await screen.findByText('Manche enregistrée ✓')).toBeInTheDocument();
});

it('offline, the score is held and resent when the network returns', async () => {
  mockGet.mockResolvedValue({ challenge: open });
  mockAccept.mockResolvedValueOnce({ ok: false, error: 'network' })
    .mockResolvedValueOnce({ ok: true, result: 'tie', challengerScore: 1, opponentScore: 1, total: 1, xpAwarded: 10 });
  onlineFlag = false;
  await playOnce();
  expect(await screen.findByText(/Hors ligne — ta manche n’est pas encore enregistrée/)).toBeInTheDocument();
  onlineFlag = true;
  await act(async () => { window.dispatchEvent(new Event('online')); });
  expect(await screen.findByText('Manche enregistrée ✓')).toBeInTheDocument();
});

it('a retry that finds the score already recorded shows the recorded result, not an error', async () => {
  mockGet.mockResolvedValueOnce({ challenge: open })
    .mockResolvedValue({ challenge: { ...open, status: 'played', opponent: { uid: 'me', name: 'Moi', score: 1, playedAt: 5 } } });
  mockAccept.mockResolvedValueOnce({ ok: false, error: 'network' })
    .mockResolvedValueOnce({ ok: false, error: 'already_played' });
  await playOnce();
  await screen.findByText('Ta manche n’est pas encore enregistrée');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Réessayer/ })); });
  expect(await screen.findByText('Manche enregistrée ✓')).toBeInTheDocument();
  expect(screen.getByText(/déjà été reçue plus tôt/)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Tu as gagné !' })).toBeInTheDocument();
});

it('a refusal from the server is explained and not retried', async () => {
  mockGet.mockResolvedValue({ challenge: open });
  mockAccept.mockResolvedValue({ ok: false, error: 'expired' });
  await playOnce();
  expect(await screen.findByText(/Ce défi a expiré \(7 jours\)/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Réessayer/ })).toBeNull();
});
