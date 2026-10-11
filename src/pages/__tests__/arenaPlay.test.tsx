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
let mockLive: any = null;
let mockRegistration: any = null;
const mockSubmit = jest.fn(async () => ({ ok: true }));
const mockPresent = jest.fn(async () => ({ ok: true, counts: { registered: 2, present: 1, needed: 0, qualified: true } }));

jest.mock('../../services/arenaWebService', () => ({
  subscribeTournament: (_tid: string, cb: any) => { cb(mockTournament); return () => {}; },
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
  expect(await screen.findByText(/Réponse enregistrée/)).toBeTruthy();

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
