import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../contexts/store';
import Leaderboard from '../Leaderboard';
import { useLeaderboard, useCollectives } from '../../hooks/useLeaderboard';
import { useTrivia } from '../../hooks/useTrivia';

// The board's data hooks hit Firestore + the collectives API; mock them so the
// test focuses purely on the collective-scope UI (tab switch → ranked groups →
// tap-to-expand member drill-down).
jest.mock('../../hooks/useLeaderboard', () => ({
  useLeaderboard: jest.fn(),
  useCollectives: jest.fn(),
}));
jest.mock('../../hooks/useTrivia', () => ({
  useTrivia: jest.fn(),
}));
// The component pulls isValidAlias from this service, which transitively boots
// Firebase (no valid key under jest). Only isValidAlias is used here.
jest.mock('../../services/leaderboardService', () => ({
  isValidAlias: (n: string) => /\p{L}/u.test(String(n || '')),
}));

const mockUseLeaderboard = useLeaderboard as jest.Mock;
const mockUseCollectives = useCollectives as jest.Mock;
const mockUseTrivia = useTrivia as jest.Mock;

// Individual (National) entries — deliberately named differently from the group
// members below so we can tell which board is on screen.
const ENTRIES = [
  { id: 'z', displayName: 'Zoe', xp: 120, level: 3, rank: 1 },
  { id: 'y', displayName: 'Yannick', xp: 90, level: 2, rank: 2 },
];

// Exhaustive collective ranking as the server would return it (members ride
// along in topMembers for the drill-down).
const SCHOOL_GROUPS = [
  {
    key: 'lycee toussaint',
    label: 'Lycée Toussaint',
    totalXp: 900,
    members: 3,
    avgXp: 300,
    rank: 1,
    topMembers: [
      { uid: 'a', displayName: 'Ana', xp: 500 },
      { uid: 'b', displayName: 'Bételème', xp: 300 },
      { uid: 'd', displayName: 'Dieuline', xp: 100 },
    ],
  },
  {
    key: 'college saint-louis',
    label: 'Collège Saint-Louis',
    totalXp: 900,
    members: 1,
    avgXp: 900,
    rank: 2,
    topMembers: [{ uid: 'c', displayName: 'Carline', xp: 900 }],
  },
];

function renderBoard() {
  return render(
    <MemoryRouter>
      <Leaderboard variant="full" />
    </MemoryRouter>,
  );
}

describe('Leaderboard — collective (École/Ville) scope', () => {
  beforeEach(() => {
    useStore.setState({ user: { uid: 'me' }, language: 'fr' });

    mockUseLeaderboard.mockReturnValue({
      entries: ENTRIES,
      myEntry: null,
      myRank: null,
      isLoading: false,
      refetch: jest.fn(),
    });
    mockUseCollectives.mockReturnValue({
      groups: SCHOOL_GROUPS,
      isLoading: false,
      isFetching: false,
    });
    mockUseTrivia.mockReturnValue({
      profile: { leaderboard: { optedIn: true, displayName: 'Moi', school: 'Lycée Toussaint' } },
      level: 3,
      setLeaderboardOptIn: jest.fn(),
      isAuthed: true,
    });
  });

  it('shows individual learners on the National board by default', () => {
    renderBoard();
    expect(screen.getByText('Zoe')).toBeInTheDocument();
    // A school label from the collective ranking must NOT leak into National.
    expect(screen.queryByText('Lycée Toussaint')).not.toBeInTheDocument();
  });

  it('switches to a ranked list of schools when the École tab is selected', () => {
    renderBoard();
    fireEvent.click(screen.getByRole('tab', { name: 'École' }));

    // Collectives now shown, individuals gone.
    expect(screen.getByText('Lycée Toussaint')).toBeInTheDocument();
    expect(screen.getByText('Collège Saint-Louis')).toBeInTheDocument();
    expect(screen.queryByText('Zoe')).not.toBeInTheDocument();

    // Members stay collapsed until a group is expanded.
    expect(screen.queryByText('Ana')).not.toBeInTheDocument();
  });

  it('expands a school to reveal its members, ranked, on tap', () => {
    renderBoard();
    fireEvent.click(screen.getByRole('tab', { name: 'École' }));
    fireEvent.click(screen.getByText('Lycée Toussaint'));

    // The tapped group's members appear…
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('Bételème')).toBeInTheDocument();
    expect(screen.getByText('Dieuline')).toBeInTheDocument();
    // …but not the OTHER group's members.
    expect(screen.queryByText('Carline')).not.toBeInTheDocument();
  });

  it('queries collectives for the selected field (school vs city)', () => {
    renderBoard();
    fireEvent.click(screen.getByRole('tab', { name: 'École' }));
    expect(mockUseCollectives).toHaveBeenCalledWith('school', 'week', true);

    fireEvent.click(screen.getByRole('tab', { name: 'Ville' }));
    expect(mockUseCollectives).toHaveBeenCalledWith('city', 'week', true);
  });

  it('exposes a Département collective tab', () => {
    renderBoard();
    fireEvent.click(screen.getByRole('tab', { name: 'Département' }));
    expect(mockUseCollectives).toHaveBeenCalledWith('department', 'week', true);
  });
});
