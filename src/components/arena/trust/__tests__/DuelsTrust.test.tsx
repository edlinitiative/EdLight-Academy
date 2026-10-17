/** The trust mounts inside the duel surfaces of src/components/games/Duels.tsx. */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../../contexts/store';

const mockCreate = jest.fn();
jest.mock('../../../../services/challengeWebService', () => ({
  createChallenge: (...a: any[]) => mockCreate(...a),
  listMyChallenges: jest.fn().mockResolvedValue([]),
  listReceivedChallenges: jest.fn().mockResolvedValue([]),
  referralCodeForShare: jest.fn().mockResolvedValue(null),
  acceptChallenge: jest.fn(),
  getChallenge: jest.fn(),
}));
const bank = { capitals: [{ q: 'Capitale A ?', options: ['A1', 'A2'], answer: 0 }] };
jest.mock('../../../../utils/duelBank', () => ({ loadDuelBank: () => Promise.resolve(bank) }));
jest.mock('../../../../utils/telemetry', () => ({ trackEvent: jest.fn() }));

import { DuelPanel, MyDuels } from '../../../games/Duels';

beforeEach(() => {
  mockCreate.mockReset();
  useStore.setState({ language: 'fr', user: { uid: 'me' }, showAuthModal: false });
});

it('confirms a minted duel only after the server returned its code', async () => {
  let resolve: (v: any) => void = () => {};
  mockCreate.mockImplementation(() => new Promise((r) => { resolve = r; }));
  render(
    <MemoryRouter>
      <DuelPanel category="capitals" played={bank.capitals as any} score={1} total={1} isAuthed isCreole={false}
        onStartDuelRound={jest.fn()} onPickDuel={jest.fn()} />
    </MemoryRouter>,
  );
  const go = await screen.findByRole('button', { name: /Défier un ami/ });
  await act(async () => { fireEvent.click(go); });
  expect(screen.queryByText('Défi enregistré ✓')).toBeNull();
  await act(async () => { resolve({ ok: true, challenge: { code: 'AB2CD3EF', url: '', appUrl: '', expiresAt: 0 } }); });
  expect(screen.getByText('Défi enregistré ✓')).toBeInTheDocument();
  expect(screen.getByText(/reste ouvert 7 jours/)).toBeInTheDocument();
});

it('Mes défis links to how the winner is decided', async () => {
  await act(async () => {
    render(<MemoryRouter><MyDuels isCreole={false} /></MemoryRouter>);
  });
  fireEvent.click(screen.getByRole('button', { name: /Comment le gagnant est décidé/ }));
  expect(screen.getByRole('dialog').textContent).toContain('La vitesse ne départage pas');
});
