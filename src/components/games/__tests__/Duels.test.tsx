import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../contexts/store';

const mockCreate = jest.fn();
const mockSent = jest.fn();
const mockReceived = jest.fn();
jest.mock('../../../services/challengeWebService', () => ({
  createChallenge: (...a: any[]) => mockCreate(...a),
  listMyChallenges: (...a: any[]) => mockSent(...a),
  listReceivedChallenges: (...a: any[]) => mockReceived(...a),
  referralCodeForShare: jest.fn().mockResolvedValue('REF42'),
}));
const bank = {
  capitals: [
    { q: 'Capitale A ?', options: ['A1', 'A2'], answer: 0 },
    { q: 'Capitale B ?', options: ['B1', 'B2'], answer: 1 },
    { q: 'Capitale C ?', options: ['C1', 'C2'], answer: 0 },
  ],
};
jest.mock('../../../utils/duelBank', () => ({ loadDuelBank: () => Promise.resolve(bank) }));
jest.mock('../../../utils/telemetry', () => ({ trackEvent: jest.fn() }));

import { DuelPanel, MyDuels } from '../Duels';

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
  mockCreate.mockReset(); mockSent.mockReset(); mockReceived.mockReset();
  useStore.setState({ language: 'fr', user: { uid: 'me' }, showAuthModal: false });
});

function panel(played: any[], category = 'capitals', isAuthed = true) {
  const startRound = jest.fn();
  const pick = jest.fn();
  render(
    <MemoryRouter>
      <DuelPanel category={category} played={played} score={1} total={played.length} isAuthed={isAuthed} isCreole={false}
        onStartDuelRound={startRound} onPickDuel={pick} />
    </MemoryRouter>,
  );
  return { startRound, pick };
}

it('mints the duel from the round just played and opens the share sheet', async () => {
  mockCreate.mockResolvedValue({ ok: true, challenge: { code: 'AB2CD3EF', url: 'u', appUrl: 'a', expiresAt: 1 } });
  // Options reshuffled on the web: still the same questions.
  panel([{ q: 'Capitale C ?', options: ['C2', 'C1'], answer: 1 }, { q: 'Capitale A ?', options: ['A1', 'A2'], answer: 0 }]);
  await flush();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Défier un ami/ })); });
  expect(mockCreate).toHaveBeenCalledWith({ categoryId: 'capitals', questionIdxs: [2, 0], score: 1 });
  expect(screen.getByDisplayValue('https://academy.edlight.org/defi/AB2CD3EF')).toBeInTheDocument();
  await flush();
  const wa = decodeURIComponent(screen.getByRole('link', { name: /WhatsApp/ }).getAttribute('href')!);
  expect(wa).toContain('https://academy.edlight.org/defi/AB2CD3EF');
  expect(wa).toContain('REF42');
});

it('offers a duel round instead when the friend could not replay this round', async () => {
  const { startRound } = panel([{ q: 'Pas dans la banque', options: ['x', 'y'], answer: 0 }]);
  await flush();
  expect(screen.queryByRole('button', { name: /^Défier un ami$/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Jouer une manche défi/ }));
  expect(startRound).toHaveBeenCalledWith('capitals');
  expect(mockCreate).not.toHaveBeenCalled();
});

it('sends a mixed round to the theme picker', async () => {
  const { pick } = panel([{ q: 'Capitale A ?', options: ['A1', 'A2'], answer: 0 }], 'mixed');
  await flush();
  fireEvent.click(screen.getByRole('button', { name: /Choisir un thème pour défier/ }));
  expect(pick).toHaveBeenCalled();
});

it('asks a guest to sign in first', async () => {
  panel([{ q: 'Capitale A ?', options: ['A1', 'A2'], answer: 0 }], 'capitals', false);
  await flush();
  fireEvent.click(screen.getByRole('button', { name: /Se connecter pour défier/ }));
  expect(useStore.getState().showAuthModal).toBe(true);
});

it('surfaces a failed mint', async () => {
  mockCreate.mockResolvedValue({ ok: false, error: 'network' });
  panel([{ q: 'Capitale A ?', options: ['A1', 'A2'], answer: 0 }]);
  await flush();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Défier un ami/ })); });
  expect(screen.getByRole('alert')).toHaveTextContent(/n’est pas parti/);
});

it('lists duels to play first, with the result from my side', async () => {
  mockSent.mockResolvedValue([
    { code: 'SENT0001', challengerUid: 'me', challengerName: 'Moi', categoryId: 'capitals', questionIdxs: [0], total: 10, challengerScore: 6, createdAt: 5, expiresAt: Date.now() + 1e6, status: 'played', opponent: { uid: 'x', name: 'Léo', score: 8, playedAt: 9 } },
  ]);
  mockReceived.mockResolvedValue([
    { code: 'RECV0001', challengerUid: 'ana', challengerName: 'Ana', categoryId: 'flags', questionIdxs: [0], total: 10, challengerScore: 7, createdAt: 1, expiresAt: Date.now() + 1e6, status: 'open', opponent: null },
  ]);
  render(<MemoryRouter><MyDuels isCreole={false} /></MemoryRouter>);
  await flush();
  const rows = screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/defi/'));
  expect(rows.map((r) => r.getAttribute('href'))).toEqual(['/defi/RECV0001', '/defi/SENT0001']);
  expect(rows[0]).toHaveTextContent('À toi de jouer');
  expect(rows[1]).toHaveTextContent('Perdu'); // Léo scored 8 against my 6
  expect(screen.getByText(/1 à jouer/)).toBeInTheDocument();
});

it('opens a duel from a typed code only when the code is valid', async () => {
  mockSent.mockResolvedValue([]);
  mockReceived.mockResolvedValue([]);
  render(<MemoryRouter><MyDuels isCreole={false} /></MemoryRouter>);
  await flush();
  expect(screen.getByText(/Aucun défi pour l’instant/)).toBeInTheDocument();
  const open = screen.getByRole('button', { name: /Ouvrir/ });
  expect(open).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Code d’un défi reçu/), { target: { value: 'ab2c d3ef' } });
  expect(open).not.toBeDisabled();
});
