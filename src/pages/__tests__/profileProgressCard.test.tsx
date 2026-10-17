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
  expect(await screen.findByText(/3 \/ 33 leçons terminées/)).toBeInTheDocument();
  // No catalogue total for phys-ns2: the count alone, no invented "/ y".
  expect(screen.getByText('1 leçon terminée')).toBeInTheDocument();
  expect(screen.getByText(/La maîtrise se construit avec la pratique/)).toBeInTheDocument();
  expect(screen.queryByText(/maîtrisée/i)).toBeNull();
});

it('speaks Kreyòl with the same evidence words', async () => {
  renderCard(true);
  expect(await screen.findByText(/3 \/ 33 leson fini/)).toBeInTheDocument();
  expect(screen.getByText(/Metriz la bati ak pratik/)).toBeInTheDocument();
});

it('tracks progress_summary_opened once', async () => {
  const { rerender } = renderCard();
  await screen.findByText(/3 \/ 33/);
  rerender(
    <MemoryRouter>
      <CourseProgressCard allProgress={progress} loading={false} isCreole={false} onExplore={() => {}} />
    </MemoryRouter>,
  );
  expect(mockTrack).toHaveBeenCalledTimes(1);
  expect(mockTrack).toHaveBeenCalledWith('progress_summary_opened', { surface: 'profile', courses: 2 });
});
