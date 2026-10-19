/**
 * The one offline / queued / reconnect banner (roadmap §5, PRE-04).
 * The outbox is real (localStorage), so the pending count is the true count.
 */
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import useStore from '../../contexts/store';
import NetworkStatus from '../NetworkStatus';
import { outbox } from '../../services/outboxStore';
import { syncMessage } from '../../../shared/syncStatus';
import { shouldRetryQuery, webQueryDefaults } from '../../utils/queryDefaults';
import { createOutbox, memoryOutboxStorage } from '../../../shared/outbox';
import { fetchWithTimeout, FetchTimeoutError } from '../../../shared/fetchWithTimeout';

const UID = 'student-1';

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
  window.dispatchEvent(new Event(value ? 'online' : 'offline'));
}

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe('NetworkStatus (web)', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    window.localStorage.clear();
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true });
    useStore.setState({ user: { uid: UID } as any, language: 'fr' } as any);
    await outbox.clear(UID);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('is hidden while steadily online', () => {
    render(<NetworkStatus />);
    expect(screen.getByRole('status', { hidden: true })).toHaveAttribute('aria-hidden', 'true');
    expect(document.documentElement.hasAttribute('data-network-banner')).toBe(false);
  });

  it('says what still works when offline, and counts queued writes', async () => {
    render(<NetworkStatus />);
    act(() => setOnline(false));
    expect(screen.getByRole('status')).toHaveTextContent('Hors ligne — le contenu enregistré reste disponible');
    expect(document.documentElement.getAttribute('data-network-banner')).toBe('offline');

    await act(async () => { await outbox.enqueue(UID, { id: 'op-1', kind: 'xp-award', payload: {} }); });
    await flush();
    expect(screen.getByRole('status')).toHaveTextContent("1 action en attente d'envoi");
    await act(async () => { await outbox.enqueue(UID, { id: 'op-2', kind: 'xp-award', payload: {} }); });
    await flush();
    expect(screen.getByRole('status')).toHaveTextContent("2 actions en attente d'envoi");
  });

  it('never counts another account\'s queue', async () => {
    await outbox.enqueue('someone-else', { id: 'x', kind: 'xp-award', payload: {} });
    render(<NetworkStatus />);
    act(() => setOnline(false));
    await flush();
    expect(screen.getByRole('status')).not.toHaveTextContent('attente');
    await outbox.clear('someone-else');
  });

  it('on reconnect: "envoi" while queued, "Tout est synchronisé" only once drained, then hides', async () => {
    await outbox.enqueue(UID, { id: 'op-1', kind: 'xp-award', payload: {} });
    render(<NetworkStatus />);
    await flush();
    act(() => setOnline(false));
    act(() => setOnline(true));
    await flush();
    expect(screen.getByRole('status')).toHaveTextContent('Connexion rétablie · envoi de 1 action');
    expect(screen.getByRole('status')).not.toHaveTextContent('synchronisé');

    // The server acknowledged: the outbox removed the operation.
    await act(async () => { await outbox.remove(UID, 'op-1'); });
    await flush();
    expect(screen.getByRole('status')).toHaveTextContent('Tout est synchronisé ✓');

    act(() => { jest.advanceTimersByTime(3100); });
    expect(screen.getByRole('status', { hidden: true })).toHaveAttribute('aria-hidden', 'true');
  });

  it('reconnect with nothing queued says "mise à jour", not a sync claim', async () => {
    render(<NetworkStatus />);
    act(() => setOnline(false));
    act(() => setOnline(true));
    await flush();
    expect(screen.getByRole('status')).toHaveTextContent('Connexion rétablie · mise à jour');
  });

  it('a write the server keeps refusing does not pin the banner forever', async () => {
    await outbox.enqueue(UID, { id: 'stuck', kind: 'xp-award', payload: {} });
    render(<NetworkStatus />);
    await flush();
    act(() => setOnline(false));
    act(() => setOnline(true));
    await flush();
    act(() => { jest.advanceTimersByTime(12_100); });
    expect(screen.getByRole('status', { hidden: true })).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('syncMessage (shared wording, both apps)', () => {
  it('Kreyòl', () => {
    expect(syncMessage({ phase: 'offline', pending: 3, lang: 'ht' })?.text)
      .toBe('Ou pa sou entènèt — sa ki anrejistre rete disponib · 3 aksyon ap tann pou voye');
  });
  it('nothing to say while online', () => {
    expect(syncMessage({ phase: 'online', pending: 4, lang: 'fr' })).toBeNull();
  });
  it('ignores junk counts', () => {
    expect(syncMessage({ phase: 'offline', pending: Number.NaN, lang: 'fr' })?.text).not.toMatch(/attente/);
  });
});

describe('outbox change notifications', () => {
  it('reports the new length per account on enqueue and removal', async () => {
    const box = createOutbox(memoryOutboxStorage(), { prefix: 't' });
    const seen: Array<[string, number]> = [];
    const off = box.subscribe((uid, n) => seen.push([uid, n]));
    await box.enqueue('a', { id: '1', kind: 'k', payload: {} });
    await box.enqueue('a', { id: '2', kind: 'k', payload: {} });
    await box.remove('a', '1');
    off();
    await box.remove('a', '2');
    expect(seen).toEqual([['a', 1], ['a', 2], ['a', 1]]);
    expect(await box.pendingCount('a')).toBe(0);
  });
});

describe('query defaults: no paused-forever queries offline', () => {
  it('runs once offline and does not retry while offline', () => {
    expect(webQueryDefaults.queries.networkMode).toBe('offlineFirst');
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
    expect(shouldRetryQuery(0)).toBe(false);
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true });
    expect(shouldRetryQuery(0)).toBe(true);
    expect(shouldRetryQuery(3)).toBe(false);
  });
});

describe('fetchWithTimeout', () => {
  it('rejects with FetchTimeoutError instead of hanging', async () => {
    jest.useFakeTimers();
    const never = jest.fn(() => new Promise<Response>(() => undefined));
    const p = fetchWithTimeout('https://x.test/a.json', {}, 1000, never as any);
    jest.advanceTimersByTime(1001);
    await expect(p).rejects.toBeInstanceOf(FetchTimeoutError);
    jest.useRealTimers();
  });
  it('passes the response through when it arrives in time', async () => {
    const ok = { ok: true } as Response;
    await expect(fetchWithTimeout('https://x.test/a.json', {}, 1000, (async () => ok) as any)).resolves.toBe(ok);
  });
});
