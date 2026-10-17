/** PhoneGlance — review and progress right after the continuation on phones (audit #5). */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import PhoneGlance from '../PhoneGlance';

jest.mock('../../../../contexts/store', () => {
  const state = { language: 'fr' };
  const useStore: any = (sel?: (s: any) => any) => (sel ? sel(state) : state);
  return { __esModule: true, default: useStore };
});
jest.mock('../../../../utils/telemetry', () => ({ trackEvent: jest.fn() }));

const L = (fr: string) => fr;
const base = {
  dueFrom: ['Chimie NS I'], onRetryReview: jest.fn(), progressLoading: false, progressFailed: false,
  subjectName: (c: string) => ({ CHEM: 'Chimie' } as any)[c] || c, levelLabel: () => 'NS I', courseLevel: () => 'NSI', L,
};
const rows = [{ course: { id: 'chem-ns1', subject: 'CHEM' }, summary: { courseId: 'chem-ns1', opened: 7, completed: 6, practised: 0, mastered: 2, total: 33 } as any }];
const renderIt = (p: Partial<React.ComponentProps<typeof PhoneGlance>>) => render(
  <MemoryRouter><PhoneGlance due={3} rows={rows} {...base} {...p} /></MemoryRouter>,
);

test('due review first, with the real count and where it comes from; then progress over real totals', () => {
  renderIt({});
  const review = screen.getByRole('link', { name: /3 questions à revoir/ });
  expect(review).toHaveAttribute('href', '/revision');
  expect(review).toHaveTextContent('Chimie NS I');
  const course = screen.getAllByRole('link').find((a) => a.getAttribute('href') === '/courses/chem-ns1');
  expect(screen.getByText('6/33 terminées')).toBeInTheDocument();
  expect(review.compareDocumentPosition(screen.getByText('6/33 terminées')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(course).toBeInTheDocument();
});

test('never invents a count: loading, failure and nothing due are said as such', () => {
  const { rerender } = renderIt({ due: null });
  expect(screen.queryByRole('link', { name: /à revoir/ })).not.toBeInTheDocument();
  expect(screen.getAllByText('Chargement…').length).toBeGreaterThan(0);
  rerender(<MemoryRouter><PhoneGlance due="failed" rows={rows} {...base} /></MemoryRouter>);
  expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  rerender(<MemoryRouter><PhoneGlance due={0} rows={[]} {...base} /></MemoryRouter>);
  expect(screen.getByText('Rien à revoir')).toBeInTheDocument();
  expect(screen.getByText(/dès ta première leçon/)).toBeInTheDocument();
});
