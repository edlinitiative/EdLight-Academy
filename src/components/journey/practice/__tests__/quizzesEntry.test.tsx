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
  // An early stop is called what it is, and leads with participation.
  expect(screen.getByRole('heading', { level: 1, name: 'Quiz interrompu' })).toBeInTheDocument();
  expect(screen.queryByText('Quiz terminé')).not.toBeInTheDocument();
  expect(screen.getByText('1 question répondue sur 3')).toBeInTheDocument();
  expect(screen.getByText('1 juste du premier coup')).toBeInTheDocument();
  expect(screen.getByText('sans réponse', { selector: 'li' , exact: false })).toBeInTheDocument();
  expect(mockTrack).toHaveBeenCalledWith('practice_completed', expect.objectContaining({ mode: 'quiz', correct: 1, unanswered: 2, incorrect: 0 }));
});

it('the focused quiz names its subject and chapter, in the heading too', () => {
  renderAt('/quizzes?course=chem-ns1&unit=U1&from=lesson');
  fireEvent.click(screen.getByRole('button', { name: /Commencer/ }));
  const h1 = screen.getByRole('heading', { level: 1 });
  expect(h1).toHaveTextContent('Quiz · Chimie · NS I · Grandeurs et Mesures');
  expect(screen.queryByRole('heading', { name: 'Quiz du programme' })).not.toBeInTheDocument();
});

it('a quiz answered to the end keeps the "terminé" summary and its score', () => {
  renderAt('/quizzes?course=chem-ns1&unit=U1&from=lesson');
  fireEvent.click(screen.getByRole('button', { name: /Commencer/ }));
  for (let i = 0; i < 3; i += 1) {
    // Exhaust or solve each question; whatever happens it resolves in ≤3 tries.
    for (let k = 0; k < 3 && !screen.queryByRole('button', { name: /Question suivante|Voir mon bilan/ }); k += 1) {
      const radios = screen.getAllByRole('radio').filter((r) => !(r as HTMLInputElement).disabled);
      fireEvent.click(radios[k] || radios[0]);
      fireEvent.click(screen.getByText('Vérifier'));
    }
    fireEvent.click(screen.getByRole('button', { name: /Question suivante|Voir mon bilan/ }));
  }
  expect(screen.getByRole('heading', { level: 1, name: 'Quiz terminé' })).toBeInTheDocument();
  expect(screen.getByText('bonnes réponses du premier coup')).toBeInTheDocument();
  expect(screen.queryByText(/répondue sur/)).not.toBeInTheDocument();
});

describe('phone confirmation', () => {
  const realMM = window.matchMedia;
  beforeAll(() => {
    window.matchMedia = ((q: string) => ({
      matches: q.includes('max-width'), media: q, onchange: null,
      addEventListener: jest.fn(), removeEventListener: jest.fn(), addListener: jest.fn(), removeListener: jest.fn(), dispatchEvent: jest.fn(),
    })) as any;
  });
  afterAll(() => { window.matchMedia = realMM; });

  it('puts topic, mode with its real count, three rules and Commencer first; details stay one tap away', () => {
    renderAt('/quizzes?course=chem-ns1&unit=U1&lesson=CHEM-NSI-U1-L1&from=lesson');
    expect(screen.getByRole('heading', { level: 1, name: 'Grandeurs et Mesures' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Quiz · 3 questions' })).toBeInTheDocument();
    const start = screen.getByRole('button', { name: /Commencer/ });
    const toggle = screen.getByRole('button', { name: /Détails/ });
    // Commencer comes before the disclosure in reading order.
    expect(start.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelectorAll('.pe-mode .pe-rules li')).toHaveLength(3);
    // Coverage and saving are there, but closed.
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(/couvrent tout le chapitre/).closest('[hidden]')).not.toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/couvrent tout le chapitre/).closest('[hidden]')).toBeNull();
    expect(screen.getByText(/Sans compte, rien n’est gardé/)).toBeInTheDocument();
    fireEvent.click(start);
    expect(screen.getByText('Question 1 sur 3')).toBeInTheDocument();
  });
});
