import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import useStore from '../../../../contexts/store';
import HomeContinuation from '../HomeContinuation';
import ProgressSummary, { factsLine } from '../ProgressSummary';
import { resolveContinuation, summarizeCourse } from '../homeJourney';

jest.mock('../../../../utils/learningJourney', () => {
  const actual = jest.requireActual('../../../../utils/learningJourney');
  return { ...actual, trackJourney: jest.fn() };
});
// eslint-disable-next-line import/first
import { trackJourney } from '../../../../utils/learningJourney';

// ── A small real-shaped catalogue ────────────────────────────────────────────
const lesson = (id: string, title: string) => ({ id, title, type: 'video', videoUrl: null });
const chem1 = {
  id: 'chem-ns1', subject: 'CHEM', name: 'Chimie NS I',
  modules: [
    { id: 'u1', title: 'Grandeurs et mesures', unit_no: 1, lessons: [lesson('CHEM-NSI-U1-L1', 'La matière'), lesson('CHEM-NSI-U1-L2', 'La masse volumique')] },
    { id: 'u2', title: 'Les solutions', unit_no: 2, lessons: [lesson('CHEM-NSI-U2-L1', 'La concentration molaire')] },
  ],
};
const math2 = {
  id: 'math-ns2', subject: 'MATH', name: 'Mathématiques NS II',
  modules: [{ id: 'm1', title: 'Fonctions', unit_no: 1, lessons: [lesson('MATH-NSII-U1-L1', 'Les fonctions affines')] }],
};
const chem2 = {
  id: 'chem-ns2', subject: 'CHEM', name: 'Chimie NS II',
  modules: [{ id: 'c1', title: 'Atomes', unit_no: 1, lessons: [lesson('CHEM-NSII-U1-L1', 'Le modèle atomique')] }],
};
const courses = [chem1, math2, chem2];
const LV: Record<string, string> = { 'chem-ns1': 'NSI', 'math-ns2': 'NSII', 'chem-ns2': 'NSII' };
const courseLevel = (c: any) => LV[c.id];
const levelLabel = (lv: string) => String(lv).replace(/^NS(.*)$/, 'NS $1');
const subjectName = (code: string) => ({ CHEM: 'Chimie', MATH: 'Mathématiques' } as any)[code] || code;
const L = (fr: string) => fr;
const noPos = () => 0;

const base = { courses, courseLevel, progressByCourseId: new Map(), mastery: {}, readPosition: noPos };

beforeEach(() => {
  (trackJourney as jest.Mock).mockClear();
  useStore.setState({ language: 'fr', user: { uid: 'u1' }, grade: 'NS1', gradeChosen: true, lastActivity: null } as any);
  try { localStorage.clear(); } catch { /* jsdom */ }
});

const inRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);
const continuationProps = {
  loading: false, failed: false, onRetry: jest.fn(), dueCount: 0, grade: 'NS1' as string | null,
  onSkipClass: jest.fn(), subjectName, levelLabel, courseLevel, L,
};

// ── resolveContinuation ─────────────────────────────────────────────────────
describe('resolveContinuation', () => {
  test('a returning student resumes the exact lesson they had open', () => {
    const c = resolveContinuation({
      ...base, grade: 'NS1',
      lastActivity: { type: 'lesson', path: '/courses/chem-ns1?lesson=CHEM-NSI-U1-L2', title: 'Chimie NS I' },
      progressByCourseId: new Map([['chem-ns1', { completedLessons: ['CHEM-NSI-U1-L1'], watchedVideos: { 'CHEM-NSI-U1-L2': {} } }]]),
      readPosition: () => 252,
    });
    expect(c.kind).toBe('lesson');
    if (c.kind !== 'lesson') return;
    expect(c.reason).toBe('resume');
    expect(c.lesson.id).toBe('CHEM-NSI-U1-L2');
    expect(c.evidence).toBe('opened');
    expect(c.positionSec).toBe(252);
  });

  test('a finished lesson is not restarted: the next unfinished one is offered', () => {
    const c = resolveContinuation({
      ...base, grade: 'NS1',
      lastActivity: { type: 'lesson', path: '/courses/chem-ns1?lesson=CHEM-NSI-U1-L2', title: 'x' },
      progressByCourseId: new Map([['chem-ns1', { completedLessons: ['CHEM-NSI-U1-L1', 'CHEM-NSI-U1-L2'] }]]),
    });
    expect(c.kind === 'lesson' && c.reason).toBe('next');
    expect(c.kind === 'lesson' && c.lesson.id).toBe('CHEM-NSI-U2-L1');
  });

  test('an unfinished exam stays the primary continuation', () => {
    const c = resolveContinuation({ ...base, lastActivity: { type: 'exam', path: '/exams/terminale/42/take', title: 'Physique 2024' } });
    expect(c).toEqual({ kind: 'exam', title: 'Physique 2024', path: '/exams/terminale/42/take' });
  });

  test('a stale lesson link is flagged and replaced by the course’s real next lesson', () => {
    const c = resolveContinuation({ ...base, grade: 'NS1', lastActivity: { type: 'lesson', path: '/courses/chem-ns1?lesson=GONE', title: 'x' } });
    expect(c.kind === 'lesson' && c.staleLink).toBe(true);
    expect(c.kind === 'lesson' && c.lesson.id).toBe('CHEM-NSI-U1-L1');
  });

  test('an empty account gets a real first lesson of its own class', () => {
    const c = resolveContinuation({ ...base, grade: 'NS2' });
    expect(c.kind === 'lesson' && c.reason).toBe('start');
    // Subject order puts MATH first at NS II.
    expect(c.kind === 'lesson' && c.lesson.id).toBe('MATH-NSII-U1-L1');
    expect(c.kind === 'lesson' && c.evidence).toBeNull();
  });

  test('an uncovered class is said so, never silently switched', () => {
    expect(resolveContinuation({ ...base, grade: '9e' }).kind).toBe('uncovered');
  });

  test('no class yet → a skippable choice with a real suggestion', () => {
    const c = resolveContinuation({ ...base, grade: null });
    expect(c.kind).toBe('choose-class');
    expect(c.kind === 'choose-class' && c.suggestion?.lesson.id).toBe('CHEM-NSI-U1-L1');
  });

  test('a covered class with nothing published', () => {
    expect(resolveContinuation({ ...base, courses: [chem1], grade: 'NS4' }).kind).toBe('level-empty');
  });
});

// ── HomeContinuation ────────────────────────────────────────────────────────
describe('HomeContinuation', () => {
  test('returning student sees the exact lesson, its context and where the button goes', () => {
    const state = resolveContinuation({
      ...base, grade: 'NS1',
      lastActivity: { type: 'lesson', path: '/courses/chem-ns1?lesson=CHEM-NSI-U2-L1', title: 'x' },
      progressByCourseId: new Map([['chem-ns1', { watchedVideos: { 'CHEM-NSI-U2-L1': {} } }]]),
      readPosition: () => 125,
    });
    inRouter(<HomeContinuation {...continuationProps} state={state} dueCount={3} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/^La concentration molaire$/);
    expect(screen.getByText('Chimie NS I')).toBeInTheDocument();
    expect(screen.getByText('Les solutions')).toBeInTheDocument();
    expect(screen.getByText('Leçon 1 sur 1')).toBeInTheDocument();
    expect(screen.getByText('Commencée')).toBeInTheDocument();
    expect(screen.getByText(/Reprend à 2:05 sur cet appareil/)).toBeInTheDocument();
    // No still for this lesson: the frame draws the subject artwork with its
    // pill — never an empty tinted block (RECHECK 1).
    expect(document.querySelector('.jh-next__media .sf--art')).not.toBeNull();
    expect(document.querySelector('.jh-next__media .sf__pill')).toHaveTextContent('Chimie');
    // Browse lives in the nav now; the card has one solid + one tonal action.
    expect(screen.queryByRole('link', { name: /Parcourir les cours/ })).not.toBeInTheDocument();
    expect(document.querySelectorAll('.jh-btn--solid')).toHaveLength(1);
    const cta = screen.getByRole('link', { name: /Reprendre la leçon/ });
    expect(cta).toHaveAttribute('href', '/courses/chem-ns1?lesson=CHEM-NSI-U2-L1');
    expect(screen.getByRole('link', { name: /3 questions à revoir/ })).toHaveAttribute('href', '/revision');
    cta.click();
    expect(trackJourney).toHaveBeenCalledWith('learning_next_action_selected', expect.objectContaining({ action: 'resume_lesson', lesson_id: 'CHEM-NSI-U2-L1' }));
    expect(trackJourney).toHaveBeenCalledWith('lesson_resume_requested', expect.objectContaining({ course_id: 'chem-ns1', has_position: true }));
  });

  test('empty account sees a real lesson and no invented progress', () => {
    const state = resolveContinuation({ ...base, grade: 'NS2' });
    inRouter(<HomeContinuation {...continuationProps} grade="NS2" state={state} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/^Les fonctions affines$/);
    expect(screen.getByText(/Ta première leçon/)).toBeInTheDocument();
    expect(screen.getByText('Pas encore commencée')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Commencer la leçon/ })).toHaveAttribute('href', '/courses/math-ns2?lesson=MATH-NSII-U1-L1');
    // Nothing claims progress or weakness that does not exist.
    expect(screen.queryByText(/Terminée|Maîtrisée|Pratiquée|à revoir|reprend à/)).not.toBeInTheDocument();
  });

  test('an unsupported class gets the coverage explained and a useful exit', () => {
    inRouter(<HomeContinuation {...continuationProps} grade="9e" state={{ kind: 'uncovered', grade: '9e', staleLink: false }} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Les cours vidéo ne couvrent pas encore ta classe');
    expect(screen.getByText(/de NS I à NS IV/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /épreuves de 9ᵉ AF/ })).toHaveAttribute('href', '/exams/9e');
    expect(screen.getByRole('button', { name: 'Changer de classe' })).toBeInTheDocument();
  });

  test('loading draws a row-shaped skeleton, never an empty state', () => {
    inRouter(<HomeContinuation {...continuationProps} loading state={null} />);
    expect(screen.getByRole('status')).toHaveTextContent('Chargement de ta prochaine leçon');
    expect(screen.queryByText(/Commencer|Aucune/)).not.toBeInTheDocument();
  });
});

// ── Evidence labels (LJ-10) ─────────────────────────────────────────────────
describe('progress evidence', () => {
  test('completion is never labelled mastery', () => {
    const s = summarizeCourse(chem1, { completedLessons: ['CHEM-NSI-U1-L1', 'CHEM-NSI-U1-L2'] }, {});
    expect(s).toMatchObject({ total: 3, completed: 2, practised: 0, mastered: 0 });
    expect(factsLine(s, false)).toBe('2 terminées sur 3');
    expect(factsLine(s, false)).not.toMatch(/maîtris/i);
  });

  test('mastery counts only chapter-test confirmations, from the shared mastery doc', () => {
    const s = summarizeCourse(chem1, { completedLessons: ['CHEM-NSI-U1-L1'] }, {
      'CHEM-NSI-U1-L1': { completed: true, bestPct: 100, masteredAt: 1 },
      'CHEM-NSI-U1-L2': { bestPct: 80 },
    });
    expect(factsLine(s, false)).toBe('1 terminée sur 3 · 2 pratiquées · 1 maîtrisée');
    expect(factsLine(s, true)).toBe('1 fini sou 3 · 2 pratike · 1 metrize');
  });

  test('the summary names scope and denominator, and tracks the explainer once', () => {
    const rows = [{ course: chem1, summary: summarizeCourse(chem1, { completedLessons: ['CHEM-NSI-U1-L1'] }, {}) }];
    inRouter(<ProgressSummary rows={rows} loading={false} failed={false} onRetry={jest.fn()} subjectName={subjectName} levelLabel={levelLabel} courseLevel={courseLevel} L={L} />);
    expect(screen.getByText('Chimie NS I')).toBeInTheDocument();
    expect(screen.getByText('1 terminée sur 3')).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  test('a new student with no evidence gets no progress card, not a card of zeroes', () => {
    const { container } = inRouter(<ProgressSummary rows={[]} loading={false} failed={false} onRetry={jest.fn()} subjectName={subjectName} levelLabel={levelLabel} courseLevel={courseLevel} L={L} />);
    expect(container).toBeEmptyDOMElement();
  });
});

// ── Section isolation (QA-16) ───────────────────────────────────────────────
jest.mock('../../../ExamCountdown', () => ({ __esModule: true, default: () => <div>COUNTDOWN</div> }));
jest.mock('../../../DailyQuests', () => ({ __esModule: true, default: () => <div>QUESTS</div> }));
jest.mock('../../../MySchoolCard', () => ({ __esModule: true, default: () => <div>SCHOOL</div> }));
jest.mock('../../../../hooks/useExamAttempts', () => ({ useExamAttempts: () => ({}) }));
jest.mock('../../../../hooks/useMastery', () => ({ useCourseMastery: () => ({ mastery: {}, loading: false }) }));
jest.mock('../../../../services/userActivity', () => ({
  listRecentExamAttempts: jest.fn(() => Promise.resolve([{ exam_id: '7', status: 'submitted', level: 'Baccalauréat', exam_title: 'Chimie 2023' }])),
}));
jest.mock('../../../../services/reviewService', () => ({
  loadReviewMap: jest.fn(() => Promise.resolve({ q1: { missedAt: 5, subjectCode: 'CHEM-NSI', unitNo: 1 } })),
}));

describe('LearnWorkspace sections', () => {
  test('a catalogue failure keeps exams and review usable', async () => {
    // eslint-disable-next-line global-require
    const LearnWorkspace = require('../../../../pages/courses/LearnWorkspace').default;
    (global as any).fetch = jest.fn(() => Promise.reject(new Error('offline')));
    const onRetry = jest.fn();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <LearnWorkspace
            courses={[]} courseLevel={courseLevel} subjectName={subjectName} levelLabel={levelLabel}
            progressByCourseId={new Map()} SubjectTile={() => null} L={L}
            coursesFailed onRetryCourses={onRetry}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const next = screen.getByRole('heading', { name: 'Tes cours n’ont pas pu se charger' }).closest('section')!;
    within(next).getByRole('button', { name: 'Réessayer' }).click();
    expect(onRetry).toHaveBeenCalled();
    // The other sections still work on their own data.
    // The desktop side card (the phone's PhoneGlance card says the same; CSS
    // shows one or the other).
    const review = document.getElementById('lws-weak')!.closest('section')!;
    await waitFor(() => expect(within(review).getByRole('link', { name: 'Revoir 1 question' })).toHaveAttribute('href', '/revision'));
    await waitFor(() => expect(screen.getByText('Chimie 2023')).toBeInTheDocument());
    expect(screen.getByText('COUNTDOWN')).toBeInTheDocument();
    expect(screen.getByText('SCHOOL')).toBeInTheDocument();
  });

  test('subjects open on a SubjectFrame with evidence and a next step; nothing due hides À revoir', async () => {
    // eslint-disable-next-line global-require
    const LearnWorkspace = require('../../../../pages/courses/LearnWorkspace').default;
    // eslint-disable-next-line global-require
    const { loadReviewMap } = require('../../../../services/reviewService');
    (loadReviewMap as jest.Mock).mockImplementationOnce(() => Promise.resolve({}));
    (global as any).fetch = jest.fn(() => Promise.reject(new Error('offline')));
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <LearnWorkspace
            courses={[chem1]} courseLevel={courseLevel} subjectName={subjectName} levelLabel={levelLabel} myLevel="NSI"
            progressByCourseId={new Map([['chem-ns1', { completedLessons: ['CHEM-NSI-U1-L1'] }]])} L={L}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const card = screen.getByRole('link', { name: /Chimie.*Prochaine étape/ });
    expect(card).toHaveAttribute('href', '/courses/chem-ns1');
    expect(card.querySelector('.sf')).not.toBeNull();
    expect(within(card).getByText('Grandeurs et mesures')).toBeInTheDocument();
    expect(within(card).getByText('1 terminée sur 3')).toBeInTheDocument();
    expect(within(card).getByText(/Continuer/)).toBeInTheDocument();
    // No ring badge, no uppercase eyebrow element left over.
    expect(card.querySelector('.lws-ring, em')).toBeNull();
    await waitFor(() => expect(loadReviewMap).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'À revoir' })).not.toBeInTheDocument());
  });
});
