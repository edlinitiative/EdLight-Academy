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
  // The same evidence line as the desktop card, over the real total.
  const facts = screen.getByText('6 terminées sur 33 · 2 maîtrisées');
  expect(review.compareDocumentPosition(facts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'À revoir' }).compareDocumentPosition(screen.getByRole('heading', { name: 'Ta progression' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(course).toBeInTheDocument();
});

test('never invents a count: loading and failure are said as such; nothing due and no evidence show nothing', () => {
  const { rerender } = renderIt({ due: null });
  expect(screen.queryByRole('link', { name: /à revoir/ })).not.toBeInTheDocument();
  expect(screen.getAllByText('Chargement…').length).toBeGreaterThan(0);
  rerender(<MemoryRouter><PhoneGlance due="failed" rows={rows} {...base} /></MemoryRouter>);
  expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  rerender(<MemoryRouter><PhoneGlance due={0} rows={rows} {...base} /></MemoryRouter>);
  expect(screen.queryByRole('heading', { name: 'À revoir' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Ta progression' })).toBeInTheDocument();
  // A new student: no review due, no evidence → no cards of zeroes at all.
  rerender(<MemoryRouter><PhoneGlance due={0} rows={[]} {...base} /></MemoryRouter>);
  expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  expect(screen.queryByText(/0/)).not.toBeInTheDocument();
});
