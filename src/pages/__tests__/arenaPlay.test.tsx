/**
 * /arena/jouer/:tid with the four Firestore subscriptions and the two endpoints
 * mocked: the documents a client may read go in, and what the page posts comes
 * back out through the same service the real page calls.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ArenaPlay from '../ArenaPlay';

const mockState: any = {
  user: { uid: 'u1' },
  language: 'fr',
  grade: 'NS3',
  toggleAuthModal: jest.fn(),
  setFocusMode: jest.fn(),
};
jest.mock('../../contexts/store', () => {
  const useStore: any = (sel?: any) => (sel ? sel(mockState) : mockState);
  useStore.getState = () => mockState;
  return { __esModule: true, default: useStore };
});

jest.mock('../../components/arena/ArenaRegisterForm', () => ({
  __esModule: true,
  default: () => <div>register-form</div>,
}));

let mockTournament: any = null;
let mockTournamentCb: any = null;
let mockTournamentErr: any = null;
let mockLive: any = null;
let mockRegistration: any = null;
const mockSubmit = jest.fn(async () => ({ ok: true }));
const mockPresent = jest.fn(async () => ({ ok: true, counts: { registered: 2, present: 1, needed: 0, qualified: true } }));

jest.mock('../../services/arenaWebService', () => ({
  subscribeTournament: (_tid: string, cb: any, onError?: any) => {
    mockTournamentCb = cb; mockTournamentErr = onError; cb(mockTournament); return () => {};
  },
  subscribePlayableTournament: (cb: any) => { cb(null); return () => {}; },
  subscribeLiveQuestion: (_tid: string, _i: number, cb: any) => { cb(mockLive); return () => {}; },
  subscribeRegistration: (_tid: string, _uid: string, cb: any) => { cb(mockRegistration); return () => {}; },
  subscribeStandings: (_tid: string, cb: any) => { cb(null); return () => {}; },
  submitAnswer: (...args: any[]) => (mockSubmit as any)(...args),
  markPresent: (...args: any[]) => (mockPresent as any)(...args),
}));

const now = Date.now();
const tournamentIn = (state: string, extra: any = {}) => ({
  id: 't1', title: 'Arène test', titleHt: 'Arèn tès', state,
  startsAt: now + 60_000, doorsAt: now - 60_000, questionCount: 3, teamSize: 1, minPlayers: 1,
  prizes: [], currentQuestion: null, counts: { schools: 0, players: 0, qualifiedSchools: 0 }, isTest: true,
  ...extra,
});
const openQuestion = {
  index: 0, prompt: 'Combien font $2+2$ ?', promptHt: '', options: ['3', '4', '5', '22'], optionsHt: [],
  opensAt: now, closesAt: now + 20_000, state: 'open', answerIndex: null, category: 'Maths',
};

const renderRoom = () => render(
  <MemoryRouter initialEntries={['/arena/jouer/t1']}>
    <Routes><Route path="/arena/jouer/:tid" element={<ArenaPlay />} /></Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  window.sessionStorage.clear();
  mockTournament = null;
  mockLive = null;
  mockRegistration = { uid: 'u1', schoolKey: 's1', grade: 'NS3', eligible: true };
  mockSubmit.mockClear();
  mockPresent.mockClear();
});

it('offers the registration form to a signed-in student who has not registered', () => {
  mockTournament = tournamentIn('registration');
  mockRegistration = null;
  renderRoom();
  expect(screen.getByText('register-form')).toBeTruthy();
});

it('puts a registered student in the room at doors and announces presence', async () => {
  mockTournament = tournamentIn('doors');
  await act(async () => { renderRoom(); });
  expect(screen.getByText('Tu es dans la salle')).toBeTruthy();
  expect(mockPresent).toHaveBeenCalledWith('t1');
});

it('answers on key "2", locks, and says only that the answer was recorded', async () => {
  mockTournament = tournamentIn('live', { currentQuestion: { index: 0, opensAt: now, closesAt: now + 20_000 } });
  mockLive = openQuestion;
  await act(async () => { renderRoom(); });
  expect(screen.getByText('Question', { exact: false })).toBeTruthy();

  await act(async () => { fireEvent.keyDown(window, { key: '2' }); });
  expect(mockSubmit).toHaveBeenCalledTimes(1);
  const sent = (mockSubmit.mock.calls[0] as any[])[0];
  expect(sent).toMatchObject({ tournamentId: 't1', questionIndex: 0, choice: 1, focusLosses: 0 });
  expect(typeof sent.clientShownAt).toBe('number');
  // Only the server's 200 earns "reçue", with the clock it came back at.
  expect(await screen.findByText(/Réponse reçue ✓ à 00:0\d/)).toBeTruthy();

  // Locked: a second key does nothing.
  await act(async () => { fireEvent.keyDown(window, { key: '3' }); });
  expect(mockSubmit).toHaveBeenCalledTimes(1);
});

it('reveals the key only from a closed question', async () => {
  mockTournament = tournamentIn('live', { currentQuestion: { index: 0, opensAt: now - 30_000, closesAt: now - 10_000 } });
  mockLive = { ...openQuestion, opensAt: now - 30_000, closesAt: now - 10_000, state: 'closed', answerIndex: 1 };
  await act(async () => { renderRoom(); });
  expect(screen.getByText('Pas de réponse pour cette question.')).toBeTruthy();
  const buttons = screen.getAllByRole('button').filter((b) => b.className.includes('arena-play__option'));
  expect(buttons[1].className).toContain('is-correct');
});

// ── Trust layer: connection and receipt states ─────────────────────────────

let onlineFlag = true;
beforeAll(() => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => onlineFlag });
});
afterEach(() => { onlineFlag = true; mockSubmit.mockImplementation(async () => ({ ok: true })); });

const liveRoom = () => {
  mockTournament = tournamentIn('live', { currentQuestion: { index: 0, opensAt: now, closesAt: now + 20_000 } });
  mockLive = { ...openQuestion, opensAt: Date.now(), closesAt: Date.now() + 20_000 };
};

it('says "envoyée", never "reçue", while the answer is in flight', async () => {
  liveRoom();
  mockSubmit.mockImplementation(() => new Promise(() => {}) as any);
  await act(async () => { renderRoom(); });
  await act(async () => { fireEvent.keyDown(window, { key: '2' }); });
  expect(screen.getByText('Réponse envoyée (B)…')).toBeTruthy();
  expect(screen.queryByText(/reçue/)).toBeNull();
});

it('holds an answer that failed offline and resends it when the network returns', async () => {
  liveRoom();
  await act(async () => { renderRoom(); });
  onlineFlag = false;
  await act(async () => { window.dispatchEvent(new Event('offline')); });
  mockSubmit.mockImplementationOnce(async () => ({ ok: false, error: 'offline' }) as any);
  await act(async () => { fireEvent.keyDown(window, { key: '1' }); });
  expect(screen.getByText(/Reconnexion… ta réponse \(A\) est gardée/)).toBeTruthy();
  expect(screen.getAllByText('Reconnexion…').length).toBeGreaterThan(0);
  expect(screen.queryByText(/reçue/)).toBeNull();

  onlineFlag = true;
  await act(async () => { window.dispatchEvent(new Event('online')); });
  expect(mockSubmit).toHaveBeenCalledTimes(2);
  expect((mockSubmit.mock.calls[1] as any[])[0]).toMatchObject({ choice: 0 });
  expect(await screen.findByText(/Réponse reçue ✓/)).toBeTruthy();
});

it('says plainly when the server refused a late answer', async () => {
  liveRoom();
  mockSubmit.mockImplementationOnce(async () => ({ ok: false, error: 'window_closed' }) as any);
  await act(async () => { renderRoom(); });
  await act(async () => { fireEvent.keyDown(window, { key: '3' }); });
  expect(await screen.findByText('Temps écoulé — réponse non comptée')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Renvoyer/ })).toBeNull();
});

it('offers a safe resend when the server errored while online', async () => {
  liveRoom();
  mockSubmit.mockImplementationOnce(async () => ({ ok: false, error: 'http_500' }) as any);
  await act(async () => { renderRoom(); });
  await act(async () => { fireEvent.keyDown(window, { key: '4' }); });
  // One automatic resend happens on its own; it succeeds.
  expect(await screen.findByText(/Réponse reçue ✓/)).toBeTruthy();
  expect(mockSubmit).toHaveBeenCalledTimes(2);
});

it('comes back after a reload to the same locked answer, without a second tap', async () => {
  liveRoom();
  window.sessionStorage.setItem('edlight.arena.tap.t1.0', JSON.stringify({
    choice: 2, shownAt: Date.now(), focusLosses: 0, confirmed: true, ackClock: '00:05', duplicate: false,
  }));
  await act(async () => { renderRoom(); });
  expect(screen.getByText('Réponse reçue ✓ à 00:05')).toBeTruthy();
  await act(async () => { fireEvent.keyDown(window, { key: '1' }); });
  expect(mockSubmit).not.toHaveBeenCalled();
});

it('never calls an unconfirmed answer "Bonne réponse" at the reveal', async () => {
  mockTournament = tournamentIn('live', { currentQuestion: { index: 0, opensAt: now - 30_000, closesAt: now - 10_000 } });
  mockLive = { ...openQuestion, opensAt: now - 30_000, closesAt: now - 10_000, state: 'closed', answerIndex: 1 };
  window.sessionStorage.setItem('edlight.arena.tap.t1.0', JSON.stringify({
    choice: 1, shownAt: now - 29_000, focusLosses: 0, confirmed: false, ackClock: null, duplicate: false,
  }));
  await act(async () => { renderRoom(); });
  expect(screen.getByText('C’était la bonne réponse — mais elle n’a pas été confirmée.')).toBeTruthy();
  expect(screen.queryByText('Bonne réponse.')).toBeNull();
  expect(screen.getByText('Temps écoulé — réponse non confirmée')).toBeTruthy();
  // Closed: no resend is attempted.
  expect(mockSubmit).not.toHaveBeenCalled();
});

it('shows En direct once the heartbeat answers, Reconnexion… when the network drops', async () => {
  mockTournament = tournamentIn('doors');
  await act(async () => { renderRoom(); });
  expect(screen.getByText('En direct')).toBeTruthy();
  onlineFlag = false;
  await act(async () => { window.dispatchEvent(new Event('offline')); });
  expect(screen.getByText('Reconnexion…')).toBeTruthy();
  onlineFlag = true;
  await act(async () => { window.dispatchEvent(new Event('online')); });
  // The re-announce on reconnect is the proof the server is back.
  expect(mockPresent.mock.calls.length).toBeGreaterThanOrEqual(2);
  expect(await screen.findByText('En direct')).toBeTruthy();
});

it('keeps the room on screen when the tournament listener dies mid-night', async () => {
  mockTournament = tournamentIn('doors');
  await act(async () => { renderRoom(); });
  await act(async () => { mockTournamentErr?.(); mockTournamentCb(null); });
  expect(screen.getByText('Tu es dans la salle')).toBeTruthy();
  expect(screen.queryByText('Championnat introuvable')).toBeNull();
  expect(screen.getByText('Reconnexion…')).toBeTruthy();
});

it('labels results provisional with a dispute path, then final without one', async () => {
  mockTournament = tournamentIn('provisional');
  const { unmount } = renderRoom();
  expect(screen.getByText('Résultats provisoires')).toBeTruthy();
  const dispute = screen.getByRole('link', { name: /Contester un résultat/ });
  expect(dispute.getAttribute('href')).toMatch(/^mailto:info@edlight\.org\?subject=/);
  expect(decodeURIComponent(dispute.getAttribute('href') || '')).toContain('t1');
  unmount();
  mockTournament = tournamentIn('final');
  renderRoom();
  expect(screen.getByText('Résultats définitifs')).toBeTruthy();
  expect(screen.queryByRole('link', { name: /Contester un résultat/ })).toBeNull();
});

it('opens the rules as a dialog with the real tiers and closes on Escape', async () => {
  mockTournament = tournamentIn('doors');
  await act(async () => { renderRoom(); });
  fireEvent.click(screen.getByRole('button', { name: 'Règles' }));
  const dialog = screen.getByRole('dialog', { name: 'Règles du championnat' });
  expect(dialog.textContent).toContain('bonne réponse en 12 secondes ou moins');
  expect(dialog.textContent).toContain('qualifiée la première');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
});
