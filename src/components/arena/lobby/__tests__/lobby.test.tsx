/**
 * /arena's lobby with every data hook mocked: what a guest and a signed-in
 * student see first, the rival it names (or refuses to name), and the keys.
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import ArenaArcade from '../../../../pages/arena/ArenaArcade';

const mockState: any = { user: null, language: 'fr', toggleAuthModal: jest.fn(), setSchoolChosen: jest.fn() };
jest.mock('../../../../contexts/store', () => {
  const useStore: any = (sel?: any) => (sel ? sel(mockState) : mockState);
  useStore.getState = () => mockState;
  return { __esModule: true, default: useStore };
});

let mockProfile: any = { xp: 0, leaderboard: {} };
jest.mock('../../../../hooks/useTrivia', () => ({
  useTrivia: () => ({ profile: mockProfile, level: { level: 4, xp: 1234 } }),
}));

let mockBoard: any = { entries: [], myEntry: null, myRank: null };
let mockGroups: any[] = [];
jest.mock('../../../../hooks/useLeaderboard', () => ({
  useLeaderboard: () => mockBoard,
  useCollectives: () => ({ groups: mockGroups, isLoading: false }),
}));
jest.mock('../../../../hooks/useSchoolRace', () => {
  const { schoolRace } = jest.requireActual('../../../../../shared/leaderboardAgg');
  return { useSchoolRace: () => ({ race: schoolRace(mockGroups), isLoading: false }) };
});
let mockOpen: any = null;
jest.mock('../../../../hooks/useOpenArena', () => ({ useOpenArena: () => mockOpen }));
jest.mock('../../../../hooks/useStoryProgress', () => ({ useStoryProgress: () => ({ progress: {} }) }));
jest.mock('../../../arena/ArenaJoin', () => ({ __esModule: true, default: () => <div>join-band</div> }));
jest.mock('../../../UserAvatar', () => ({ __esModule: true, default: ({ name }: any) => <span>{name}</span> }));
jest.mock('../../../../utils/telemetry', () => ({ trackEvent: jest.fn() }));
jest.mock('../../../../utils/schoolInvite', () => ({
  inviteRef: jest.fn(async () => ({ code: null, link: 'https://academy.edlight.org' })),
  schoolInviteMessage: () => 'msg', sendInvite: jest.fn(async () => false), canNativeShare: () => false,
}));

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname}|{JSON.stringify(loc.state)}</div>;
}
const renderLobby = () => render(
  <MemoryRouter initialEntries={['/arena']}>
    <Routes>
      <Route path="/arena" element={<ArenaArcade />} />
      <Route path="*" element={<Where />} />
    </Routes>
  </MemoryRouter>,
);

const member = (uid: string, xp: number) => ({ uid, displayName: uid, xp });
const group = (label: string, n: number, xp = 1000) => ({
  key: jest.requireActual('../../../../../shared/leaderboardAgg').normalizeName(label), label, members: n, xp: n * xp,
  topMembers: Array.from({ length: Math.min(n, 5) }, (_, i) => member(`${label}-${i}`, xp - i)),
});
const entry = (id: string, rank: number, xp: number, school: string | null) => ({ id, rank, xp, school, displayName: id, level: 3 });

beforeEach(() => {
  (window as any).matchMedia = (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  mockState.user = null;
  mockProfile = { xp: 0, leaderboard: {} };
  mockBoard = { entries: [], myEntry: null, myRank: null };
  mockGroups = [];
  mockOpen = null;
});

describe('guest', () => {
  it('leads with Play — a real round, no account — and only a quiet sign-in', () => {
    mockGroups = [group('Lycée Pétion', 5)];
    renderLobby();
    const strip = screen.getByRole('region', { name: 'Ton lobby' });
    const actions = within(strip).getAllByRole('link').concat(within(strip).getAllByRole('button'));
    const play = within(strip).getByRole('link', { name: /Jouer une partie/ });
    // Play is the first control in the strip
    expect(strip.querySelector('a, button')).toBe(play);
    expect(actions.filter((a) => a.classList.contains('ah-start'))).toHaveLength(1);
    expect(within(strip).getByText(/sans compte/)).toBeInTheDocument();
    expect(within(strip).getByRole('button', { name: /Connecte-toi pour représenter ton école/ })).toBeInTheDocument();
    // no school picker / pseudo ask in the strip
    expect(within(strip).queryByText(/Choisis ton école/)).toBeNull();
    // the leader shown is the real one
    expect(within(strip).getByText('Lycée Pétion')).toBeInTheDocument();

    fireEvent.click(play);
    expect(screen.getByTestId('where').textContent).toBe('/jeux/trivia|{"startCategory":"mixed"}');
  });

  it('sign-in opens the auth modal', () => {
    renderLobby();
    fireEvent.click(screen.getByRole('button', { name: /Connecte-toi pour représenter/ }));
    expect(mockState.toggleAuthModal).toHaveBeenCalled();
  });
});

describe('signed in', () => {
  const signIn = (school: string | null = 'Lycée Pétion', name = 'Ti Jo') => {
    mockState.user = { uid: 'me' };
    mockProfile = { xp: 1234, leaderboard: { displayName: name, school } };
  };

  it('shows pseudo, real weekly place, the school race place and ONE primary action', () => {
    signIn();
    mockGroups = [group('Collège Saint-Pierre', 5, 2000), group('Lycée Pétion', 3)];
    mockBoard = {
      entries: [entry('a', 1, 900, 'Collège Saint-Pierre'), entry('me', 2, 400, 'Lycée Pétion')],
      myEntry: entry('me', 2, 400, 'Lycée Pétion'), myRank: 2,
    };
    renderLobby();
    const strip = screen.getByRole('region', { name: 'Ton lobby' });
    expect(within(strip).getByText('Ti Jo')).toBeInTheDocument();
    expect(within(strip).getByTestId('weekly-place').textContent).toBe('#2 au national · 400 XP');
    expect(within(strip).getByTestId('school-place').textContent).toBe('#2 sur 2 écoles · encore 2 joueurs');
    expect(strip.querySelectorAll('.ah-start')).toHaveLength(1);
  });

  it('names the schoolmate just above as the rival, with the real gap, and Défier starts a duel', () => {
    signIn();
    mockBoard = {
      entries: [
        entry('ana', 1, 900, 'Lycée Pétion'),
        entry('bob', 2, 700, 'Collège Saint-Pierre'),
        entry('cara', 3, 650, 'Lycée Pétion'),
        entry('dan', 4, 620, 'Autre'),
        entry('me', 5, 600, 'Lycée Pétion'),
      ],
      myEntry: entry('me', 5, 600, 'Lycée Pétion'), myRank: 5,
    };
    renderLobby();
    const strip = screen.getByRole('region', { name: 'Ton lobby' });
    expect(within(strip).getByText(/Ton rival · dans ton école/)).toBeInTheDocument();
    expect(within(strip).getByTestId('rival-gap').textContent).toBe('#3 · 50 XP devant toi');
    fireEvent.click(within(strip).getByRole('link', { name: 'Défier cara' }));
    expect(screen.getByTestId('where').textContent).toBe('/jeux/trivia|{"duelPick":true}');
  });

  it('falls back to the national neighbour when no schoolmate is ahead', () => {
    signIn();
    mockBoard = {
      entries: [entry('bob', 1, 700, 'Collège Saint-Pierre'), entry('me', 2, 600, 'Lycée Pétion')],
      myEntry: entry('me', 2, 600, 'Lycée Pétion'), myRank: 2,
    };
    renderLobby();
    expect(screen.getByText(/Ton rival · au national/)).toBeInTheDocument();
    expect(screen.getByTestId('rival-gap').textContent).toBe('#1 · 100 XP devant toi');
  });

  it('never invents a rival: below a full page there is none, and it offers an invite', async () => {
    signIn();
    mockBoard = {
      entries: Array.from({ length: 50 }, (_, i) => entry(`p${i}`, i + 1, 1000 - i, 'Lycée Pétion')),
      myEntry: { id: 'me', xp: 12 }, myRank: 140,
    };
    renderLobby();
    const strip = screen.getByRole('region', { name: 'Ton lobby' });
    expect(within(strip).queryByTestId('rival-gap')).toBeNull();
    expect(within(strip).getByTestId('rival-none').textContent).toMatch(/top 50/);
    expect(within(strip).queryByRole('link', { name: /Défier/ })).toBeNull();
    fireEvent.click(within(strip).getByRole('button', { name: /Inviter un camarade/ }));
    const { sendInvite } = jest.requireMock('../../../../utils/schoolInvite');
    await screen.findByRole('button', { name: /Inviter un camarade/ });
    expect(sendInvite).toHaveBeenCalledWith('whatsapp', 'msg', 'arena-lobby');
  });

  it('the weekly leader is told nobody is ahead', () => {
    signIn();
    mockBoard = { entries: [entry('me', 1, 600, 'Lycée Pétion')], myEntry: entry('me', 1, 600, 'Lycée Pétion'), myRank: 1 };
    renderLobby();
    expect(screen.getByTestId('rival-none').textContent).toMatch(/Personne devant toi/);
  });
});

describe('lanes and keys', () => {
  it('shows the three lanes with the real duel stakes', () => {
    renderLobby();
    expect(screen.getByRole('heading', { name: 'Défier un ami' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dans mon école' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Représenter mon école' })).toBeInTheDocument();
    expect(screen.getByText(/10 questions, 15 s chacune · 3 min/)).toBeInTheDocument();
    expect(screen.getByText(/Le gagnant prend \+20 XP · égalité \+10 chacun/)).toBeInTheDocument();
  });

  it('shows an open championship with its real state', () => {
    mockOpen = { id: 't', title: 'Arène', titleHt: 'Arèn', state: 'registration', startsAt: Date.now() + 86400000 * 3, schools: 4, players: 31 };
    renderLobby();
    expect(screen.getByText(/4 écoles inscrites · 31 joueurs/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Inscrire mon école/ }).getAttribute('href')).toBe('/arena/championnat');
  });

  it.each([
    ['1', '/jeux/trivia|{"duelPick":true}'],
    ['2', '/classement|null'],
    ['3', '/arena/championnat|null'],
    ['4', '/arena/histoire|null'],
    ['5', '/tournois/nouveau|null'],
    ['6', '/jeux|null'],
  ])('key %s opens %s', (key, where) => {
    renderLobby();
    fireEvent.keyDown(window, { key });
    expect(screen.getByTestId('where').textContent).toBe(where);
  });
});
