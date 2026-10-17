import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import { chapterPractice, lessonQuestionCount } from '../chapterPractice';
import { catalogReturnPath, levelFromCourseId } from '../catalogReturn';
import { useLessonCompletion } from '../useLessonCompletion';
import LessonCompleteAction from '../LessonCompleteAction';
import LessonCompletionPanel from '../LessonCompletionPanel';
import { readPracticeHandoff } from '../../../../utils/learningJourney';

const mockTrack = jest.fn();
jest.mock('../../../../utils/telemetry', () => ({ trackEvent: (...a: unknown[]) => mockTrack(...a) }));

const bank = {
  byUnit: {
    'MATH-NSI|U1': [
      { Subchapter_Number: '1' }, { Subchapter_Number: '2' }, { Subchapter_Number: 2 }, { Subchapter_Number: '' },
    ],
  },
};

describe('chapterPractice', () => {
  it('builds the exact handoff URL from the unit bucket the practice page reads', () => {
    const p = chapterPractice({ quizBank: bank, courseCode: 'MATH-NSI', module: { unit_no: 1 }, lessonId: 'MATH-NSI-U1-L2' });
    expect(p).toEqual({
      status: 'ready',
      unit: 'U1',
      count: 4,
      href: '/quizzes?course=MATH-NSI&unit=U1&lesson=MATH-NSI-U1-L2&mode=quiz&from=lesson',
    });
    // …and practice reads it back unchanged.
    if (p.status !== 'ready') throw new Error('unreachable');
    expect(readPracticeHandoff(new URL(`https://x${p.href}`).searchParams)).toEqual({
      course: 'MATH-NSI', unit: 'U1', lesson: 'MATH-NSI-U1-L2', mode: 'quiz', from: 'lesson',
    });
  });

  it('is "loading" (never 0) until the bank exists, and "none" for an empty unit', () => {
    expect(chapterPractice({ quizBank: undefined, courseCode: 'MATH-NSI', module: { unit_no: 1 } }).status).toBe('loading');
    expect(chapterPractice({ quizBank: bank, courseCode: 'MATH-NSI', module: { unit_no: 7 } })).toEqual({ status: 'none', unit: 'U7' });
    expect(chapterPractice({ quizBank: bank, courseCode: '', module: { unit_no: 1 } }).status).toBe('none');
  });

  it('counts lesson-tagged rows separately from the unit', () => {
    expect(lessonQuestionCount(bank, 'MATH-NSI', { unit_no: 1 }, 2)).toBe(2);
    expect(lessonQuestionCount(bank, 'MATH-NSI', { unit_no: 1 }, 5)).toBe(0);
    expect(lessonQuestionCount(undefined, 'MATH-NSI', { unit_no: 1 }, 2)).toBeNull();
  });
});

describe('catalogReturn', () => {
  it('returns to the catalogue URL handed over, filters intact; never invents filters', () => {
    expect(catalogReturnPath({ from: '/courses?matiere=MATH&niveau=NSI' })).toBe('/courses?matiere=MATH&niveau=NSI');
    expect(catalogReturnPath({ from: 'https://evil.example' })).toBe('/courses');
    expect(catalogReturnPath(null)).toBe('/courses');
    expect(catalogReturnPath(null, levelFromCourseId('econ-ns3'))).toBe('/courses?niveau=NSIII');
    expect(levelFromCourseId('nope')).toBeNull();
  });
});

/** A lesson screen in miniature: the action, and the panel once confirmed. */
function Harness({ save, offline = false, lesson = 'L1' }: { save: any; offline?: boolean; lesson?: string }) {
  const [active, setActive] = useState(lesson);
  const c = useLessonCompletion({ uid: 'u1', courseId: 'math-ns1', offline, save, slowAfterMs: 50 });
  const confirmed = c.confirmedIds.has(active);
  return (
    <MemoryRouter>
      <span data-testid="active">{active}</span>
      <button type="button" onClick={() => setActive('L2')}>go-L2</button>
      {confirmed ? (
        <LessonCompletionPanel
          isCreole={false}
          fresh={c.freshId === active}
          practice={{ status: 'ready', unit: 'U1', count: 12, href: '/quizzes?course=MATH-NSI&unit=U1&lesson=L1&mode=quiz&from=lesson' }}
          courseCode="MATH-NSI"
          courseId="math-ns1"
          lessonId={active}
          unitTitle="Nombres"
          next={{ title: 'Fractions' }}
          onNext={() => {}}
          onOutline={() => {}}
        />
      ) : (
        <LessonCompleteAction entry={c.entryFor(active)} isCreole={false} onComplete={() => c.complete(active)} />
      )}
    </MemoryRouter>
  );
}

function deferred<T = 'saved'>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe('lesson completion', () => {
  beforeEach(() => mockTrack.mockClear());

  it('a duplicate tap cannot submit twice', async () => {
    const d = deferred();
    const save = jest.fn(() => d.promise);
    render(<Harness save={save} />);
    const btn = screen.getByRole('button', { name: 'Terminer la leçon' });
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(screen.getByRole('button', { name: /Enregistrement/ }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Enregistrement/ })).toBeDisabled();
    await act(async () => { d.resolve('saved'); await d.promise; });
    expect(screen.getByText('Terminée')).toBeInTheDocument();
    expect(save).toHaveBeenCalledTimes(1);
    const confirmed = mockTrack.mock.calls.filter(([n]) => n === 'lesson_completion_confirmed');
    expect(confirmed).toHaveLength(1);
  });

  it('queued offline: explicitly pending, no completion acknowledgment', async () => {
    const save = jest.fn(() => new Promise(() => {})); // Firestore holds it
    render(<Harness save={save} offline />);
    fireEvent.click(screen.getByRole('button', { name: 'Terminer la leçon' }));
    await flush();
    expect(screen.getByRole('button', { name: /En attente de connexion/ })).toBeDisabled();
    expect(screen.getByText(/pas encore confirmé/)).toBeInTheDocument();
    expect(screen.queryByText('Terminée')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Pratiquer ce chapitre/ })).not.toBeInTheDocument();
  });

  it('slow: says unconfirmed after the delay, still no celebration', async () => {
    jest.useFakeTimers();
    try {
      render(<Harness save={() => new Promise(() => {})} />);
      fireEvent.click(screen.getByRole('button', { name: 'Terminer la leçon' }));
      act(() => { jest.advanceTimersByTime(60); });
      expect(screen.getByText(/Toujours en cours — pas encore confirmé/)).toBeInTheDocument();
      expect(screen.queryByText('Terminée')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('failed: no celebration, retry beside the action, nothing lost', async () => {
    const save = jest.fn()
      .mockImplementationOnce(() => Promise.reject(new Error('permission-denied')))
      .mockImplementationOnce(() => Promise.resolve('saved'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    render(<Harness save={save} />);
    fireEvent.click(screen.getByRole('button', { name: 'Terminer la leçon' }));
    await flush();
    expect(screen.queryByText('Terminée')).not.toBeInTheDocument();
    expect(screen.getByText(/Nous n’avons pas pu enregistrer/)).toBeInTheDocument();
    expect(mockTrack).toHaveBeenCalledWith('learning_save_failed', expect.objectContaining({ lesson_id: 'L1', reason: 'error' }));
    fireEvent.click(screen.getByRole('button', { name: /Réessayer d’enregistrer/ }));
    await flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Terminée')).toBeInTheDocument();
  });

  it('a late confirmation for one lesson never acknowledges another', async () => {
    const d = deferred();
    render(<Harness save={() => d.promise} />);
    fireEvent.click(screen.getByRole('button', { name: 'Terminer la leçon' }));
    fireEvent.click(screen.getByRole('button', { name: 'go-L2' }));
    expect(screen.getByTestId('active')).toHaveTextContent('L2');
    await act(async () => { d.resolve('saved'); await d.promise; });
    // L2 still offers its own, untouched action.
    expect(screen.getByRole('button', { name: 'Terminer la leçon' })).toBeEnabled();
    expect(screen.queryByText('Terminée')).not.toBeInTheDocument();
  });
});

describe('LessonCompletionPanel', () => {
  const base = {
    isCreole: false, fresh: false, courseCode: 'MATH-NSI', courseId: 'math-ns1', lessonId: 'MATH-NSI-U1-L2',
    unitTitle: 'Nombres', next: { title: 'Fractions' }, onNext: () => {}, onOutline: () => {},
  };
  beforeEach(() => mockTrack.mockClear());

  it('one primary: chapter practice with the real count, labelled unit-wide; next lesson secondary', () => {
    const href = '/quizzes?course=MATH-NSI&unit=U1&lesson=MATH-NSI-U1-L2&mode=quiz&from=lesson';
    render(<MemoryRouter><LessonCompletionPanel {...base} practice={{ status: 'ready', unit: 'U1', count: 25, href }} /></MemoryRouter>);
    const link = screen.getByRole('link', { name: 'Pratiquer ce chapitre · 25 questions' });
    expect(link).toHaveAttribute('href', href);
    expect(link).toHaveClass('button--primary');
    expect(screen.getByRole('button', { name: /Leçon suivante/ })).toHaveClass('button--ghost');
    expect(screen.getByText('Questions de tout le chapitre « Nombres ».')).toBeInTheDocument();
    expect(screen.queryByText(/cette leçon/i)).not.toBeInTheDocument();
    expect(screen.getByText('La maîtrise se construit avec la pratique.')).toBeInTheDocument();
    fireEvent.click(link);
    expect(mockTrack).toHaveBeenCalledWith('practice_handoff_opened', expect.objectContaining({ unit: 'U1', count: 25, scope: 'unit', source: 'lesson_completion' }));
  });

  it('no mapped practice: says so, next lesson becomes the primary', () => {
    render(<MemoryRouter><LessonCompletionPanel {...base} practice={{ status: 'none', unit: 'U4' }} /></MemoryRouter>);
    expect(screen.queryByRole('link', { name: /Pratiquer ce chapitre/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Leçon suivante/ })).toHaveClass('button--primary');
    expect(screen.getByText(/pas encore de questions d’entraînement/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Choisir d’autres exercices' })).toHaveAttribute('href', '/quizzes?course=MATH-NSI&from=lesson');
  });

  it('while the bank loads it never claims "0 questions"', () => {
    render(<MemoryRouter><LessonCompletionPanel {...base} practice={{ status: 'loading' }} /></MemoryRouter>);
    expect(screen.queryByText(/0 question/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Leçon suivante/ })).toBeEnabled();
  });

  it('speaks Kreyòl', () => {
    render(<MemoryRouter><LessonCompletionPanel {...base} isCreole practice={{ status: 'ready', unit: 'U1', count: 3, href: '/q' }} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Pratike chapit sa a · 3 kesyon' })).toBeInTheDocument();
    expect(screen.getByText('Fini')).toBeInTheDocument();
  });
});
