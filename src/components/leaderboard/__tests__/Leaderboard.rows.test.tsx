import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../contexts/store';
import Leaderboard from '../../Leaderboard';
import { useLeaderboard, useCollectives } from '../../../hooks/useLeaderboard';
import { useTrivia } from '../../../hooks/useTrivia';

// Row presentation on the National board: school under the name (only when the
// entry carries one), the viewer's own row marked, and "Ta place" pinned under
// the list when the viewer is ranked outside it.
jest.mock('../../../hooks/useLeaderboard', () => ({
  useLeaderboard: jest.fn(),
  useCollectives: jest.fn(),
}));
jest.mock('../../../hooks/useTrivia', () => ({ useTrivia: jest.fn() }));
jest.mock('../../../services/leaderboardService', () => ({
  isValidAlias: (n: string) => /\p{L}/u.test(String(n || '')),
}));

const mockUseLeaderboard = useLeaderboard as jest.Mock;

const ENTRIES = [
  { id: 'z', displayName: 'Zoe', xp: 1240, level: 3, rank: 1, school: 'Lycée Pétion' },
  { id: 'y', displayName: 'Yannick', xp: 90, level: 2, rank: 2 },
];

function setup(board: Record<string, unknown>) {
  useStore.setState({ user: { uid: 'me' }, language: 'fr' });
  mockUseLeaderboard.mockReturnValue({ entries: ENTRIES, myEntry: null, myRank: null, isLoading: false, isError: false, refetch: jest.fn(), ...board });
  (useCollectives as jest.Mock).mockReturnValue({ groups: [], isLoading: false, isFetching: false });
  (useTrivia as jest.Mock).mockReturnValue({
    profile: { leaderboard: { optedIn: true, displayName: 'Moi' } },
    level: 3,
    setLeaderboardOptIn: jest.fn(),
    isAuthed: true,
  });
  return render(<MemoryRouter><Leaderboard variant="full" /></MemoryRouter>);
}

describe('Leaderboard — rows', () => {
  it('shows the school under the name only when the entry has one', () => {
    setup({});
    const zoe = screen.getByText('Zoe').closest('li') as HTMLElement;
    expect(within(zoe).getByText(/Lycée Pétion/)).toBeInTheDocument();
    const yan = screen.getByText('Yannick').closest('li') as HTMLElement;
    expect(within(yan).queryByText(/Lycée/)).not.toBeInTheDocument();
  });

  it('pins the viewer under the list as "Ta place" when ranked outside it', () => {
    setup({ myEntry: { id: 'me', displayName: 'Moi', xp: 12, school: 'Collège X' }, myRank: 61 });
    expect(screen.getByText('Ta place')).toBeInTheDocument();
    const mine = screen.getByText('Moi').closest('li') as HTMLElement;
    expect(mine).toHaveClass('is-me');
    expect(within(mine).getByText('61')).toBeInTheDocument();
    expect(within(mine).getByText(/Collège X/)).toBeInTheDocument();
  });

  it('highlights the viewer in place and does not pin a duplicate when listed', () => {
    const withMe = [...ENTRIES, { id: 'me', displayName: 'Moi', xp: 50, level: 1, rank: 3 }];
    setup({ entries: withMe, myEntry: withMe[2], myRank: 3 });
    expect(screen.queryByText('Ta place')).not.toBeInTheDocument();
    expect(screen.getAllByText('Moi')).toHaveLength(1);
    expect(screen.getByText('Moi').closest('li')).toHaveClass('is-me');
  });
});
