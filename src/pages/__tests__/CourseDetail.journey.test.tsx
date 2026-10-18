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
  expect(screen.getByText('La maîtrise se construit avec la pratique.')).toBeInTheDocument();
  // The completion action is gone; the practice card's Start is the next step,
  // with the exact chapter handoff.
  expect(screen.queryByRole('button', { name: 'Terminer la leçon' })).not.toBeInTheDocument();
  const link = screen.getByRole('link', { name: 'Commencer l’exercice' });
  expect(link).toHaveAttribute('href', '/quizzes?course=MATH-NSI&unit=U1&lesson=MATH-NSI-U1-L2&mode=quiz&from=lesson');
  expect(link).toHaveClass('lx-solid');
  fireEvent.click(link);
  expect(mockTrack).toHaveBeenCalledWith('practice_handoff_opened', expect.objectContaining({ source: 'lesson', unit: 'U1', scope: 'unit', count: 25 }));
  expect(mockTrack.mock.calls.filter(([n]) => n === 'lesson_completion_confirmed')).toHaveLength(1);
});

it('one solid button on the lesson: Start; completion and paging are tonal', async () => {
  renderLesson();
  await flush();
  expect(document.querySelectorAll('.lx-solid')).toHaveLength(1);
  expect(screen.getByRole('link', { name: 'Commencer l’exercice' })).toHaveClass('lx-solid');
  expect(screen.getByRole('button', { name: 'Terminer la leçon' })).toHaveClass('lx-tonal');
  expect(document.querySelector('.button--primary')).toBeNull();
  // Paging stays: the previous lesson exists, no next one (last lesson).
  expect(screen.getByRole('button', { name: /Précédente/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Suivante/ })).not.toBeInTheDocument();
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

it('without lesson-tagged questions the card says chapter, never "cette leçon"', async () => {
  renderLesson('MATH-NSI-U1-L1');
  await flush();
  // L1 has 20 tagged rows in the mock; drop the tags to check the chapter wording.
  const rows = mockQuizBank.byUnit['MATH-NSI|U1'];
  const saved = rows.map((r) => r.Subchapter_Number);
  rows.forEach((r) => { r.Subchapter_Number = 9; });
  try {
    const { unmount } = renderLesson('MATH-NSI-U1-L1');
    await flush();
    expect(screen.getAllByRole('heading', { name: 'S’exercer sur ce chapitre' }).length).toBeGreaterThan(0);
    unmount();
  } finally {
    rows.forEach((r, i) => { r.Subchapter_Number = saved[i]; });
  }
});

it('question 1 is live: a real bank question, graded in place', async () => {
  const rows: any[] = mockQuizBank.byUnit['MATH-NSI|U1'];
  rows.unshift({ id: 'live', Subchapter_Number: 2, question: 'Combien font 2 × 3 ?', option_a: '5', option_b: '6', option_c: '8', option_d: '9', correct_option: 'B' });
  try {
    renderLesson();
    await flush();
    expect(screen.getByText('Combien font 2 × 3 ?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '5' }));
    expect(screen.getByText(/c’était « 6 »/)).toBeInTheDocument();
    // Answered: the choices lock; Start is still the way on.
    expect(screen.getByRole('button', { name: '6' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Commencer l’exercice' })).toBeInTheDocument();
  } finally {
    rows.shift();
  }
});

it('hides the generated lesson description, keeps an authored one', async () => {
  const lesson: any = mockCourse.modules[0].lessons[1];
  lesson.description = 'Leçon « Puissance d’un Nombre » du cours de Mathématiques NS1 (EdLight) — chapitre : Nombres.';
  try {
    const { unmount } = renderLesson();
    await flush();
    expect(screen.queryByText(/du cours de Mathématiques NS1/)).not.toBeInTheDocument();
    unmount();
    lesson.description = 'On calcule 2⁵ sans calculatrice.';
    renderLesson();
    await flush();
    expect(screen.getByText('On calcule 2⁵ sans calculatrice.')).toBeInTheDocument();
  } finally {
    delete lesson.description;
  }
});
