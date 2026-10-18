/**
 * CourseDetail — `?lesson=` deep links against data that arrives the way it
 * does in the app (audit 2026-10-17, finding #1).
 *
 * The journey suite mocks a course that is already loaded on the first render,
 * which is why it passed while Home's « Reprendre la leçon » landed on the
 * course overview. These tests drive the data hooks from outside the component:
 * nothing at first, then the light catalogue, then the enriched course, each
 * after a real delay — and they render under React.StrictMode, as src/index.tsx
 * does, because the double-run mount effects were half of the bug.
 */
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import '@testing-library/jest-dom';
import CourseDetail from '../CourseDetail';

const lesson = (u: number, l: number, title: string) => ({
  id: `CHEM-NSI-U${u}-L${l}`, title, type: 'video', lesson_no: l,
  videoUrl: `https://www.youtube-nocookie.com/embed/vid${u}${l}`,
});
const units = [
  { id: 'CHEM-NSI-U1', title: 'Grandeurs et Mesures', unit_no: 1, lessons: [lesson(1, 1, 'Masse et Poids'), lesson(1, 2, 'Volume et Mole'), lesson(1, 3, 'Exercices Significatifs')] },
  { id: 'CHEM-NSI-U2', title: 'Structure de la matière', unit_no: 2, lessons: [lesson(2, 1, 'L’atome'), lesson(2, 2, 'Le tableau périodique'), lesson(2, 3, 'Ions et molécules')] },
];
const catalogCourse = { id: 'chem-ns1', code: 'CHEM-NSI', name: 'Chimie NS I', subject: 'CHEM', level: 'NSI', description: '', modules: units };
// The enriched course is a NEW object graph (as the appData transform makes),
// so nothing can rely on the catalogue's identities surviving.
const enrichedCourse = () => JSON.parse(JSON.stringify(catalogCourse));

// ── Data hooks driven from the test ──────────────────────────────────────────
const mockData: { catalog: any[] | undefined; app: any; loading: boolean } = { catalog: undefined, app: undefined, loading: true };
const mockListeners = new Set<() => void>();
const mockUseLive = function useLiveData() {
  const R = require('react');
  const [, bump] = R.useState(0);
  R.useEffect(() => {
    const f = () => bump((n: number) => n + 1);
    mockListeners.add(f);
    return () => { mockListeners.delete(f); };
  }, []);
};
jest.mock('../../hooks/useData', () => ({
  useAppData: () => {
    mockUseLive();
    return { data: mockData.app, isLoading: mockData.loading, isError: false, isFetching: mockData.loading, refetch: jest.fn() };
  },
  useCourses: () => { mockUseLive(); return { data: mockData.catalog }; },
}));
const publish = (patch: Partial<typeof mockData>) => act(async () => {
  Object.assign(mockData, patch);
  mockListeners.forEach((f) => f());
});
const later = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  isAuthenticated: false, enrolledCourses: [], user: null, freeVideoIds: [], hydrated: true,
  recordActivity: jest.fn(), setShowAuthModal: jest.fn(), recordFreeVideoView: jest.fn(), toggleAuthModal: jest.fn(),
};
jest.mock('../../contexts/store', () => {
  const useStore: any = (sel?: (s: any) => any) => (sel ? sel(mockState) : mockState);
  useStore.getState = () => mockState;
  return { __esModule: true, default: useStore, FREE_VIDEO_LIMIT: 99 };
});
jest.mock('../../services/progressTracking', () => ({
  confirmLessonComplete: jest.fn(), trackVideoProgress: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../utils/telemetry', () => ({ trackEvent: jest.fn() }));

let currentSearch = '';
function LocationProbe() {
  currentSearch = useLocation().search;
  return null;
}
function renderAt(lessonId: string) {
  return render(
    <React.StrictMode>
      <MemoryRouter initialEntries={[`/courses/chem-ns1?lesson=${lessonId}`]}>
        <Routes><Route path="/courses/:courseId" element={<><CourseDetail /><LocationProbe /></>} /></Routes>
      </MemoryRouter>
    </React.StrictMode>,
  );
}
const lessonTitle = () => screen.queryByRole('heading', { level: 1 })?.textContent;

beforeAll(() => {
  window.matchMedia = window.matchMedia || ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as any;
  window.scrollTo = () => {};
  Element.prototype.scrollIntoView = () => {};
});
beforeEach(() => {
  Object.assign(mockData, { catalog: undefined, app: undefined, loading: true });
  currentSearch = '';
});

it('opens the linked lesson when the catalogue, then the enriched course, arrive after mount', async () => {
  renderAt('CHEM-NSI-U2-L2');
  expect(lessonTitle()).not.toBe('Le tableau périodique');
  await later(30);
  await publish({ catalog: [catalogCourse] });
  await later(30);
  await publish({ app: { courses: [enrichedCourse()], quizBank: { byUnit: {}, bySubject: {} } }, loading: false });
  expect(lessonTitle()).toBe('Le tableau périodique');
  expect(screen.getByText(/Structure de la matière · Leçon 2 sur 3/)).toBeInTheDocument();
  expect(currentSearch).toBe('?lesson=CHEM-NSI-U2-L2');
});

it('opens the linked lesson when the course is already cached at mount (Home « Reprendre »)', async () => {
  // The audit's path: data cached by the previous screen, StrictMode mount.
  Object.assign(mockData, { catalog: [catalogCourse], app: { courses: [enrichedCourse()], quizBank: { byUnit: {}, bySubject: {} } }, loading: false });
  renderAt('CHEM-NSI-U2-L3');
  await act(async () => { await later(10); });
  expect(lessonTitle()).toBe('Ions et molécules');
  expect(currentSearch).toBe('?lesson=CHEM-NSI-U2-L3');
});

it('opens the last lesson of the first unit with only the catalogue loaded', async () => {
  renderAt('CHEM-NSI-U1-L3');
  await later(20);
  await publish({ catalog: [catalogCourse] });
  expect(lessonTitle()).toBe('Exercices Significatifs');
  // The enriched course arriving later must not move the student elsewhere.
  await later(20);
  await publish({ app: { courses: [enrichedCourse()], quizBank: { byUnit: {}, bySubject: {} } }, loading: false });
  expect(lessonTitle()).toBe('Exercices Significatifs');
  expect(currentSearch).toBe('?lesson=CHEM-NSI-U1-L3');
});

it('a stale id still shows the honest notice once the course arrives, and drops the param', async () => {
  renderAt('CHEM-NSI-U9-L99');
  await later(20);
  await publish({ catalog: [catalogCourse], app: { courses: [enrichedCourse()], quizBank: { byUnit: {}, bySubject: {} } }, loading: false });
  expect(screen.getByText(/Cette leçon n’est plus disponible dans ce cours/)).toBeInTheDocument();
  expect(currentSearch).toBe('');
});

it('a stale id with the course already cached still shows the notice (StrictMode re-run)', async () => {
  Object.assign(mockData, { catalog: [catalogCourse], app: { courses: [enrichedCourse()], quizBank: { byUnit: {}, bySubject: {} } }, loading: false });
  renderAt('CHEM-NSI-U9-L99');
  await act(async () => { await later(10); });
  expect(screen.getByText(/Cette leçon n’est plus disponible dans ce cours/)).toBeInTheDocument();
  expect(currentSearch).toBe('');
});
