/**
 * Scroll continuity (roadmap §4, CON-10): new pages start at the top, browser
 * Back returns to the place on the previous page, a reload never restores.
 */
import React from 'react';
import { act, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import ScrollToTop, { RESTORE_MAX_MS } from '../ScrollToTop';

let y = 0;
let maxY = 10_000;
let nav: ReturnType<typeof useNavigate>;

function Grab() {
  nav = useNavigate();
  return null;
}

function setup(initial = ['/courses']) {
  return render(
    <MemoryRouter initialEntries={initial}>
      <ScrollToTop />
      <Grab />
      <Routes>
        <Route path="*" element={<div />} />
      </Routes>
    </MemoryRouter>,
  );
}

function userScroll(to: number) {
  y = to;
  window.dispatchEvent(new Event('scroll'));
  // rAF-throttled write
  act(() => { jest.advanceTimersByTime(20); });
}

beforeEach(() => {
  jest.useFakeTimers();
  window.sessionStorage.clear();
  y = 0;
  maxY = 10_000;
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y });
  window.scrollTo = ((_x: number, top: number) => { y = Math.min(top, maxY); }) as any;
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: any) => setTimeout(() => cb(0), 0) as any);
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id: any) => clearTimeout(id));
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('a new page starts at the top', () => {
  setup();
  userScroll(900);
  act(() => nav('/courses/math-ns1'));
  expect(y).toBe(0);
});

it('Back returns to the saved place on the previous page', () => {
  setup();
  userScroll(1200);
  act(() => nav('/courses/math-ns1'));
  expect(y).toBe(0);
  act(() => nav(-1));
  expect(y).toBe(1200);
});

it('keeps re-trying while the previous page grows back (lazy data), within the bound', () => {
  setup();
  userScroll(3000);
  act(() => nav('/exams'));
  maxY = 500; // the list has not loaded yet
  act(() => nav(-1));
  expect(y).toBe(500);
  maxY = 10_000; // data landed
  act(() => { jest.advanceTimersByTime(150); });
  expect(y).toBe(3000);
});

it('gives up when the student scrolls first, and stops after the bound', () => {
  setup();
  userScroll(3000);
  act(() => nav('/exams'));
  maxY = 100;
  act(() => nav(-1));
  window.dispatchEvent(new Event('wheel'));
  maxY = 10_000;
  act(() => { jest.advanceTimersByTime(RESTORE_MAX_MS + 200); });
  expect(y).toBe(100);
});

it('a filter change on the same page does not jump to the top', () => {
  setup();
  userScroll(700);
  act(() => nav('/courses?level=ns2'));
  expect(y).toBe(700);
});

it('the first render (reload / shared link) never restores', () => {
  window.sessionStorage.setItem('edlight:scroll:v1', JSON.stringify({ default: 2000 }));
  y = 2000;
  setup();
  expect(y).toBe(0);
});
