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

/*
 * Layout guard (owner, PWA: "the bottom bar is weird? it fills half the
 * space"). The bar went from seven tabs to five but its grid kept
 * `repeat(7, 1fr)`, so the five tabs crowded the left 5/7 of the bar.
 * jsdom cannot measure layout, so these read the shipped CSS rules instead
 * (Playwright measurements live in the fix's report).
 */
describe('bottom bar CSS', () => {
  const fs = require('fs');
  const path = require('path');
  const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8') as string;
  const sheets = ['mobile-premium.css', 'index.css', 'styles/arenaNight.css'].map(read);

  // Every declaration block whose selector targets the bar itself or its inner grid.
  const barBlocks = (selector: RegExp) =>
    sheets.flatMap((css) =>
      [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(([, sel]) => selector.test(sel))
        .map(([, , body]) => body),
    );

  it('sizes the grid by the tabs it holds, never a stale fixed count', () => {
    renderAt('/');
    const tabCount = screen.getAllByRole('link').length;
    const inner = barBlocks(/\.bottom-nav__inner(?![\w-])/);
    expect(inner.length).toBeGreaterThan(0);
    for (const body of inner) {
      const m = body.match(/grid-template-columns:\s*repeat\((\d+)/);
      if (m) expect(Number(m[1])).toBe(tabCount);
    }
    expect(inner.join('\n')).toMatch(/grid-auto-columns:\s*minmax\(0,\s*1fr\)/);
  });

  it('never gives the bar a viewport- or percent-based height', () => {
    const bodies = barBlocks(/\.bottom-nav(__inner)?(?![\w-])/).join('\n');
    expect(bodies).not.toMatch(/(^|[\s;])(min-|max-)?height:[^;]*(vh|dvh|svh|lvh|%)/);
    expect(bodies).not.toMatch(/(^|[\s;])top:\s*0/);
  });

  it('holds only its tabs — banners and widgets render outside it', () => {
    const { container } = renderAt('/');
    const nav = container.querySelector('nav.bottom-nav')!;
    expect(nav.children).toHaveLength(1);
    expect(nav.querySelectorAll('[role="status"], [role="alert"], .network-banner, .sandra-widget')).toHaveLength(0);
    expect([...nav.firstElementChild!.children].every((c) => c.tagName === 'A')).toBe(true);
  });
});
