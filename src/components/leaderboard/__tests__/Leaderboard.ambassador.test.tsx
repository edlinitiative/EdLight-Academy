import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../contexts/store';
import Leaderboard from '../../Leaderboard';
import { useLeaderboard, useCollectives } from '../../../hooks/useLeaderboard';
import { useTrivia } from '../../../hooks/useTrivia';
import { __resetAmbassadorCache } from '../../../hooks/useAmbassadors';

jest.mock('../../../hooks/useLeaderboard', () => ({ useLeaderboard: jest.fn(), useCollectives: jest.fn() }));
jest.mock('../../../hooks/useTrivia', () => ({ useTrivia: jest.fn() }));
jest.mock('../../../services/leaderboardService', () => ({ isValidAlias: (n: string) => /\p{L}/u.test(String(n || '')) }));

it('marks ambassadors beside their public alias, and nobody else', async () => {
  __resetAmbassadorCache();
  (global as any).fetch = jest.fn(async () => ({ ok: true, json: async () => ({ uids: ['z'] }) }));
  useStore.setState({ user: { uid: 'me' }, language: 'fr' } as any);
  (useLeaderboard as jest.Mock).mockReturnValue({ entries: [
    { id: 'z', displayName: 'Zoe', xp: 1240, level: 3, rank: 1 },
    { id: 'y', displayName: 'Yannick', xp: 90, level: 2, rank: 2 },
  ], myEntry: null, myRank: null, isLoading: false, isError: false, refetch: jest.fn() });
  (useCollectives as jest.Mock).mockReturnValue({ groups: [], isLoading: false, isFetching: false });
  (useTrivia as jest.Mock).mockReturnValue({ profile: { leaderboard: { optedIn: true, displayName: 'Moi' } }, level: 3, setLeaderboardOptIn: jest.fn(), isAuthed: true });
  render(<MemoryRouter><Leaderboard variant="full" /></MemoryRouter>);
  const zoe = (await screen.findByText('Ambassadeur')).closest('li') as HTMLElement;
  expect(within(zoe).getByText('Zoe')).toBeInTheDocument();
  expect(within(screen.getByText('Yannick').closest('li') as HTMLElement).queryByText('Ambassadeur')).not.toBeInTheDocument();
  expect((global as any).fetch).toHaveBeenCalledWith('/api/ambassadors?view=directory');
});
