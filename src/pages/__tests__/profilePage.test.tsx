/**
 * /profile, signed in, with the store and every service mocked: what the page
 * shows comes from the mocks, and what it saves goes back through the same
 * services the real page calls.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Profile from '../Profile';

const mockState: any = {
  user: { uid: 'u1', name: 'Naïka Merisier', email: 'naika@example.com' },
  isAuthenticated: true,
  language: 'fr',
  theme: 'light',
  grade: 'NS3',
  track: null,
  setLanguage: jest.fn(),
  toggleTheme: jest.fn(),
  setShowNotifications: jest.fn(),
  toggleAuthModal: jest.fn(),
  setActiveTab: jest.fn(),
  logout: jest.fn(),
  setGrade: jest.fn(),
  setGradeChosen: jest.fn(),
  setSchoolChosen: jest.fn(),
};
jest.mock('../../contexts/store', () => {
  const useStore: any = (sel?: any) => (sel ? sel(mockState) : mockState);
  useStore.getState = () => mockState;
  return { __esModule: true, default: useStore };
});

const mockProfile: any = {
  xp: 340,
  totalQuestions: 10,
  totalCorrect: 8,
  leaderboard: { optedIn: true, displayName: 'Naïka M.', school: 'Lycée Pétion', city: 'Delmas', department: 'Ouest' },
};
jest.mock('../../hooks/useTrivia', () => ({
  useTrivia: () => ({ profile: mockProfile, level: { level: 3, xp: 340, xpToNext: 60, progressPct: 70 }, isLoading: false }),
}));
jest.mock('../../hooks/useStreak', () => ({ useStreak: () => ({ streak: { currentStreak: 4, longestStreak: 9, milestones: [] } }) }));
jest.mock('../../hooks/useProgress', () => ({ useAllProgress: () => ({ progress: [], loading: false }) }));
jest.mock('../../hooks/useLeaderboard', () => ({
  useLeaderboard: () => ({
    myRank: 2,
    entries: [
      { id: 'u9', rank: 1, xp: 400, displayName: 'Jean P.', school: 'LYCEE PETION' },
      { id: 'u1', rank: 2, xp: 340, displayName: 'Naïka M.', school: 'Lycée Pétion' },
      { id: 'u7', rank: 3, xp: 300, displayName: 'Other School', school: 'Collège Canado' },
    ],
  }),
}));

const mockSaveBoard = jest.fn();
jest.mock('../../services/triviaService', () => ({ setLeaderboardOptIn: (...a: any[]) => mockSaveBoard(...a) }));
const mockUpdateUser = jest.fn().mockResolvedValue({ success: true });
let mockProviders: any[] = [{ providerId: 'password' }];
jest.mock('../../services/firebase', () => ({
  getUserProfile: jest.fn().mockResolvedValue({ studyGoal: 'grades', studyMinutes: 20 }),
  updateUser: (...a: any[]) => mockUpdateUser(...a),
  getCurrentUser: () => ({ providerData: mockProviders }),
}));
const mockReset = jest.fn().mockResolvedValue(undefined);
jest.mock('../../services/authService', () => ({ logoutUser: jest.fn(), sendPasswordReset: (...a: any[]) => mockReset(...a) }));
jest.mock('../../services/reviewService', () => ({
  loadReviewMap: jest.fn().mockResolvedValue({
    q1: { missedAt: 5, subjectCode: 'MATH-NSIII', unitNo: 2 },
    q2: { missedAt: 6, subjectCode: 'MATH-NSIII', unitNo: 2 },
    q3: { missedAt: 1, correctAt: 9, subjectCode: 'CHEM-NSI', unitNo: 1 }, // resolved — not due
  }),
}));
jest.mock('../../services/masteryService', () => ({
  readMastery: jest.fn().mockResolvedValue({
    'ECON-NSI-U1-L1': { masteredAt: 1 },
    'ECON-NSI-U1-L2': { bestPct: 100 },
    'ECON-NSI-U2-L1': { completed: true },
  }),
}));
jest.mock('../../components/MySchoolCard', () => () => <div>school-card</div>);
jest.mock('../../components/ReadinessCard', () => () => <div>readiness-card</div>);
jest.mock('../../components/arena/SchoolField', () => ({ picked }: any) => <div>school-field:{picked?.label}</div>);

beforeEach(() => {
  mockSaveBoard.mockReset();
  mockUpdateUser.mockClear();
  mockReset.mockClear();
  mockProviders = [{ providerId: 'password' }];
  (global as any).fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ courses: [{ units: [{ unitId: 'MATH-NSIII-U2', title: 'Inéquations et Bijection' }] }] }),
  });
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
});

async function renderPage(path = '/profile') {
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}><Profile /></MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByText('Inéquations et Bijection');
}

it('shows the title bar, the three figures and the five numbered sections', async () => {
  await renderPage();
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Naïka Merisier');
  expect(screen.getByText('@Naïka M.')).toBeInTheDocument();
  ['Informations', 'Objectifs', 'Réseau', 'Préférences', 'Compte'].forEach((s) => {
    expect(screen.getByRole('heading', { name: s })).toBeInTheDocument();
  });
  expect(screen.getByText('#2')).toBeInTheDocument();
  expect(screen.getByText('60 XP du #1')).toBeInTheDocument();
  expect(document.getElementById('reglages')).not.toBeNull();
});

it('saves the pseudo from the title bar, keeping the board opt-in as it was', async () => {
  const before = mockProfile.leaderboard;
  // As the real hook would after setQueryData: the next render reads the saved profile.
  mockSaveBoard.mockImplementation(async () => {
    mockProfile.leaderboard = { ...before, displayName: 'Naïka' };
    return mockProfile;
  });
  await renderPage();
  const save = screen.getByRole('button', { name: 'Enregistrer' });
  expect(save).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Pseudo affiché/), { target: { value: 'Naïka' } });
  expect(save).toBeEnabled();
  await act(async () => { fireEvent.click(save); });
  expect(mockSaveBoard).toHaveBeenCalledWith('u1', expect.objectContaining({ optedIn: true, displayName: 'Naïka', school: 'Lycée Pétion' }));
  // The saved profile re-seeds the form; the confirmation must survive it.
  expect(await screen.findByText('Enregistré')).toBeInTheDocument();
  expect(save).toBeDisabled();
  mockProfile.leaderboard = before;
});

it('will not save a pseudo without a letter', async () => {
  await renderPage();
  fireEvent.change(screen.getByLabelText(/Pseudo affiché/), { target: { value: '...' } });
  expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  expect(screen.getByText(/au moins une lettre/)).toBeInTheDocument();
});

it('lists weak units from due reviews and strong units from mastery, each linking to practice', async () => {
  await renderPage();
  const weak = screen.getByText('Inéquations et Bijection').closest('a')!;
  expect(weak).toHaveAttribute('href', '/quizzes?course=MATH-NSIII&unit=U2');
  expect(within(weak).getByText('2 à revoir')).toBeInTheDocument();
  // CHEM-NSI's only entry was answered correctly since — not a weak point.
  expect(screen.queryByText(/Chimie NS1/)).toBeNull();
  const strong = await screen.findByText('2 maîtrisées');
  expect(strong.closest('a')).toHaveAttribute('href', '/quizzes?course=ECON-NSI&unit=U1');
  expect(screen.getByRole('link', { name: /Lancer ma révision/ })).toHaveAttribute('href', '/revision');
});

it('saves the goal to the account on tap', async () => {
  await renderPage();
  const bac = await screen.findByRole('button', { name: 'Réussir le Bac' });
  await waitFor(() => expect(bac).toBeEnabled());
  expect(screen.getByRole('button', { name: 'Améliorer mes notes' })).toHaveAttribute('aria-pressed', 'true');
  await act(async () => { fireEvent.click(bac); });
  expect(mockUpdateUser).toHaveBeenCalledWith('u1', { studyGoal: 'bac' });
  expect(await screen.findByText('Enregistré sur votre compte')).toBeInTheDocument();
});

it('shows schoolmates from the board, not other schools or the student', async () => {
  await renderPage();
  expect(screen.getByText('Jean P.')).toBeInTheDocument();
  expect(screen.queryByText('Other School')).toBeNull();
});

it('turns the board visibility off through the same service', async () => {
  mockSaveBoard.mockResolvedValue({ ...mockProfile, leaderboard: { ...mockProfile.leaderboard, optedIn: false } });
  await renderPage();
  const sw = screen.getByRole('switch', { name: 'Visible au classement' });
  expect(sw).toHaveAttribute('aria-checked', 'true');
  await act(async () => { fireEvent.click(sw); });
  expect(mockSaveBoard).toHaveBeenCalledWith('u1', { optedIn: false });
});

it('offers a password reset only to e-mail/password accounts', async () => {
  await renderPage();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Changer mon mot de passe/ })); });
  expect(mockReset).toHaveBeenCalledWith('naika@example.com');
  expect(screen.getByText(/Lien envoyé/)).toBeInTheDocument();
});

it('hides the password reset for a Google account', async () => {
  mockProviders = [{ providerId: 'google.com' }];
  await renderPage();
  expect(screen.queryByRole('button', { name: /Changer mon mot de passe/ })).toBeNull();
  expect(screen.getByText('naika@example.com')).toBeInTheDocument();
});

it('keeps the account links and sign-out', async () => {
  await renderPage();
  expect(screen.getByRole('link', { name: /Supprimer mon compte/ })).toHaveAttribute('href', '/delete-account');
  expect(screen.getByRole('link', { name: /Relevé de progression/ })).toHaveAttribute('href', '/releve');
  expect(screen.getByRole('link', { name: /Confidentialité/ })).toHaveAttribute('href', '/privacy');
  expect(screen.getByRole('button', { name: /Déconnexion/ })).toBeInTheDocument();
});

it('lands in the pseudo field from /profile#reglages when there is no pseudo', async () => {
  jest.useFakeTimers();
  const saved = mockProfile.leaderboard.displayName;
  mockProfile.leaderboard.displayName = '';
  try {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/profile#reglages']}><Profile /></MemoryRouter>
      </QueryClientProvider>,
    );
    act(() => { jest.advanceTimersByTime(400); });
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    expect(screen.getByLabelText(/Pseudo affiché/)).toHaveFocus();
    expect(screen.getByRole('switch', { name: 'Visible au classement' })).toBeInTheDocument();
  } finally {
    mockProfile.leaderboard.displayName = saved;
    jest.useRealTimers();
  }
});
