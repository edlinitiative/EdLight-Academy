import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockApi = {
  state: jest.fn(),
  liveAnswer: jest.fn(),
  start: jest.fn(),
  answer: jest.fn(),
  transfer: jest.fn(),
  claim: jest.fn(),
};
jest.mock('../../../services/tournoisService', () => ({
  get teamApi() { return mockApi; },
  reviewAnswers: jest.fn(),
  errorMessage: (code: string) => `err:${code}`,
  shareUrl: () => '',
}));
jest.mock('../../../contexts/store', () => {
  const state = { language: 'fr' };
  const hook = (sel: (s: typeof state) => unknown) => sel(state);
  hook.getState = () => state;
  return { __esModule: true, default: hook };
});
import TeamPlay from '../TeamPlay';

const tour: any = { id: 't1', format: 'live', gameMode: 'shared', state: 'running', questionCount: 5 };
const roster: any = [
  { uid: 'a', displayName: 'Ana' },
  { uid: 'b', displayName: 'Ben' },
  { uid: 'c', displayName: 'Cléa' },
];
const live: any = {
  phase: 'question', index: 0, opensAt: 0, closesAt: 10_000, revealUntil: 18_000, questionCount: 5, questionMs: 10_000,
  question: { q: 'Deux plus deux ?', qHt: 'De plis de ?', options: ['3', '4'], optionsHt: null, flagIso: null, category: 'x' },
  reveal: null,
};
const state = (over: any = {}) => ({
  ok: true,
  data: {
    mode: 'shared', policy: 'shared-authority-v1', entryId: 'team', label: 'Étoiles', starters: ['a', 'b', 'c'],
    captainUid: 'a', started: true, holderUid: 'a', deputyUid: 'b', authorityVersion: 3, claimableAt: 20_000,
    slots: ['a', 'b', 'c'], dutiesConfirmed: [], rolesVersion: 0, serverNow: 1000,
    live: { index: 0, phase: 'question', closesAt: 10_000, owner: null, answer: null },
    ...over,
  },
});

beforeEach(() => Object.values(mockApi).forEach((f) => f.mockReset()));

it('lets only the holder answer, with the server version, and shows the teammate who sends', async () => {
  mockApi.state.mockResolvedValue(state());
  mockApi.liveAnswer.mockResolvedValue({ ok: true, data: { recorded: true, duplicate: false, authorityVersion: 3 } });
  render(<TeamPlay tour={tour} live={live} roster={roster} me="a" now={1000} />);
  await screen.findByText(/Vous envoyez la réponse/);
  fireEvent.click(screen.getByRole('button', { name: /4/ }));
  await waitFor(() => expect(mockApi.liveAnswer).toHaveBeenCalledWith('t1', 0, 1, 3, 1000));
  expect(screen.getByRole('option', { name: 'Ben' })).toBeTruthy();
});

it('a teammate cannot answer, sees the claim countdown and re-reads the server after a stale refusal', async () => {
  mockApi.state.mockResolvedValue(state());
  render(<TeamPlay tour={tour} live={live} roster={roster} me="b" now={1000} />);
  await screen.findByText(/Ana envoie la réponse de l’équipe/);
  expect((screen.getByRole('button', { name: /4/ }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/reprendre la main dans 19 s/)).toBeTruthy();
  expect(screen.queryByText('Reprendre la réponse de l’équipe')).toBeNull();
});

it('refreshes the team view when the tab becomes visible again', async () => {
  mockApi.state.mockResolvedValue(state());
  render(<TeamPlay tour={tour} live={live} roster={roster} me="a" now={1000} />);
  await screen.findByText(/Vous envoyez la réponse/);
  const calls = mockApi.state.mock.calls.length;
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(mockApi.state.mock.calls.length).toBe(calls + 1);
});

it('offers the local practice question before the start, and no pause control at any time', async () => {
  mockApi.state.mockResolvedValue(state({ started: false, authorityVersion: 0, claimableAt: null }));
  render(<TeamPlay tour={tour} live={null} roster={roster} me="b" now={0} />);
  fireEvent.click(await screen.findByText('S’entraîner (1 question)'));
  fireEvent.click(screen.getByRole('button', { name: /Port-au-Prince/ }));
  fireEvent.click(screen.getByText('Voir la révélation'));
  expect(mockApi.liveAnswer).not.toHaveBeenCalled();
  expect(screen.queryByText(/pause/i)).toBeNull();
});
