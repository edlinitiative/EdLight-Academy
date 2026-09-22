import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import WelcomeGradeModal from '../WelcomeGradeModal';
import useStore from '../../contexts/store';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const renderModal = () => render(
  <QueryClientProvider client={new QueryClient()}><WelcomeGradeModal /></QueryClientProvider>,
);

const mockLoadProfile = jest.fn();
const mockSetMySchool = jest.fn().mockResolvedValue({});
const mockCount = jest.fn();

jest.mock('../../services/triviaService', () => ({
  loadTriviaProfile: (...a) => mockLoadProfile(...a),
  setMySchool: (...a) => mockSetMySchool(...a),
}));
jest.mock('../../services/schoolWebService', () => ({
  countSchoolmates: (...a) => mockCount(...a),
}));
jest.mock('../../services/referralService', () => ({
  getReferralCode: jest.fn().mockResolvedValue({ code: 'ABC123', link: 'https://academy.edlight.org/r/ABC123' }),
}));
jest.mock('../../utils/telemetry', () => ({ trackEvent: jest.fn() }));
// The picker has its own suite; here it only has to hand back a school.
jest.mock('../arena/SchoolField', () => ({ onPick }) => (
  <button type="button" onClick={() => onPick({ key: 'college-x', label: 'Collège X', departement: 'Ouest' })}>
    pick-school
  </button>
));

function signIn(extra = {}) {
  act(() => {
    useStore.setState({
      hydrated: true,
      authConfirmed: true,
      isAuthenticated: true,
      user: { uid: 'me' } as any,
      language: 'fr',
      gradeChosen: true,
      schoolChosen: false,
      ...extra,
    });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('asks for the school after the grade, then says the student is the first from it', async () => {
  mockLoadProfile.mockResolvedValue({ leaderboard: {} });
  mockCount.mockResolvedValue(0);
  signIn({ gradeChosen: false });
  renderModal();

  expect(screen.getByText('Tu es en quelle classe ?')).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button')[0]);

  expect(await screen.findByText('Tu vas à quelle école ?')).toBeInTheDocument();
  fireEvent.click(screen.getByText('pick-school'));
  fireEvent.click(screen.getByText('Continuer'));

  expect(await screen.findByText('Tu es le premier élève de Collège X ici !')).toBeInTheDocument();
  expect(mockSetMySchool).toHaveBeenCalledWith('me', { school: 'Collège X', department: 'Ouest' });
  await waitFor(() => expect(screen.getByText('Inviter sur WhatsApp')).not.toBeDisabled());
});

it('counts the classmates already there', async () => {
  mockLoadProfile.mockResolvedValue({ leaderboard: {} });
  mockCount.mockResolvedValue(3);
  signIn();
  renderModal();
  fireEvent.click(await screen.findByText('pick-school'));
  fireEvent.click(screen.getByText('Continuer'));
  expect(await screen.findByText('3 élèves de Collège X sont déjà là')).toBeInTheDocument();
});

it('never claims "first" when the count could not be read', async () => {
  mockLoadProfile.mockResolvedValue({ leaderboard: {} });
  mockCount.mockResolvedValue(null);
  signIn();
  renderModal();
  fireEvent.click(await screen.findByText('pick-school'));
  fireEvent.click(screen.getByText('Continuer'));
  expect(await screen.findByText('Ton école est enregistrée')).toBeInTheDocument();
  expect(screen.queryByText(/premier/)).not.toBeInTheDocument();
});

it('skips the school step for an account that already has a school', async () => {
  mockLoadProfile.mockResolvedValue({ leaderboard: { school: 'Lycée Y' } });
  signIn();
  renderModal();
  await waitFor(() => expect(useStore.getState().schoolChosen).toBe(true));
  expect(screen.queryByText('Tu vas à quelle école ?')).not.toBeInTheDocument();
});
