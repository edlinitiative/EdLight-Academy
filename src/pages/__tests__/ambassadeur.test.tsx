import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Ambassadeur from '../Ambassadeur';
import useStore from '../../contexts/store';
import { ambassadorRequest } from '../../services/ambassadorService';
import { AmbassadorError } from '../../../shared/ambassadors';

jest.mock('../../services/ambassadorService', () => ({ ambassadorRequest: jest.fn() }));
jest.mock('../../services/referralService', () => ({ getReferralCode: jest.fn() }));
const request = ambassadorRequest as jest.Mock;
const s = (recruits: number, retained: number, pending: number) => ({ recruits, retained, retainedUnflagged: retained, pending, notRetained: recruits - retained - pending, flagged: 0 });

beforeEach(() => { jest.clearAllMocks(); useStore.setState({ user: { uid: 'amb', name: 'Jean' }, language: 'fr' } as any); });

it('shows the invite code, server-computed recruits and the school standing', async () => {
  request.mockResolvedValue({ school: 'Lycée Pétion', code: 'ABC234', link: 'https://academy.edlight.org/?ref=ABC234', period: '2026-10',
    total: s(12, 7, 2), thisPeriod: s(5, 3, 2), schoolProgress: { week: { rank: 2, of: 30, totalXp: 900, members: 14 }, allTime: null } });
  render(<MemoryRouter><Ambassadeur /></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: 'Lycée Pétion' })).toBeInTheDocument();
  expect(screen.getByText('ABC234')).toBeInTheDocument();
  expect(screen.getByText('2e sur 30 · 900 XP · 14 élèves')).toBeInTheDocument();
  expect(screen.getByText(/au moins 3 jours différents pendant ses 14 premiers jours/)).toBeInTheDocument();
  expect(request).toHaveBeenCalledWith('dashboard');
});

it('a student who is not an ambassador is told so', async () => {
  request.mockRejectedValue(new AmbassadorError('forbidden'));
  render(<MemoryRouter><Ambassadeur /></MemoryRouter>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Réservé aux ambassadeurs désignés.');
});
