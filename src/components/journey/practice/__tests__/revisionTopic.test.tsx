import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../../contexts/store';

jest.mock('../../../../hooks/useData', () => {
  const f = jest.requireActual('./fixtures');
  const value = { data: { courses: f.courses, quizBank: f.quizBank }, isLoading: false };
  return { useAppData: () => value };
});
const mockMap = { current: {} as any };
jest.mock('../../../../services/reviewService', () => ({ loadReviewMap: jest.fn(() => Promise.resolve(mockMap.current)) }));
jest.mock('../../../../services/answerEventsService', () => ({ logAnswerEvent: jest.fn() }));
jest.mock('../../../../utils/shared', () => ({ useKatex: () => true, renderWithKatex: (s: string) => ({ __html: s }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_k: string, d: string) => d, i18n: { language: 'fr' } }) }));
const mockTrack = jest.fn();
jest.mock('../../../../utils/learningJourney', () => ({ trackJourney: (...a: any[]) => mockTrack(...a) }));

// eslint-disable-next-line import/first
import Revision from '../../../../pages/Revision';

const renderAt = async (url: string) => {
  await act(async () => {
    render(<MemoryRouter initialEntries={[url]}><Revision /></MemoryRouter>);
  });
};

beforeEach(() => {
  mockTrack.mockClear();
  useStore.setState({ user: { uid: 'u1' }, language: 'fr' } as any);
});

it('arriving from a result reviews only that topic, and says which', async () => {
  mockMap.current = { r1: { missedAt: 5 }, p1: { missedAt: 6 } };
  await renderAt('/revision?course=CHEM-NSI&unit=U1&from=result');
  expect(screen.getByText('Chimie NS I · Grandeurs et Mesures')).toBeInTheDocument();
  expect(screen.getByText('Question r1 ?')).toBeInTheDocument();
  expect(screen.getByText('1 / 1')).toBeInTheDocument();
  expect(mockTrack).toHaveBeenCalledWith('review_started', expect.objectContaining({ source: 'result', course: 'CHEM-NSI', unit: 'U1', scoped: true, count: 1 }));
});

it('nothing due in the topic: says so and offers the rest explicitly, without swapping', async () => {
  mockMap.current = { p1: { missedAt: 6 } };
  await renderAt('/revision?course=CHEM-NSI&unit=U1&from=result');
  expect(screen.getByText(/Rien à revoir dans ce sujet/)).toBeInTheDocument();
  expect(screen.queryByText('Question p1 ?')).not.toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Réviser les autres chapitres' })); });
  expect(screen.getByText('Question p1 ?')).toBeInTheDocument();
});

it('a key-less question is never put in a review session', async () => {
  mockMap.current = { r9: { missedAt: 9 } };
  await renderAt('/revision');
  expect(screen.getByText('Rien à réviser pour le moment')).toBeInTheDocument();
});
