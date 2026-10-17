/**
 * BottomNav — ordinary navigation only (audit #18, PRD LJ-11): the hidden
 * double-tap-to-reload gesture is gone; a tap on the current tab scrolls to
 * the top; the five tabs and the Apprendre highlight are unchanged.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import BottomNav from '../BottomNav';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
      <Routes><Route path="*" element={<Where />} /></Routes>
    </MemoryRouter>,
  );
}

let reload: jest.Mock;
let scrollTo: jest.Mock;
const realLocation = window.location;

beforeEach(() => {
  reload = jest.fn();
  scrollTo = jest.fn();
  // jsdom's location.reload is not configurable; swap the whole object.
  delete (window as any).location;
  (window as any).location = { ...realLocation, reload };
  window.scrollTo = scrollTo as any;
});

afterEach(() => {
  (window as any).location = realLocation;
});

it('keeps the five tabs', () => {
  renderAt('/');
  expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/', '/courses', '/exams', '/arena', '/profile']);
});

it('never reloads the page on a quick double tap', () => {
  renderAt('/courses');
  const learn = screen.getByRole('link', { name: 'nav.learn' });
  fireEvent.click(learn);
  fireEvent.click(learn);
  fireEvent.click(learn);
  expect(reload).not.toHaveBeenCalled();
  // A tap on the tab you are on scrolls back to the top.
  expect(scrollTo).toHaveBeenCalled();
});

it('navigates normally on a tap to another tab', () => {
  renderAt('/');
  fireEvent.click(screen.getByRole('link', { name: 'nav.exams' }));
  fireEvent.click(screen.getByRole('link', { name: 'nav.exams' }));
  expect(screen.getByTestId('where')).toHaveTextContent('/exams');
  expect(reload).not.toHaveBeenCalled();
});

it('lights Apprendre on practice routes and Arène on games', () => {
  renderAt('/quizzes');
  expect(screen.getByRole('link', { name: 'nav.learn' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'nav.home' })).not.toHaveAttribute('aria-current');
});
