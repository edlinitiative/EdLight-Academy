import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import QuizResult, { entryStatus, reviewIdsOf, type QuizLogEntry } from '../../../QuizResult';

jest.mock('../../../../utils/shared', () => ({ useKatex: () => true, renderWithKatex: (s: string) => ({ __html: s }) }));
const mockDue = jest.fn((_uid?: string) => Promise.resolve([] as string[]));
// The status read wraps the plain list; a test may resolve a full result instead.
jest.mock('../../../../services/reviewService', () => ({
  loadDueReviewIdsResult: (uid: string) => mockDue(uid).then((r: any) => (Array.isArray(r) ? { status: 'ok', data: r } : r)),
  flushReviewPush: () => Promise.resolve(),
}));
jest.mock('../../../../utils/learningJourney', () => ({ trackJourney: jest.fn() }));
beforeAll(() => { window.scrollTo = jest.fn() as any; });

const tx = (fr: string) => fr;
const item = (id: string, extra: any = {}) => ({ id, kind: 'mcq', stem: `Stem ${id}`, options: ['x', 'y'], correctIndex: 0, correctLabel: 'x', good: '', ...extra });
const deck = [item('a', { good: 'Parce que.' }), item('b'), item('c'), item('d'), item('e')];
const log: QuizLogEntry[] = [
  { tries: 1, solved: true, answers: ['x'] }, // correct
  { tries: 2, solved: true, answers: ['y', 'x'] }, // retry
  { tries: 3, solved: false, answers: ['y', 'y', 'y'] }, // incorrect
  { tries: 1, solved: false, answers: ['libre'], ungraded: true }, // ungraded
  // e: never answered
];

const renderResult = (props: any = {}) => render(
  <MemoryRouter>
    <QuizResult deck={deck} log={log} title="Quiz terminé" context="Chimie" tx={tx} signedIn={false}
      onSignIn={jest.fn()} onReplay={jest.fn()} onChangeUnit={jest.fn()} examHref={null} {...props} />
  </MemoryRouter>,
);

it('keeps every status distinct — unanswered and ungraded are not "incorrect"', () => {
  expect(log.map(entryStatus).concat(entryStatus(undefined))).toEqual(['correct', 'retry', 'incorrect', 'ungraded', 'unanswered']);
  renderResult();
  const statuses = Array.from(document.querySelectorAll('.qr-list .pq-status')).map((el) => el.getAttribute('data-status'));
  expect(statuses).toEqual(['correct', 'retry', 'incorrect', 'ungraded', 'unanswered']);
  expect(screen.getByText('Correct au 2ᵉ essai')).toBeInTheDocument();
  expect(screen.getByText('Sans réponse')).toBeInTheDocument();
  expect(screen.getByText('Non corrigée automatiquement')).toBeInTheDocument();
  // The tally counts one miss, not three.
  expect(screen.getByText('ratée').closest('li')).toHaveTextContent('1 ratée');
  expect(screen.getByText(/ne comptent ni comme justes ni comme fausses/)).toBeInTheDocument();
});

it('shows an honest fallback when no explanation was authored', () => {
  renderResult();
  expect(screen.getAllByText('Pas encore d’explication rédigée pour cette question.').length).toBeGreaterThan(0);
});

it('only retry and incorrect go to Révision', () => {
  expect(reviewIdsOf(deck, log)).toEqual(['b', 'c']);
});

it('signed out: never claims the errors were kept', () => {
  renderResult();
  expect(screen.queryByText(/dans ta/)).not.toBeInTheDocument();
  expect(screen.getByText(/Sans compte, tes erreurs ne sont pas gardées/)).toBeInTheDocument();
});

describe('review confirmation honesty (signed in)', () => {
  it('says pending until the push is acknowledged, then confirmed', async () => {
    let ack: () => void = () => {};
    const flush = jest.fn(() => new Promise<void>((res) => { ack = res; }));
    renderResult({ signedIn: true, uid: 'u1', sessionStart: 1000, confirmFlush: flush });
    expect(flush).toHaveBeenCalledWith(['b', 'c']);
    expect(screen.getByText(/pas encore confirmé/)).toBeInTheDocument();
    expect(screen.queryByText(/sont dans ta/)).not.toBeInTheDocument();
    await act(async () => { ack(); });
    expect(screen.getByText(/2 questions ratées au premier essai sont dans ta/)).toBeInTheDocument();
  });

  it('a rejected push (offline / timeout) is unconfirmed, and "Vérifier à nouveau" flushes again', async () => {
    const flush = jest.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(undefined);
    await act(async () => { renderResult({ signedIn: true, uid: 'u1', sessionStart: 1000, confirmFlush: flush }); });
    expect(screen.getByText(/Pas encore confirmé/)).toBeInTheDocument();
    expect(screen.queryByText(/sont dans ta/)).not.toBeInTheDocument();
    await act(async () => { screen.getByRole('button', { name: 'Vérifier à nouveau' }).click(); });
    expect(flush).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/2 questions ratées au premier essai sont dans ta/)).toBeInTheDocument();
  });

  it('an unreadable review list never reads as "nothing due in this chapter"', async () => {
    mockDue.mockResolvedValueOnce({ status: 'error', data: [], error: new Error('x') } as any);
    const clean = [item('a')];
    await act(async () => {
      render(
        <MemoryRouter>
          <QuizResult deck={clean} log={[{ tries: 1, solved: true, answers: ['x'] }]} title="Quiz terminé" context="" tx={tx}
            signedIn uid="u1" onSignIn={jest.fn()} onReplay={jest.fn()} onChangeUnit={jest.fn()} examHref={null}
            scopeIds={['a', 'z']} />
        </MemoryRouter>,
      );
    });
    expect(screen.queryByText(/Rien à revoir dans ce chapitre/)).not.toBeInTheDocument();
  });
});

it('nothing due: an accurate caught-up line, and the next lesson leads', async () => {
  mockDue.mockResolvedValueOnce([]);
  const clean = [item('a')];
  await act(async () => {
    render(
      <MemoryRouter>
        <QuizResult deck={clean} log={[{ tries: 1, solved: true, answers: ['x'] }]} title="Quiz terminé" context="" tx={tx}
          signedIn uid="u1" onSignIn={jest.fn()} onReplay={jest.fn()} onChangeUnit={jest.fn()} examHref={null}
          scopeIds={['a', 'z']} nextLesson={{ title: 'Les unités', href: '/courses/chem-ns1?lesson=L2' }} />
      </MemoryRouter>,
    );
  });
  expect(screen.getByText(/Rien à revoir dans ce chapitre/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Leçon suivante/ })).toHaveAttribute('href', '/courses/chem-ns1?lesson=L2');
});

it('due questions in the chapter: review is the one primary action, with the topic in the link', async () => {
  mockDue.mockResolvedValueOnce(['z', 'other']);
  await act(async () => {
    render(
      <MemoryRouter>
        <QuizResult deck={[item('a')]} log={[{ tries: 1, solved: true, answers: ['x'] }]} title="Quiz terminé" context="" tx={tx}
          signedIn uid="u1" onSignIn={jest.fn()} onReplay={jest.fn()} onChangeUnit={jest.fn()} examHref={null}
          scopeIds={['a', 'z']} reviewHref="/revision?course=CHEM-NSI&unit=U1&from=result" />
      </MemoryRouter>,
    );
  });
  const link = screen.getByRole('link', { name: 'Réviser mon erreur' });
  expect(link).toHaveAttribute('href', '/revision?course=CHEM-NSI&unit=U1&from=result');
  expect(document.querySelectorAll('.qr-actions .button--primary')).toHaveLength(1);
});

describe('an interrupted quiz', () => {
  const early = [item('a'), item('b'), item('c'), item('d')];
  const earlyLog: QuizLogEntry[] = [{ tries: 1, solved: true, answers: ['x'] }];
  it('is headed as interrupted and leads with what was answered; the score keeps its meaning', () => {
    render(
      <MemoryRouter>
        <QuizResult deck={early} log={earlyLog} title="Quiz interrompu" interrupted context="" tx={tx} signedIn={false}
          onSignIn={jest.fn()} onReplay={jest.fn()} onChangeUnit={jest.fn()} examHref={null} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Quiz interrompu' })).toBeInTheDocument();
    expect(screen.getByText('1 question répondue sur 4')).toBeInTheDocument();
    expect(screen.getByText('1 juste du premier coup')).toBeInTheDocument();
    // No big full-deck fraction leading the page.
    expect(document.querySelector('.qr-score__figure')).toBeNull();
    expect(screen.getByText('sans réponse', { selector: 'li', exact: false })).toHaveTextContent('3 sans réponse');
  });
  it('a completed quiz keeps the big score', () => {
    render(
      <MemoryRouter>
        <QuizResult deck={[item('a')]} log={earlyLog} title="Quiz terminé" context="" tx={tx} signedIn={false}
          onSignIn={jest.fn()} onReplay={jest.fn()} onChangeUnit={jest.fn()} examHref={null} />
      </MemoryRouter>,
    );
    expect(document.querySelector('.qr-score__figure')).toHaveTextContent('1/ 1');
    expect(screen.queryByText(/répondue sur/)).not.toBeInTheDocument();
  });
});
