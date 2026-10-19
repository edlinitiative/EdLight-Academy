/**
 * Render tests for the native competition workspace (WorkspaceKit), fed with
 * real builder output from shared/competition/workspace.ts.
 */
import React from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import {
  TaskForm,
  WorkspacePanel,
  WorkspaceRow,
} from '../WorkspaceKit';
import { ArenaButton } from '../ArenaKit';
import { arenaColors } from '../../../theme/arenaTheme';
import {
  workspacePage,
  type Panel,
  type Task,
} from '../../../../../shared/competition/workspace';

// Full-form renders are slow under a loaded full-suite run; the default 5 s flakes.
jest.setTimeout(20000);

// react-test-renderer ships with jest-expo but without type declarations;
// the slice these tests use, typed locally.
interface TestNode {
  type: unknown;
  props: Record<string, any>;
  findAll(predicate: (node: TestNode) => boolean): TestNode[];
  findAllByType(type: unknown): TestNode[];
  findAllByProps(props: Record<string, unknown>): TestNode[];
}
interface ReactTestRenderer {
  root: TestNode;
  toJSON(): unknown;
}
const renderer: { create(element: React.ReactElement): ReactTestRenderer } =
  require('react-test-renderer');
const { act }: { act(callback: () => unknown): any } =
  require('react-test-renderer');

jest.mock('react-native-reanimated', () =>
  require('react-native-reanimated/mock'),
);
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

const CAPTAIN = 'uidCaptainAAAA1111';
const LONG = 'uidLongNameBBBB2222';
const DELETED = 'deleted_0123456789abcdef';
const UNKNOWN = 'uidUnknownCCCC3333';
const REQUESTER = 'uidRequesterDDDD4444';
const UIDS = [CAPTAIN, LONG, DELETED, UNKNOWN, REQUESTER];
const LONG_NAME =
  'Marie-Christine Jean-Baptiste Saint-Fleur Desrosiers-Toussaint';

const teamData = {
  team: {
    name: 'Les Mathématiciens du Lycée National de Port-au-Prince',
    captainUid: CAPTAIN,
    members: [CAPTAIN, LONG, DELETED, UNKNOWN],
  },
  requests: [{ uid: REQUESTER, publicName: 'Jodi' }],
  invites: [],
  people: {
    [CAPTAIN]: { name: 'Ted', avatar: null },
    [LONG]: { name: LONG_NAME, avatar: null },
    [DELETED]: { name: 'Compte supprimé / Kont efase', avatar: null },
  },
};
const mine = { uid: CAPTAIN, people: {} };

function page() {
  return workspacePage({ kind: 'team', id: 'team1' }, teamData, mine, Date.now());
}

function renderPanels(panels: Panel[], ht = false) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <>
        {panels.map((panel, i) => (
          <WorkspacePanel
            key={i}
            panel={panel}
            ht={ht}
            onOpen={() => undefined}
            renderTask={(task: Task) => (
              <TaskForm
                key={task.id}
                task={task}
                ht={ht}
                uid={CAPTAIN}
                execute={jest.fn(() => Promise.resolve())}
              />
            )}
          />
        ))}
      </>,
    );
  });
  return tree;
}

/** Every string a sighted or screen-reader user can perceive. */
function perceivable(tree: ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (node: any) => {
    if (node == null) return;
    if (typeof node === 'string') {
      out.push(node);
      return;
    }
    if (Array.isArray(node)) return node.forEach(walk);
    const p = node.props || {};
    for (const key of ['accessibilityLabel', 'placeholder', 'value']) {
      if (typeof p[key] === 'string') out.push(p[key]);
    }
    walk(node.children);
  };
  walk(tree.toJSON());
  return out;
}

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

describe('WorkspaceKit', () => {
  it('never prints a uid, even with every task expanded', async () => {
    const tree = renderPanels(page().panels);
    await flush();
    // Expand every task that has fields (the person select lists names).
    for (const button of tree.root.findAllByType(ArenaButton)) {
      const label: string = button.props.label;
      if (/Transférer|Demande pour|Recrutement|Inviter/.test(label)) {
        await act(async () => {
          button.props.onPress();
        });
      }
    }
    const text = perceivable(tree).join('\n');
    expect(text).toContain('Ted');
    expect(text).toContain(LONG_NAME);
    for (const uid of UIDS) expect(text).not.toContain(uid);
  });

  it('localizes a deleted account and draws no seeded face for it', async () => {
    for (const ht of [false, true]) {
      const tree = renderPanels(page().panels, ht);
      await flush();
      const text = perceivable(tree).join('\n');
      expect(text).toContain(ht ? 'Kont efase' : 'Compte supprimé');
      expect(text).not.toContain('Compte supprimé / Kont efase');
      expect(
        tree.root.findAllByProps({ testID: 'person-face-deleted' }),
      ).not.toHaveLength(0);
      // An unknown uid is a localized "Participant", not its id.
      expect(text).toContain(ht ? 'Patisipan' : 'Participant');
    }
  });

  it('renders a 60-character name in a wrapping row without crashing', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <WorkspaceRow
          ht={false}
          row={{
            text: [`${LONG_NAME} · Capitaine`, `${LONG_NAME} · Kapitèn`],
            person: { uid: LONG, name: LONG_NAME, avatar: null },
          }}
        />,
      );
    });
    const name = tree.root.findAllByType(Text)[0];
    const style = StyleSheet.flatten(name.props.style);
    expect(style.flexShrink).toBe(1);
    expect(name.props.numberOfLines).toBeUndefined(); // wraps, never truncates
  });

  it('says so when a panel is empty instead of a lone heading', () => {
    const empty = page().panels.find((p) => !p.tasks?.length && !p.rows?.length);
    const tree = renderPanels([
      empty ?? { title: ['Demandes et invitations', 'Demann ak envitasyon'], tasks: [] },
    ]);
    expect(perceivable(tree).join('\n')).toContain('Rien pour le moment.');
    const ht = renderPanels([{ title: ['Vide', 'Vid'] }], true);
    expect(perceivable(ht).join('\n')).toContain('Anyen pou kounye a.');
  });

  it('marks the chosen option as selected, by state and not colour alone', async () => {
    const tree = renderPanels(page().panels);
    await flush();
    const transfer = tree.root
      .findAllByType(ArenaButton)
      .find((b) => /Transférer/.test(b.props.label))!;
    await act(async () => {
      transfer.props.onPress();
    });
    const option = tree.root
      .findAllByType(ArenaButton)
      .find((b) => b.props.label === 'Ted' || b.props.label === LONG_NAME)!;
    await act(async () => {
      option.props.onPress();
    });
    const chosen = tree.root
      .findAllByType(ArenaButton)
      .find((b) => b.props.label === option.props.label)!;
    expect(chosen.props.selected).toBe(true);
    expect(chosen.props.label).not.toMatch(/^✓/); // the check is an icon, not label text
  });

  it('draws the same night in light and dark mode, from theme tokens only', async () => {
    const rn = require('react-native');
    const spy = jest.spyOn(rn, 'useColorScheme');
    // Avatars mint unique SVG ids per render, so compare the host styles
    // (every colour, size and spacing) rather than the raw tree.
    const snapshots: string[] = [];
    for (const scheme of ['light', 'dark'] as const) {
      spy.mockReturnValue(scheme);
      const tree = renderPanels(page().panels);
      await flush();
      snapshots.push(
        JSON.stringify(
          tree.root
            .findAll((n) => typeof n.type === 'string' && !n.type.startsWith('RNSVG'))
            .map((n) => StyleSheet.flatten(n.props.style) ?? null),
        ),
      );
      const tokens = new Set<string>(Object.values(arenaColors));
      for (const node of [
        ...tree.root.findAllByType(Text),
        ...tree.root.findAllByType(TextInput),
      ]) {
        const color = StyleSheet.flatten(node.props.style)?.color;
        if (color) expect(tokens.has(color)).toBe(true);
        const size = StyleSheet.flatten(node.props.style)?.fontSize;
        if (size) expect(size).toBeGreaterThanOrEqual(14); // 14pt text floor
      }
    }
    expect(snapshots[0]).toBe(snapshots[1]);
    spy.mockRestore();
  });
});
