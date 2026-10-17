/**
 * SearchOverlay — modal + combobox contract (audit #16) and relevance/state
 * contract (audit #15). The index is mocked; ranking runs for real.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import useStore from '../../../contexts/store';
import SearchOverlay from '..';
import { rankResults } from '../rank';
import type { SearchItem } from '../../../services/searchIndex';

const mockGetIndex = jest.fn();
const mockReset = jest.fn();
jest.mock('../../../services/searchIndex', () => {
  const actual = jest.requireActual('../../../services/searchIndex');
  return {
    ...actual,
    getSearchIndex: (...a: any[]) => mockGetIndex(...a),
    __resetSearchIndex: () => mockReset(),
  };
});

const INDEX: SearchItem[] = [
  { type: 'action', title: 'Créer mon plan d’étude', to: '/study-plan', keywords: 'plan etude revision' },
  { type: 'page', title: 'Révision', to: '/revision', keywords: 'revision revizyon' },
  { type: 'page', title: 'Quiz et exercices', to: '/quizzes', keywords: 'quiz pratique' },
  { type: 'course', title: 'Chimie NS1', subtitle: 'CHEM · NSI', to: '/courses/chem-ns1', keywords: 'CHEM NSI cours' },
  { type: 'course', title: 'Physique NS2', subtitle: 'PHYS · NSII', to: '/courses/phys-ns2', keywords: 'PHYS NSII cours' },
  { type: 'lesson', title: 'Masse Volumique et Molaire', subtitle: 'Chimie NS1 · Grandeurs et Mesures', to: '/courses/chem-ns1?lesson=L3', keywords: 'CHEM NSI revision' },
  { type: 'exam', title: 'Chimie — Bac 2018', subtitle: 'Chimie · Juin 2018', to: '/exams/bac/ex1', keywords: 'examen' },
];

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname}{loc.search}</div>;
}

function renderOverlay() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <button type="button" onClick={() => useStore.getState().setSearchOpen(true)}>open-search</button>
      <Routes><Route path="*" element={<Where />} /></Routes>
      <SearchOverlay />
    </MemoryRouter>,
  );
}

async function openWithTrigger() {
  const trigger = screen.getByRole('button', { name: 'open-search' });
  trigger.focus();
  fireEvent.click(trigger);
  const input = await screen.findByRole('combobox');
  await waitFor(() => expect(screen.queryByText(/Chargement des cours/)).toBeNull());
  return { trigger, input };
}

beforeEach(() => {
  mockGetIndex.mockReset();
  mockReset.mockReset();
  mockGetIndex.mockResolvedValue(INDEX);
  act(() => { useStore.setState({ searchOpen: false, language: 'fr', sandraAsk: null } as any); });
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
});

describe('modal dialog', () => {
  it('focuses the input, makes the background inert, and restores both on close', async () => {
    const { container } = renderOverlay();
    const { trigger, input } = await openWithTrigger();
    expect(screen.getByRole('dialog', { name: 'Recherche' })).toHaveAttribute('aria-modal', 'true');
    expect(document.activeElement).toBe(input);
    // The app (RTL's container) is inert; the dialog itself is not.
    expect(container).toHaveAttribute('inert');
    expect(screen.getByRole('dialog').closest('[inert]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Fermer la recherche' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(container).not.toHaveAttribute('inert');
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on Escape from anywhere inside, and returns focus', async () => {
    renderOverlay();
    const { trigger } = await openWithTrigger();
    const close = screen.getByRole('button', { name: 'Fermer la recherche' });
    close.focus();
    fireEvent.keyDown(close, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps Tab and Shift+Tab inside the dialog', async () => {
    renderOverlay();
    const { input } = await openWithTrigger();
    const dialog = screen.getByRole('dialog');
    const focusables = Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button, input'));
    const last = focusables[focusables.length - 1];
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('pulls stray focus back into the dialog', async () => {
    renderOverlay();
    const { trigger, input } = await openWithTrigger();
    act(() => { trigger.focus(); });
    expect(document.activeElement).toBe(input);
  });
});

describe('combobox', () => {
  it('announces the active option via aria-activedescendant and scrolls it into view', async () => {
    renderOverlay();
    const { input } = await openWithTrigger();
    fireEvent.change(input, { target: { value: 'chimie' } });
    const options = screen.getAllByRole('option');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', options[0].id);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const now = screen.getAllByRole('option');
    expect(input).toHaveAttribute('aria-activedescendant', now[1].id);
    expect(now[1]).toHaveAttribute('aria-selected', 'true');
    expect(now[0]).toHaveAttribute('aria-selected', 'false');
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    // Focus never leaves the input while browsing.
    expect(document.activeElement).toBe(input);
    // Result count is announced politely.
    expect(screen.getByRole('status')).toHaveTextContent(/résultats/);
  });

  it('wraps with ArrowUp onto the Sandra option, and Enter hands the query to Sandra', async () => {
    renderOverlay();
    const { input } = await openWithTrigger();
    fireEvent.change(input, { target: { value: 'chimie' } });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    const sandra = screen.getByRole('option', { name: /Demander à Sandra/ });
    expect(input).toHaveAttribute('aria-activedescendant', sandra.id);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(useStore.getState().sandraAsk).toBe('chimie');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Enter opens the active result', async () => {
    renderOverlay();
    const { input } = await openWithTrigger();
    fireEvent.change(input, { target: { value: 'masse volumique' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('where')).toHaveTextContent('/courses/chem-ns1?lesson=L3');
  });

  it('keeps Cmd/Ctrl+K', async () => {
    renderOverlay();
    act(() => { fireEvent.keyDown(window, { key: 'k', ctrlKey: true }); });
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});

describe('relevance', () => {
  it('puts an exact lesson match in "Meilleurs résultats", ahead of actions and pages', async () => {
    renderOverlay();
    const { input } = await openWithTrigger();
    // The old fixed group order put actions and pages first; an exact lesson
    // title now leads the list.
    fireEvent.change(input, { target: { value: 'Masse volumique et molaire' } });
    const best = screen.getByRole('group', { name: 'Meilleurs résultats' });
    const first = within(best).getAllByRole('option')[0];
    expect(first).toHaveTextContent('Masse Volumique et Molaire');
    expect(first).toHaveTextContent('Chimie NS1 · Grandeurs et Mesures');
    expect(first).toHaveTextContent('Leçon');
    expect(screen.getAllByRole('option')[0]).toBe(first);
  });

  it('shows subject and class on course rows in readable words', async () => {
    renderOverlay();
    const { input } = await openWithTrigger();
    fireEvent.change(input, { target: { value: 'physique' } });
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('Physique · NS2');
  });

  it('never promotes a keyword-only match to best results', () => {
    const groups = rankResults(INDEX, 'revision');
    expect(groups[0].key).not.toBe('best');
    const flatTitles = groups.flatMap((g) => g.rows.map((r) => r.title));
    expect(flatTitles).toContain('Masse Volumique et Molaire');
  });

  it('orders type groups learning-first and does not repeat best results', () => {
    const groups = rankResults(INDEX, 'chimie');
    expect(groups.map((g) => g.key)).toEqual(['best', 'lesson']);
    const all = groups.flatMap((g) => g.rows.map((r) => r.to));
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('states', () => {
  it('says the index is loading (and does not claim "no results" yet)', async () => {
    let resolve: (v: SearchItem[]) => void = () => {};
    mockGetIndex.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderOverlay();
    act(() => { useStore.getState().setSearchOpen(true); });
    const input = await screen.findByRole('combobox');
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.getAllByText(/Chargement des cours, leçons et examens/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Aucun résultat pour/, { selector: '.search-empty__title' })).toBeNull();
    await act(async () => { resolve(INDEX); });
    expect(screen.getByText(/Aucun résultat pour/, { selector: '.search-empty__title' })).toBeInTheDocument();
  });

  it('reports a failed index with a working retry', async () => {
    mockGetIndex.mockResolvedValueOnce(INDEX.filter((i) => i.type !== 'course' && i.type !== 'lesson'));
    renderOverlay();
    await openWithTrigger();
    expect(screen.getAllByText(/n’ont pas pu être chargés/).length).toBeGreaterThan(0);
    expect(mockReset).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Réessayer/ }));
    await waitFor(() => expect(screen.queryByText(/n’ont pas pu être chargés/)).toBeNull());
    expect(mockGetIndex).toHaveBeenCalledTimes(2);
  });

  it('treats a rejected index as failed', async () => {
    mockGetIndex.mockRejectedValueOnce(new Error('offline'));
    renderOverlay();
    fireEvent.click(screen.getByRole('button', { name: 'open-search' }));
    expect(await screen.findByRole('button', { name: /Réessayer/ })).toBeInTheDocument();
  });

  it('offers real suggestions when nothing matches', async () => {
    renderOverlay();
    const { input } = await openWithTrigger();
    fireEvent.change(input, { target: { value: 'xylophone' } });
    expect(screen.getByText(/Aucun résultat pour/, { selector: '.search-empty__title' })).toBeInTheDocument();
    // Subjects that exist in the index — not invented personalisation.
    const chip = screen.getByRole('button', { name: 'Chimie' });
    expect(screen.getByRole('button', { name: 'Physique' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Parcourir tous les cours' })).toHaveAttribute('href', '/courses');
    fireEvent.click(chip);
    expect(input).toHaveValue('Chimie');
    expect(screen.getAllByRole('option').length).toBeGreaterThan(1);
    // The Sandra handoff is still offered.
    fireEvent.change(input, { target: { value: 'xylophone' } });
    expect(screen.getByRole('option', { name: /Demander à Sandra/ })).toBeInTheDocument();
  });

  it('speaks Kreyòl', async () => {
    act(() => { useStore.setState({ language: 'ht' } as any); });
    renderOverlay();
    fireEvent.click(screen.getByRole('button', { name: 'open-search' }));
    const input = await screen.findByRole('combobox', { name: 'Chèche' });
    await waitFor(() => expect(mockGetIndex).toHaveBeenCalledWith('ht'));
    fireEvent.change(input, { target: { value: 'chimie' } });
    expect(screen.getByRole('group', { name: 'Pi bon rezilta yo' })).toBeInTheDocument();
  });
});
