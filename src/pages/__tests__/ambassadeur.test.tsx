import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Ambassadeur from '../Ambassadeur';
import useStore from '../../contexts/store';
import { ambassadorRequest } from '../../services/ambassadorService';
import { AMBASSADOR_APPLY_URL, AmbassadorError } from '../../../shared/ambassadors';

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

it('a student who is not an ambassador gets the pitch and the EdLight Apply link', async () => {
  request.mockRejectedValue(new AmbassadorError('forbidden'));
  render(<MemoryRouter><Ambassadeur /></MemoryRouter>);
  const cta = await screen.findByRole('link', { name: 'Postuler sur EdLight Apply' });
  expect(cta).toHaveAttribute('href', AMBASSADOR_APPLY_URL);
  expect(cta).toHaveAttribute('target', '_blank');
  expect(screen.getByRole('heading', { name: 'Devenir ambassadeur' })).toBeInTheDocument();
  expect(screen.getByText('Au plus 2 ambassadeurs par école.')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('the pitch is in Kreyòl, and a signed-out visitor can also sign in', async () => {
  useStore.setState({ user: null, language: 'ht' } as any);
  render(<MemoryRouter><Ambassadeur /></MemoryRouter>);
  expect(screen.getByRole('heading', { name: 'Vin anbasadè' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Aplike sou EdLight Apply' })).toHaveAttribute('href', AMBASSADOR_APPLY_URL);
  expect(screen.getByRole('button', { name: 'Konekte' })).toBeInTheDocument();
  expect(request).not.toHaveBeenCalled();
});

it('any other failure keeps the retry message instead of the pitch', async () => {
  request.mockRejectedValue(new AmbassadorError('unavailable'));
  render(<MemoryRouter><Ambassadeur /></MemoryRouter>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Connexion impossible. Réessaie.');
  expect(screen.queryByRole('link', { name: 'Postuler sur EdLight Apply' })).not.toBeInTheDocument();
});
