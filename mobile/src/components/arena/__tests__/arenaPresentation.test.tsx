/** Competition motion + cues on the phone (roadmap P2), and the room's board. */
import React from 'react';
import { AccessibilityInfo, Text } from 'react-native';

jest.setTimeout(20000);

interface TestNode {
  props: Record<string, any>;
  type: unknown;
  children: Array<TestNode | string>;
  findAll(pred: (n: TestNode) => boolean): TestNode[];
  findAllByType(type: unknown): TestNode[];
}
const renderer: { create(element: React.ReactElement): { root: TestNode; update(e: React.ReactElement): void; unmount(): void } } =
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
jest.mock('../arenaHaptics', () => {
  const h = { choose: jest.fn(), commit: jest.fn(), confirmed: jest.fn(), correct: jest.fn(), wrong: jest.fn(), celebrate: jest.fn() };
  return { __esModule: true, default: h, arenaHaptics: h };
});

import { REORDER_DELAY_MS, arenaCue, arenaMotion, useBoardMoves } from '../arenaMotion';
import TournoisBoard, { BOARD_COLLAPSED, TournoisPhaseBar } from '../TournoisBoard';
import { __resetReduceMotionForTests } from '../../../utils/motion';

const mockHaptics: Record<string, jest.Mock> = jest.requireMock('../arenaHaptics').default;

/** Every string a Text renders (nested Text included), one Text per entry. */
const textOf = (root: TestNode) => {
  const gather = (n: TestNode | string): string =>
    typeof n === 'string' ? n : (n.children || []).map(gather).join('');
  return root.findAll((n) => n.type === Text).map(gather).join(' | ');
};

beforeEach(() => {
  jest.clearAllMocks();
  __resetReduceMotionForTests();
});

describe('arenaMotion — the Reduce Motion off-switch', () => {
  it('returns no animation at all under Reduce Motion', () => {
    const m = arenaMotion(true);
    expect(m.enter).toBeUndefined();
    expect(m.phase).toBeUndefined();
    expect(m.reveal).toBeUndefined();
    expect(m.reorder).toBeUndefined();
    expect(m.podium(1)).toBeUndefined();
    expect(m.podium(3)).toBeUndefined();
  });

  it('animates the phase moments otherwise, rows waiting for the reveal to read first', () => {
    const m = arenaMotion(false);
    expect(m.enter).toBeDefined();
    expect(m.phase).toBeDefined();
    expect(m.reveal).toBeDefined();
    expect(m.reorder).toBeDefined();
    expect(m.podium(2)).toBeDefined();
    expect(REORDER_DELAY_MS).toBeGreaterThanOrEqual(400);
  });
});

describe('arenaCue — haptics as the phone cue (no audio module in the native build)', () => {
  it('maps locked / correct / wrong onto the competition haptic vocabulary', () => {
    arenaCue('locked');
    arenaCue('correct');
    arenaCue('wrong');
    expect(mockHaptics.commit).toHaveBeenCalledTimes(1);
    expect(mockHaptics.correct).toHaveBeenCalledTimes(1);
    expect(mockHaptics.wrong).toHaveBeenCalledTimes(1);
  });

  it('a question opening is a reading phase: no buzz', () => {
    arenaCue('roundStart');
    arenaCue(null);
    expect(Object.values(mockHaptics).every((f) => f.mock.calls.length === 0)).toBe(true);
  });

  it('the podium buzzes only for an earned place (a key)', () => {
    arenaCue('podium');
    expect(mockHaptics.celebrate).not.toHaveBeenCalled();
    arenaCue('podium', { podiumKey: 'tournois:t1' });
    expect(mockHaptics.celebrate).toHaveBeenCalledWith('tournois:t1');
  });

  it('declares no audio dependency (sound stays web-only until a store build adds one)', () => {
    const pkg = require('../../../../package.json');
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(deps['expo-av']).toBeUndefined();
    expect(deps['expo-audio']).toBeUndefined();
  });
});

describe('useBoardMoves', () => {
  function Probe({ keys, onMoves }: { keys: string[]; onMoves: (m: any) => void }) {
    onMoves(useBoardMoves(keys));
    return null;
  }

  it('shows nothing on the first board or after a loading (empty) board, then counts places', () => {
    let last: any = null;
    const on = (m: any) => { last = m; };
    let r: any;
    act(() => { r = renderer.create(<Probe keys={[]} onMoves={on} />); });
    act(() => r.update(<Probe keys={['a', 'b', 'c']} onMoves={on} />));
    expect(last).toEqual({ a: { delta: 0, entered: false }, b: { delta: 0, entered: false }, c: { delta: 0, entered: false } });
    act(() => r.update(<Probe keys={['c', 'a', 'b']} onMoves={on} />));
    expect(last.c.delta).toBe(2);
    expect(last.a.delta).toBe(-1);
    // A re-render with the same order keeps the badge (it is the latest news).
    act(() => r.update(<Probe keys={['c', 'a', 'b']} onMoves={on} />));
    expect(last.c.delta).toBe(2);
  });
});

const row = (uid: string, name: string, rank: number, points: number, school: string | null = null) =>
  ({ uid, displayName: name, school, grade: null, points, correct: 0, answered: 0, rank, avatar: null });
const players = Array.from({ length: 9 }, (_, i) => row(`u${i}`, `Joueur ${i + 1}`, i + 1, 900 - i * 50, i % 2 ? 'Lycée Pétion' : null));

describe('TournoisBoard', () => {
  beforeEach(() => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  });

  const mount = (board: any, uid: string | null, teamRule: string | null = 'solo') => {
    let r: any;
    act(() => {
      r = renderer.create(<TournoisBoard board={board} uid={uid} ht={false} teamRule={teamRule} nameOf={(v) => v || 'Participant'} />);
    });
    return r;
  };

  it('shows the top five plus my own row, and the rest behind "Voir tout"', () => {
    const r = mount({ rows: players, teams: [], total: 9, final: false, updatedAt: 0 }, 'u7');
    const txt = textOf(r.root);
    for (let i = 1; i <= BOARD_COLLAPSED; i++) expect(txt).toContain(`Joueur ${i}`);
    expect(txt).not.toContain('Joueur 6');
    expect(txt).toContain('Joueur 8'); // me, pinned
    expect(txt).toContain('Voir tout (9)');
    expect(txt).toContain('Lycée Pétion'); // school context under the name
  });

  it('opens on a podium when the results are final', () => {
    const r = mount({ rows: players, teams: [], total: 9, final: true, updatedAt: 0 }, null);
    const podium = r.root.findAll((n: TestNode) => n.props.accessibilityLabel === 'Podium');
    expect(podium.length).toBeGreaterThan(0);
    expect(r.root.findAll((n: TestNode) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Place 1, Joueur 1')).length).toBeGreaterThan(0);
    expect(textOf(r.root)).toContain('Résultats du tournoi');
  });

  it('school vs school lists the schools with what counted', () => {
    const teams = [
      { key: 's1', label: 'Lycée Pétion', rank: 1, score: 5000, counted: 5, members: 6, qualified: true, needed: 0 },
      { key: 's2', label: 'Collège Saint-Louis', rank: 2, score: 4200, counted: 4, members: 4, qualified: false, needed: 1 },
    ];
    const r = mount({ rows: players, teams, total: 9, final: false, updatedAt: 0 }, null, 'school');
    const txt = textOf(r.root);
    expect(txt).toContain('École contre école');
    expect(txt).toContain('Collège Saint-Louis');
    expect(txt).toContain('4 comptés');
  });
});

describe('TournoisPhaseBar', () => {
  it('says the phase, the question and the clock in one line', () => {
    const live: any = { phase: 'question', index: 2, closesAt: 10_000, revealUntil: 0, questionCount: 10, opensAt: 0, questionMs: 20000, question: null, reveal: null };
    let r: any;
    act(() => { r = renderer.create(<TournoisPhaseBar state="running" live={live} now={0} t={(fr) => fr} />); });
    const txt = textOf(r.root);
    expect(txt).toContain('En direct');
    expect(txt).toContain('Question 3/10');
    expect(txt).toContain('10 s');
  });
});
