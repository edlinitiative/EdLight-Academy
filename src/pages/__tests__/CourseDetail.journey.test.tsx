/**
 * CourseDetail — the lesson workspace as a student meets it (PRD LJ-04/05/06).
 * Data hooks, the store and Firestore are mocked; the page, the completion
 * hook, the action, the panel and the outline are the real ones.
 */
import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '@testing-library/jest-dom';
import CourseDetail from '../CourseDetail';

const mockCourse = {
  id: 'math-ns1',
  code: 'MATH-NSI',
  name: 'Mathématiques NS1',
  subject: 'MATH',
  level: 'NSI',
  description: 'Cours complet.',
  modules: [
    {
      id: 'MATH-NSI-U1', title: 'Nombres', unit_no: 1,
      lessons: [
        { id: 'MATH-NSI-U1-L1', title: 'Règles de Calcul', type: 'video', lesson_no: 1, videoUrl: 'https://www.youtube-nocookie.com/embed/4IDBpPt0DMQ' },
        { id: 'MATH-NSI-U1-L2', title: 'Puissance d’un Nombre', type: 'video', lesson_no: 2, videoUrl: 'https://www.youtube-nocookie.com/embed/WYh0gGdcK5A' },
      ],
    },
  ],
};
const mockQuizBank = { byUnit: { 'MATH-NSI|U1': Array.from({ length: 25 }, (_, i) => ({ id: `q${i}`, Subchapter_Number: i < 5 ? 2 : 1 })) }, bySubject: {} };

jest.mock('../../hooks/useData', () => ({
  useAppData: () => ({ data: { courses: [mockCourse], quizBank: mockQuizBank }, isLoading: false, isError: false, isFetching: false, refetch: jest.fn() }),
  useCourses: () => ({ data: [mockCourse] }),
}));
jest.mock('../../hooks/useProgress', () => ({ useCourseProgress: () => ({ progress: { completedLessons: [] } }) }));
jest.mock('../../hooks/useMastery', () => ({ useCourseMastery: () => ({ mastery: {}, refresh: jest.fn() }) }));
jest.mock('../../hooks/useFocusMode', () => ({ useFocusMode: () => {} }));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: jest.fn() }) }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, d?: any, o?: any) => (typeof d === 'string' ? d : d?.defaultValue ?? o?.defaultValue ?? k),
    i18n: { language: 'fr' },
  }),
}));
jest.mock('../../components/SandraWidget', () => ({
  useAskSandra: () => ({ available: false, reason: '', ask: jest.fn() }),
  SandraFocusPanel: () => null,
}));
jest.mock('../../components/CourseInstructors', () => () => null);
jest.mock('../../utils/lazyWithRetry', () => ({ lazyWithRetry: () => () => null }));

const mockState: any = {
  isAuthenticated: true,
  enrolledCourses: [{ id: 'math-ns1' }],
  user: { uid: 'student-1' },
  freeVideoIds: [],
  hydrated: true,
  recordActivity: jest.fn(),
  setShowAuthModal: jest.fn(),
  recordFreeVideoView: jest.fn(),
  toggleAuthModal: jest.fn(),
};
jest.mock('../../contexts/store', () => {
  const useStore: any = (sel?: (s: any) => any) => (sel ? sel(mockState) : mockState);
  useStore.getState = () => mockState;
  return { __esModule: true, default: useStore, FREE_VIDEO_LIMIT: 3 };
});

const mockConfirm = jest.fn();
jest.mock('../../services/progressTracking', () => ({
  confirmLessonComplete: (...a: unknown[]) => mockConfirm(...a),
  trackVideoProgress: jest.fn(() => Promise.resolve()),
}));
const mockTrack = jest.fn();
jest.mock('../../utils/telemetry', () => ({ trackEvent: (...a: unknown[]) => mockTrack(...a) }));

function renderLesson(lesson = 'MATH-NSI-U1-L2') {
  return render(
    <MemoryRouter initialEntries={[`/courses/math-ns1?lesson=${lesson}`]}>
      <Routes><Route path="/courses/:courseId" element={<CourseDetail />} /></Routes>
    </MemoryRouter>,
  );
}

const flush = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });

beforeAll(() => {
  window.matchMedia = window.matchMedia || ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as any;
  window.scrollTo = () => {};
  Element.prototype.scrollIntoView = () => {};
});
beforeEach(() => {
  mockConfirm.mockReset();
  mockTrack.mockClear();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

it('a deep link opens the lesson directly, title and unit BEFORE the player', async () => {
  renderLesson();
  await flush();
  const title = screen.getByRole('heading', { level: 1, name: 'Puissance d’un Nombre' });
  const player = screen.getByRole('button', { name: /Lancer la vidéo : Puissance d’un Nombre/ });
  const unit = screen.getByText(/Nombres · Leçon 2 sur 2/);
  // DOCUMENT_POSITION_FOLLOWING: the player comes after the title and unit.
  expect(title.compareDocumentPosition(player) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(unit.compareDocumentPosition(player) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByRole('button', { name: /Retour au cours/ })).toBeInTheDocument();
  expect(mockTrack).toHaveBeenCalledWith('lesson_resume_resolved', expect.objectContaining({ source: 'link', outcome: 'opened', lesson_id: 'MATH-NSI-U1-L2' }));
});

it('the outline marks the current lesson with words, not colour alone', async () => {
  renderLesson();
  await flush();
  const outline = document.getElementById('lesson-outline') as HTMLElement;
  const current = within(outline).getByRole('button', { name: /Leçon en cours/ });
  expect(current).toHaveAttribute('aria-current', 'step');
  expect(current).toHaveTextContent('Puissance d’un Nombre');
});

it('confirmed completion: "Terminée", then chapter practice with the real count and the exact handoff', async () => {
  mockConfirm.mockResolvedValue('saved');
  renderLesson();
  await flush();
  const btn = screen.getByRole('button', { name: 'Terminer la leçon' });
  fireEvent.click(btn);
  fireEvent.click(btn);
  await flush();
  expect(mockConfirm).toHaveBeenCalledTimes(1);
  expect(mockConfirm).toHaveBeenCalledWith('student-1', 'math-ns1', 'MATH-NSI-U1-L2');
  expect(screen.getByText('Terminée')).toBeInTheDocument();
  const link = screen.getByRole('link', { name: 'Pratiquer ce chapitre · 25 questions' });
  expect(link).toHaveAttribute('href', '/quizzes?course=MATH-NSI&unit=U1&lesson=MATH-NSI-U1-L2&mode=quiz&from=lesson');
  expect(screen.getByText('Questions de tout le chapitre « Nombres ».')).toBeInTheDocument();
  expect(mockTrack.mock.calls.filter(([n]) => n === 'lesson_completion_confirmed')).toHaveLength(1);
});

it('offline: the save is queued and pending — no celebration, no practice offer', async () => {
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
  mockConfirm.mockImplementation(() => new Promise(() => {}));
  renderLesson();
  await flush();
  fireEvent.click(screen.getByRole('button', { name: 'Terminer la leçon' }));
  await flush();
  expect(screen.getByRole('button', { name: /En attente de connexion/ })).toBeDisabled();
  expect(screen.getByText(/pas encore confirmé/)).toBeInTheDocument();
  expect(screen.queryByText('Terminée')).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Pratiquer ce chapitre/ })).not.toBeInTheDocument();
});

it('a failed save keeps the action, says so beside it, and never celebrates', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockConfirm.mockRejectedValue(new Error('lesson-completion/no-progress-document'));
  renderLesson();
  await flush();
  fireEvent.click(screen.getByRole('button', { name: 'Terminer la leçon' }));
  await flush();
  expect(screen.getByRole('button', { name: /Réessayer d’enregistrer/ })).toBeEnabled();
  expect(screen.getByText(/Nous n’avons pas pu enregistrer/)).toBeInTheDocument();
  expect(screen.queryByText('Terminée')).not.toBeInTheDocument();
  expect(mockTrack).toHaveBeenCalledWith('learning_save_failed', expect.objectContaining({ surface: 'lesson_completion' }));
});

it('in-page exercises are called lesson-specific only when the bank tags this lesson', async () => {
  renderLesson('MATH-NSI-U1-L2');
  await flush();
  expect(screen.getByRole('heading', { name: 'S’exercer sur cette leçon' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Exercices de la leçon · 5' })).toBeInTheDocument();
});
