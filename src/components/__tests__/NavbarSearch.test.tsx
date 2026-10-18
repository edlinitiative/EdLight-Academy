/**
 * Phones had no visible search trigger (.nav-actions is hidden under 768px).
 * The phone button must open the real SearchOverlay and get focus back when
 * it closes; ⌘K keeps working.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../contexts/store';

jest.mock('../../services/searchIndex', () => {
  const actual = jest.requireActual('../../services/searchIndex');
  return { ...actual, getSearchIndex: () => Promise.resolve([]), __resetSearchIndex: () => {} };
});
jest.mock('../../services/authService', () => ({ logoutUser: jest.fn() }));
jest.mock('../NotificationBell', () => () => null);
jest.mock('../Streak', () => ({ StreakBadge: () => null }));
jest.mock('../Auth', () => ({ UserDropdown: () => null }));

/* eslint-disable import/first */
import { Navbar } from '../Navbar';
import SearchOverlay from '../SearchOverlay';
/* eslint-enable import/first */

beforeEach(() => {
  act(() => { useStore.setState({ searchOpen: false, language: 'fr', isAuthenticated: false, user: null, sandraAsk: null } as any); });
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
});

const renderNav = () => render(
  <MemoryRouter>
    <Navbar />
    <SearchOverlay />
  </MemoryRouter>,
);

it('the phone search button is a labelled button that opens the overlay and gets focus back on close', async () => {
  renderNav();
  const btn = document.querySelector('.nav-search-btn--phone') as HTMLButtonElement;
  expect(btn).not.toBeNull();
  expect(btn.tagName).toBe('BUTTON');
  expect(btn.getAttribute('aria-label')).toBeTruthy();
  // Outside .nav-actions, which phones hide.
  expect(btn.closest('.nav-actions')).toBeNull();

  fireEvent.click(btn);
  const input = await screen.findByRole('combobox');
  await waitFor(() => expect(document.activeElement).toBe(input));

  fireEvent.click(screen.getByRole('button', { name: 'Fermer la recherche' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(btn);
});

it('⌘K still opens search', async () => {
  renderNav();
  fireEvent.keyDown(document, { key: 'k', metaKey: true });
  expect(await screen.findByRole('combobox')).toBeInTheDocument();
});
