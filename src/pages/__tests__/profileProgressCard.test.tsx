/**
 * CourseProgressCard (profile) — LJ-10 evidence labels: "Terminée" is the
 * shared completion word (never mastery), with the course's lesson total as
 * the denominator when the catalogue knows it, and one
 * progress_summary_opened event.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CourseProgressCard } from '../Profile';
import { __resetCatalogCache } from '../profile/profileData';

const mockTrack = jest.fn();
jest.mock('../../utils/learningJourney', () => {
  const actual = jest.requireActual('../../utils/learningJourney');
  return { ...actual, trackJourney: (...a: any[]) => mockTrack(...a) };
});
jest.mock('../../components/MySchoolCard', () => () => null);
jest.mock('../../components/ReadinessCard', () => () => null);

beforeEach(() => {
  __resetCatalogCache();
  mockTrack.mockReset();
  (global as any).fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ courses: [{ id: 'chem-ns1', number_of_lessons: 33 }] }),
  });
});

const progress = [
  { courseId: 'chem-ns1', completedLessons: ['a', 'b', 'c'], totalPoints: 40 },
  { courseId: 'phys-ns2', completedLessons: ['a'] },
];

function renderCard(isCreole = false) {
  return render(
    <MemoryRouter>
      <CourseProgressCard allProgress={progress} loading={false} isCreole={isCreole} onExplore={() => {}} />
    </MemoryRouter>,
  );
}

it('uses the completion label with a denominator only where the total is known', async () => {
  renderCard();
  expect(await screen.findByText('3 terminées sur 33')).toBeInTheDocument();
  // No catalogue total for phys-ns2: the count alone, no invented "sur y".
  expect(screen.getByText('1 terminée')).toBeInTheDocument();
  // No practice or chapter test recorded: those facts are left out, never zero-filled.
  expect(document.querySelector('.pr-courses')!.textContent).not.toMatch(/pratiquée|maîtrisée/i);
  // The disclosure carries the shared definitions.
  expect(screen.getByRole('button', { name: 'Que veulent dire ces mots ?' })).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByText(/La maîtrise se construit avec la pratique/)).toBeInTheDocument();
});

it('counts practised and mastered from the mastery map, apart from completion', async () => {
  (global as any).fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ courses: [{ id: 'chem-ns1', number_of_lessons: 3, units: [{ lessons: [{ lessonId: 'a' }, { lessonId: 'b' }, { lessonId: 'c' }] }] }] }),
  });
  render(
    <MemoryRouter>
      <CourseProgressCard
        allProgress={[{ courseId: 'chem-ns1', completedLessons: ['a'] }]}
        loading={false}
        isCreole={false}
        onExplore={() => {}}
        mastery={{ a: { bestPct: 80 }, b: { bestPct: 90, masteredAt: 1 } } as any}
      />
    </MemoryRouter>,
  );
  expect(await screen.findByText('1 terminée sur 3 · 2 pratiquées · 1 maîtrisée')).toBeInTheDocument();
});

it('speaks Kreyòl with the same evidence words', async () => {
  renderCard(true);
  expect(await screen.findByText('3 fini sou 33')).toBeInTheDocument();
  expect(screen.getByText(/Metriz la bati ak pratik/)).toBeInTheDocument();
});

it('tracks progress_summary_opened once', async () => {
  const { rerender } = renderCard();
  await screen.findByText('3 terminées sur 33');
  rerender(
    <MemoryRouter>
      <CourseProgressCard allProgress={progress} loading={false} isCreole={false} onExplore={() => {}} />
    </MemoryRouter>,
  );
  expect(mockTrack).toHaveBeenCalledTimes(1);
  expect(mockTrack).toHaveBeenCalledWith('progress_summary_opened', { surface: 'profile', courses: 2 });
});

it('a failed read says so with a retry — never "Tu n’as pas encore ouvert de cours"', async () => {
  const onRetry = jest.fn();
  render(
    <MemoryRouter>
      <CourseProgressCard allProgress={[]} loading={false} failed onRetry={onRetry} isCreole={false} onExplore={() => {}} />
    </MemoryRouter>,
  );
  expect(screen.getByText(/Tes cours n’ont pas pu se charger/)).toBeInTheDocument();
  expect(screen.queryByText(/pas encore ouvert de cours/)).not.toBeInTheDocument();
  screen.getByRole('button', { name: 'Réessayer' }).click();
  expect(onRetry).toHaveBeenCalled();
});
