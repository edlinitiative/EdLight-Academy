import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import QuizResult, { entryStatus, reviewIdsOf, type QuizLogEntry } from '../../../QuizResult';

jest.mock('../../../../utils/shared', () => ({ useKatex: () => true, renderWithKatex: (s: string) => ({ __html: s }) }));
const mockDue = jest.fn((_uid?: string) => Promise.resolve([] as string[]));
jest.mock('../../../../services/reviewService', () => ({ loadDueReviewIds: (uid: string) => mockDue(uid) }));
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
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('says pending until the server copy shows the misses, then confirmed', async () => {
    const since = 1000;
    const read = jest.fn()
      .mockResolvedValueOnce({ map: {}, pending: false }) // push not landed yet
      .mockResolvedValueOnce({ map: { b: { missedAt: 1500 }, c: { missedAt: 1600 } }, pending: false });
    renderResult({ signedIn: true, uid: 'u1', sessionStart: since, confirmRead: read, confirmDelays: [10, 20, 30] });
    expect(screen.getByText(/pas encore confirmé/)).toBeInTheDocument();
    expect(screen.queryByText(/sont dans ta/)).not.toBeInTheDocument();
    await act(async () => { jest.advanceTimersByTime(15); });
    await act(async () => { jest.advanceTimersByTime(15); });
    expect(screen.getByText(/2 questions ratées au premier essai sont dans ta/)).toBeInTheDocument();
  });

  it('an old miss of the same question does not count as this session’s write', async () => {
    const read = jest.fn().mockResolvedValue({ map: { b: { missedAt: 10 }, c: { missedAt: 10 } }, pending: false });
    renderResult({ signedIn: true, uid: 'u1', sessionStart: 1000, confirmRead: read, confirmDelays: [10, 20, 30] });
    for (let i = 0; i < 4; i += 1) { await act(async () => { jest.advanceTimersByTime(15); }); }
    expect(screen.getByText(/Pas encore confirmé/)).toBeInTheDocument();
    expect(screen.queryByText(/sont dans ta/)).not.toBeInTheDocument();
  });

  it('pending local writes are not a confirmation', async () => {
    const read = jest.fn().mockResolvedValue({ map: { b: { missedAt: 1500 }, c: { missedAt: 1600 } }, pending: true });
    renderResult({ signedIn: true, uid: 'u1', sessionStart: 1000, confirmRead: read, confirmDelays: [10, 20] });
    for (let i = 0; i < 3; i += 1) { await act(async () => { jest.advanceTimersByTime(15); }); }
    expect(screen.getByText(/Pas encore confirmé/)).toBeInTheDocument();
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
