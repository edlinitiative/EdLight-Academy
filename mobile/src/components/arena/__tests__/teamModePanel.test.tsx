/** Native shared-answer / relay panel: server-driven controls and foreground resync. */
import React from 'react';
import { AppState } from 'react-native';
import { ArenaButton } from '../ArenaKit';

jest.setTimeout(20000);

interface TestNode {
  props: Record<string, any>;
  findAllByType(type: unknown): TestNode[];
}
const renderer: { create(element: React.ReactElement): { root: TestNode; unmount(): void } } =
  require('react-test-renderer');
const { act }: { act(callback: () => unknown): any } = require('react-test-renderer');

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
const mockApi = {
  state: jest.fn(),
  liveAnswer: jest.fn(),
  start: jest.fn(),
  answer: jest.fn(),
  transfer: jest.fn(),
  claim: jest.fn(),
};
jest.mock('../../../services/tournoisService', () => ({
  get teamApi() {
    return mockApi;
  },
  errorMessage: (code: string) => `err:${code}`,
}));
import TeamModePanel from '../TeamModePanel';

const tournament: any = { id: 't1', format: 'window', gameMode: 'relay', state: 'running', questionCount: 6 };
const roster: any = [
  { uid: 'a', displayName: 'Ana' },
  { uid: 'b', displayName: 'Ben' },
  { uid: 'c', displayName: 'Cléa' },
];
const legs = [
  { owner: 'a', start: 0, end: 2, openedAt: 1, startedAt: 0, endedAt: 0, forfeited: false, startBy: Date.now() + 600_000 },
  { owner: 'b', start: 2, end: 4, openedAt: 0, startedAt: 0, endedAt: 0, forfeited: false, startBy: null },
  { owner: 'c', start: 4, end: 6, openedAt: 0, startedAt: 0, endedAt: 0, forfeited: false, startBy: null },
];
const view = {
  ok: true,
  data: {
    mode: 'relay', policy: 'relay-slots-v1', entryId: 'team', label: 'Étoiles', starters: ['a', 'b', 'c'],
    captainUid: 'a', started: true, holderUid: 'a', deputyUid: 'b', authorityVersion: 1, claimableAt: null,
    slots: ['a', 'b', 'c'], dutiesConfirmed: [], rolesVersion: 0, serverNow: Date.now(),
    window: { round: 0, pos: 0, count: 6, question: null, servedAt: null, deadline: null, done: false, begun: true, legs, turnMs: 900_000, opensAt: 1, closesAt: Date.now() + 3_600_000 },
  },
};

async function mount(uid: string) {
  let tree: any;
  await act(async () => {
    tree = renderer.create(
      <TeamModePanel tournament={tournament} live={null} roster={roster} uid={uid} ht={false} nameOf={(v) => v || 'Participant'} />,
    );
  });
  return tree;
}
const labels = (tree: any) => tree.root.findAllByType(ArenaButton).map((b: TestNode) => b.props.label);

beforeEach(() => {
  Object.values(mockApi).forEach((f) => f.mockReset());
  mockApi.state.mockResolvedValue(view);
});

it('offers the relay start only to the leg owner', async () => {
  const owner = await mount('a');
  expect(labels(owner)).toContain('Commencer mon relais');
  owner.unmount();
  const mate = await mount('b');
  expect(labels(mate)).not.toContain('Commencer mon relais');
  expect(labels(mate).some((l: string) => /pause/i.test(l))).toBe(false);
  mate.unmount();
});

it('re-reads the server view when the app returns to the foreground', async () => {
  const listeners: Array<(s: string) => void> = [];
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: (s: string) => void) => {
    listeners.push(fn);
    return { remove: () => undefined };
  }) as any);
  const tree = await mount('b');
  const before = mockApi.state.mock.calls.length;
  await act(async () => {
    listeners.forEach((fn) => fn('active'));
  });
  expect(mockApi.state.mock.calls.length).toBe(before + 1);
  tree.unmount();
  spy.mockRestore();
});
