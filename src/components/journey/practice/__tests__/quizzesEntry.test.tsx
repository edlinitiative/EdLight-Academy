import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { courses, quizBank } from './fixtures';

const mockAppData = { current: { data: { courses, quizBank }, isLoading: false, isError: false, isFetching: false, refetch: jest.fn() } as any };
jest.mock('../../../../hooks/useData', () => ({ useAppData: () => mockAppData.current }));
jest.mock('../../../../pages/home/content', () => ({ subjectThumbs: {} }));
jest.mock('../../../../services/answerEventsService', () => ({ logAnswerEvent: jest.fn() }));
jest.mock('../../../../services/reviewService', () => ({
  recordReviewOutcome: jest.fn(),
  loadDueReviewIds: jest.fn(() => Promise.resolve([])),
}));
jest.mock('../../../../utils/shared', () => ({ useKatex: () => true, renderWithKatex: (s: string) => ({ __html: s }) }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, d: string, o?: any) => (o && typeof d === 'string' ? d.replace('{{count}}', String(o.count)) : d),
    i18n: { language: 'fr' },
  }),
}));
const mockTrack = jest.fn();
jest.mock('../../../../utils/learningJourney', () => ({
  ...jest.requireActual('../../../../utils/learningJourney'),
  trackJourney: (...a: any[]) => mockTrack(...a),
}));

// eslint-disable-next-line import/first
import Quizzes from '../../../../pages/Quizzes';

const renderAt = (url: string) => render(<MemoryRouter initialEntries={[url]}><Quizzes /></MemoryRouter>);

beforeEach(() => {
  mockTrack.mockClear();
  mockAppData.current = { data: { courses, quizBank }, isLoading: false, isError: false, isFetching: false, refetch: jest.fn() };
});

it('a lesson handoff confirms the topic instead of asking to reselect it', () => {
  renderAt('/quizzes?course=chem-ns1&unit=U1&lesson=CHEM-NSI-U1-L1&from=lesson');
  expect(screen.getByRole('heading', { level: 1, name: 'Grandeurs et Mesures' })).toBeInTheDocument();
  expect(screen.getByText('4 questions dans ce chapitre')).toBeInTheDocument();
  // The quiz holds only the 3 auto-gradable questions — the real number.
  expect(screen.getByRole('radio', { name: /Quiz · 3 questions/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Commencer/ })).toBeInTheDocument();
  // No subject/level/unit pickers on the confirmation.
  expect(screen.queryByText('Entraînement et quiz')).not.toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'Matière' })).not.toBeInTheDocument();
  expect(mockTrack).toHaveBeenCalledWith('practice_handoff_opened', expect.objectContaining({ status: 'ok', course: 'CHEM-NSI', unit: 'U1' }));
});

it('labels lesson-origin practice as chapter-wide, never lesson-specific', () => {
  renderAt('/quizzes?course=chem-ns1&unit=U1&lesson=CHEM-NSI-U1-L1&from=lesson');
  expect(screen.getByText(/Mesurer une longueur/)).toBeInTheDocument();
  expect(screen.getByText(/couvrent tout le chapitre/)).toBeInTheDocument();
  expect(screen.queryByText(/questions de la leçon/i)).not.toBeInTheDocument();
});

it('starting from the confirmation opens a finite quiz with its position', () => {
  renderAt('/quizzes?course=chem-ns1&unit=U1&from=lesson');
  fireEvent.click(screen.getByRole('button', { name: /Commencer/ }));
  expect(screen.getByText('Question 1 sur 3')).toBeInTheDocument();
  expect(mockTrack).toHaveBeenCalledWith('practice_started', expect.objectContaining({ mode: 'quiz', course: 'CHEM-NSI', unit: 'U1', source: 'lesson', count: 3 }));
});

it('never claims 0 questions while the bank is loading', () => {
  mockAppData.current = { data: undefined, isLoading: true, isError: false, isFetching: true, refetch: jest.fn() };
  const { container, rerender } = renderAt('/quizzes?course=chem-ns1&unit=U1&from=lesson');
  expect(container.textContent).not.toMatch(/\b0 question/);
  expect(container.textContent).not.toMatch(/Aucun exercice/);
  expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  mockAppData.current = { data: { courses, quizBank }, isLoading: false, isError: false, isFetching: false, refetch: jest.fn() };
  act(() => { rerender(<MemoryRouter initialEntries={['/quizzes?course=chem-ns1&unit=U1&from=lesson']}><Quizzes /></MemoryRouter>); });
  expect(screen.getByText('4 questions dans ce chapitre')).toBeInTheDocument();
});

it('the general hub never flashes "no exercises" before its selection settles', () => {
  const { container } = renderAt('/quizzes');
  expect(container.textContent).not.toMatch(/Aucun exercice disponible/);
  expect(screen.getByText('Entraînement et quiz')).toBeInTheDocument();
});

it('a stale unit is explained and the choice stays with the student', () => {
  renderAt('/quizzes?course=chem-ns1&unit=U9&from=lesson');
  expect(screen.getByText(/Le chapitre demandé n’existe plus dans Chimie NS I/)).toBeInTheDocument();
  // Full selectors remain, and no session started behind the student's back.
  expect(screen.getByText('Entraînement et quiz')).toBeInTheDocument();
  expect(screen.queryByText(/Question 1 sur/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /tout le cours · 4 questions/ })).toBeInTheDocument();
});

it('an empty unit is not silently widened to the rest of the course', () => {
  renderAt('/quizzes?course=chem-ns1&unit=U2&from=lesson');
  expect(screen.getByText(/« L'Atome » n’a pas encore de questions/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Commencer$/ })).not.toBeInTheDocument();
});

it('an unknown course says so', () => {
  renderAt('/quizzes?course=bio-ns9&unit=U1&from=lesson');
  expect(screen.getByText(/ne correspond à aucun cours disponible/)).toBeInTheDocument();
});

it('leaving a started quiz asks first and can show the summary with unanswered questions', () => {
  renderAt('/quizzes?course=chem-ns1&unit=U1&from=lesson');
  fireEvent.click(screen.getByRole('button', { name: /Commencer/ }));
  // Answer the first question right (option A is the key in the fixtures).
  const first = screen.getAllByRole('radio')[0];
  fireEvent.click(first);
  fireEvent.click(screen.getByText('Vérifier'));
  fireEvent.click(screen.getByRole('button', { name: /Quitter/ }));
  expect(screen.getByText('Quitter le quiz ?')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Voir mon bilan maintenant' }));
  expect(screen.getByText('Quiz terminé')).toBeInTheDocument();
  expect(screen.getByText('sans réponse', { selector: 'li' , exact: false })).toBeInTheDocument();
  expect(mockTrack).toHaveBeenCalledWith('practice_completed', expect.objectContaining({ mode: 'quiz', correct: 1, unanswered: 2, incorrect: 0 }));
});
