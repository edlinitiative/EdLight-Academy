/**
 * The Arène arcade on the phone (port of web /arena): renders without a crash
 * signed in and out, labels every cabinet, sends each cabinet to a real
 * destination, and holds the city still under Reduce Motion.
 */
import React from 'react';
import { AccessibilityInfo, Text } from 'react-native';

jest.setTimeout(30000);

interface TestNode {
  props: Record<string, any>;
  type: unknown;
  children: Array<TestNode | string>;
  findAll(pred: (n: TestNode) => boolean): TestNode[];
  findAllByType(type: unknown): TestNode[];
}
const renderer: { create(element: React.ReactElement): { root: TestNode; unmount(): void } } =
  require('react-test-renderer');
const { act }: { act(callback: () => unknown): any } = require('react-test-renderer');

const mockWithRepeat = jest.fn((v: unknown) => v);
jest.mock('react-native-reanimated', () => {
  const m = require('react-native-reanimated/mock');
  return { ...m, withRepeat: (...a: unknown[]) => mockWithRepeat(...(a as [unknown])), cancelAnimation: jest.fn() };
});
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
jest.mock('../arenaHaptics', () => {
  const h = { choose: jest.fn(), commit: jest.fn(), confirmed: jest.fn(), correct: jest.fn(), wrong: jest.fn(), celebrate: jest.fn() };
  return { __esModule: true, default: h, arenaHaptics: h, hapticsAllowed: () => false };
});

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn(), canGoBack: () => true }),
  useIsFocused: () => true,
  useRoute: () => ({ params: {} }),
}));

const mockState: any = { language: 'fr', user: null, toggleAuthModal: jest.fn(), grade: null };
jest.mock('../../../contexts/store', () => {
  const useStore: any = (sel: (s: any) => any) => sel(mockState);
  useStore.getState = () => mockState;
  return { __esModule: true, default: useStore };
});

const mockHub: any = { status: 'ready', stale: false, primary: { kind: 'none' }, watchable: null, lastFinished: null, retry: jest.fn() };
jest.mock('../../../hooks/useArena', () => ({
  useArenaHub: () => mockHub,
  useNow: () => Date.now(),
}));
const mockTrivia: any = { profile: null, level: { level: 1, xp: 0 } };
jest.mock('../../../hooks/useTrivia', () => ({ useTrivia: () => mockTrivia }));
jest.mock('../../../hooks/useMyAvatar', () => ({ useMyAvatar: () => ({ avatar: null, loading: false }) }));

const mockMember = (uid: string, xp: number) => ({ uid, xp });
const mockKey = (label: string): string => jest.requireActual('../../../../../shared/leaderboardAgg').normalizeName(label);
const mockSchool = (label: string, xps: number[]) => ({
  key: mockKey(label), label, members: xps.length, topMembers: xps.map((xp, i) => mockMember(`${label}-${i}`, xp)),
});
const mockGroupsAll = [
  mockSchool('Lycée Pétion', [900, 899, 898, 897, 896]),
  mockSchool('Collège Saint-Pierre', [700, 699, 698, 697, 696]),
  mockSchool('Institution Saint-Louis', [500, 499, 498, 497, 496]),
  mockSchool('Lycée de Jacmel', [300, 299, 298, 297, 296]),
  mockSchool('École Espoir', [120, 80]),
];
jest.mock('../../../hooks/useLeaderboard', () => ({
  useCollectives: () => ({ groups: mockGroupsAll, isLoading: false }),
  useLeaderboard: () => ({
    entries: [
      { id: 'x1', rank: 1, xp: 400, displayName: 'Ana', school: 'École Espoir' },
      { id: 'me', rank: 2, xp: 120, displayName: 'Moi', school: 'École Espoir' },
    ],
    myEntry: { id: 'me', rank: 2, xp: 120, displayName: 'Moi', school: 'École Espoir' },
    myRank: 2,
  }),
}));
jest.mock('../../../services/arenaService', () => ({ formatCountdown: () => '' }));
jest.mock('../../../services/notificationService', () => ({
  askForNotifications: jest.fn(() => Promise.resolve('granted')),
  getNotificationPermissionAction: jest.fn(() => Promise.resolve('granted')),
}));

import ArenaArcade from '../ArenaArcade';
import { __resetReduceMotionForTests } from '../../../utils/motion';
import { __resetStoryProgressForTests } from '../../../hooks/useStoryProgress';

const textOf = (root: TestNode) => {
  const gather = (n: TestNode | string): string => (typeof n === 'string' ? n : (n.children || []).map(gather).join(''));
  return root.findAll((n) => n.type === Text).map(gather).join(' | ');
};
const byTestId = (root: TestNode, id: string) => root.findAll((n) => n.props?.testID === id && typeof n.type !== 'string');

async function render(props: Partial<React.ComponentProps<typeof ArenaArcade>> = {}) {
  const handlers = { onPractice: jest.fn(), onDuel: jest.fn(), onMiniGames: jest.fn(), ...props };
  let tree: any;
  await act(async () => {
    tree = renderer.create(<ArenaArcade {...(handlers as any)} />);
  });
  await act(async () => { await Promise.resolve(); });
  return { tree, root: tree.root as TestNode, handlers };
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetReduceMotionForTests();
  __resetStoryProgressForTests();
  mockState.user = null;
  mockTrivia.profile = null;
  mockHub.primary = { kind: 'none' };
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});

describe('ArenaArcade', () => {
  it('renders the city, every cabinet and the podium for a guest', async () => {
    const { root, tree } = await render();
    const text = textOf(root);
    for (const label of ['Mode Histoire', 'Défi d’un ami', 'Partie rapide', 'Tournoi privé', 'Mini-jeux', 'Classement', 'Championnat']) {
      expect(text).toContain(label);
    }
    expect(text).toContain('Connecte-toi pour que tes points comptent');
    expect(text).toContain('Les écoles en tête');
    // Real board: four qualified schools → podium + one more, Espoir still forming.
    expect(text).toContain('En formation');
    expect(text).toContain('École Espoir');
    // Every cabinet is a labelled button.
    for (const key of ['story', 'duel', 'quick', 'room', 'mini', 'board']) {
      const [cab] = byTestId(root, `cabinet-${key}`);
      expect(cab).toBeTruthy();
      expect(cab.props.accessibilityRole).toBe('button');
      expect(String(cab.props.accessibilityLabel).length).toBeGreaterThan(5);
    }
    tree.unmount();
  });

  it('signed in: lights the student’s school, shows its place and the rival', async () => {
    mockState.user = { uid: 'me' };
    mockTrivia.profile = { leaderboard: { school: 'École Espoir', displayName: 'Moi' } };
    const { root, tree } = await render();
    const text = textOf(root);
    expect(text).toContain('Moi');
    expect(text).toContain('2/5 joueurs · il en manque 3');
    expect(text).toContain('Ton rival dans ton école : Ana, 280 XP devant toi.');
    // The school joins the street even though it is not in the top.
    expect(byTestId(root, 'city-beacon').length).toBeGreaterThan(0);
    tree.unmount();
  });

  it('sends each cabinet to a real destination', async () => {
    const { root, tree, handlers } = await render();
    const press = (key: string) => act(() => { byTestId(root, `cabinet-${key}`)[0].props.onPress(); });
    await press('story');
    expect(mockNavigate).toHaveBeenLastCalledWith('ArenaStory', undefined);
    await press('room');
    expect(mockNavigate).toHaveBeenLastCalledWith('Tournois', undefined);
    await press('board');
    expect(mockNavigate).toHaveBeenLastCalledWith('Leaderboard', undefined);
    await press('duel');
    expect(handlers.onDuel).toHaveBeenCalledTimes(1);
    await press('quick');
    expect(handlers.onPractice).toHaveBeenCalledTimes(1);
    await press('mini');
    expect(handlers.onMiniGames).toHaveBeenCalledTimes(1);
    tree.unmount();
  });

  it('animates the city when motion is allowed', async () => {
    const { tree } = await render();
    expect(mockWithRepeat).toHaveBeenCalled();
    tree.unmount();
  });

  it('holds the city completely still under Reduce Motion', async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true);
    const { tree } = await render();
    await act(async () => { await Promise.resolve(); });
    mockWithRepeat.mockClear();
    // Re-render with the settled value: nothing loops.
    tree.unmount();
    const again = await render();
    expect(mockWithRepeat).not.toHaveBeenCalled();
    const stars = byTestId(again.root, 'city-stars')[0];
    const style = ([] as any[]).concat(stars.props.style).filter(Boolean);
    expect(style.every((s) => !('opacity' in s))).toBe(true);
    again.tree.unmount();
  });
});
