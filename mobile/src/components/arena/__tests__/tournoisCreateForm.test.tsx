/**
 * Render tests for the native tournament creation form and the PIN card.
 */
import React from 'react';
import { Share, Text, TextInput } from 'react-native';
import TournoisCreateForm, { TournoisPinCard } from '../TournoisCreateForm';
import { ArenaButton } from '../ArenaKit';
import type { TournamentDraft } from '../../../../../shared/tournois/creationInput';

interface TestNode {
  type: unknown;
  props: Record<string, any>;
  findAll(predicate: (node: TestNode) => boolean): TestNode[];
  findAllByType(type: unknown): TestNode[];
}
interface ReactTestRenderer {
  root: TestNode;
  toJSON(): unknown;
}
const renderer: { create(element: React.ReactElement): ReactTestRenderer } =
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
jest.mock('../../../services/firebase', () => ({ db: {}, auth: { currentUser: null } }));
jest.mock('firebase/firestore', () => ({}));
jest.mock('../../../services/telemetry', () => ({ trackEvent: jest.fn() }));

const NOW = new Date(2026, 9, 19, 9, 0, 0, 0).getTime();

const buttons = (tree: ReactTestRenderer) => tree.root.findAllByType(ArenaButton);
const button = (tree: ReactTestRenderer, label: string) => {
  const found = buttons(tree).filter((b) => b.props.label === label);
  if (found.length !== 1) throw new Error(`button "${label}": ${found.length}`);
  return found[0];
};
const press = (tree: ReactTestRenderer, label: string) =>
  act(() => {
    button(tree, label).props.onPress();
  });
const input = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAllByType(TextInput).find((n) => n.props.accessibilityLabel === label)!;
const texts = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(Text).map((n) => [].concat(n.props.children).join(''));

function mount(ht = false, onSubmit = jest.fn(async (_: TournamentDraft) => true)) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <TournoisCreateForm ht={ht} busy={false} onSubmit={onSubmit} now={() => NOW} />,
    );
  });
  return { tree, onSubmit };
}

describe('TournoisCreateForm', () => {
  it('opens on the one-tap Rapide preset and creates a public solo tournament', async () => {
    const { tree, onSubmit } = mount();
    expect(button(tree, 'Rapide').props.selected).toBe(true);
    expect(button(tree, 'Personnaliser').props.selected).toBe(false);
    act(() => input(tree, 'Nom du tournoi').props.onChangeText('Défi du vendredi'));
    await act(async () => {
      button(tree, 'Créer le tournoi').props.onPress();
    });
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Défi du vendredi',
        visibility: 'public',
        teamRule: 'solo',
        startsAt: NOW + 10 * 60_000,
      }),
    );
  });

  it('Personnaliser exposes every web option with selected states', async () => {
    const { tree, onSubmit } = mount();
    press(tree, 'Personnaliser');
    for (const label of [
      'En direct', 'Fenêtre ouverte', 'Manches', 'Élimination',
      'Maths éclair', 'Sciences & Nature', '30', '15 s',
      'Dans 20 min', 'Demain 18 h',
      'Chacun pour soi', 'École contre école', 'Classe contre classe',
      'Public', 'Non listé', 'Privé (PIN)',
      'Je joue aussi', 'J’organise seulement',
    ])
      expect(buttons(tree).some((b) => b.props.label === label)).toBe(true);
    expect(input(tree, 'Date de début (année-mois-jour)')).toBeTruthy();
    expect(input(tree, 'Heure de début (heures:minutes)')).toBeTruthy();
    expect(texts(tree).some((s) => s.startsWith('Calendrier généré'))).toBe(true);

    // Private class room, school vs school, best 3, rounds.
    press(tree, 'Privé (PIN)');
    expect(button(tree, 'Privé (PIN)').props.selected).toBe(true);
    expect(button(tree, 'Public').props.selected).toBe(false);
    press(tree, 'École contre école');
    press(tree, '3 meilleurs');
    press(tree, 'Manches');
    press(tree, '7');
    expect(button(tree, '7').props.selected).toBe(true);
    press(tree, 'Maths éclair'); // toggle off a default category
    expect(button(tree, 'Maths éclair').props.selected).toBe(false);
    act(() => input(tree, 'Nom du tournoi').props.onChangeText('Salle NS3'));
    act(() => input(tree, 'Date de début (année-mois-jour)').props.onChangeText('2026-10-22'));
    act(() => input(tree, 'Heure de début (heures:minutes)').props.onChangeText('18:30'));
    await act(async () => {
      button(tree, 'Créer le tournoi').props.onPress();
    });
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Salle NS3',
        visibility: 'private',
        teamRule: 'school',
        teamSize: 3,
        format: 'rounds',
        roundCount: 7,
        categories: ['sciences'],
        startsAt: new Date(2026, 9, 22, 18, 30).getTime(),
      }),
    );
  });

  it('refuses invalid input locally and names the fields', async () => {
    const { tree, onSubmit } = mount();
    press(tree, 'Personnaliser');
    press(tree, 'Maths éclair');
    press(tree, 'Sciences & Nature');
    act(() => input(tree, 'Heure de début (heures:minutes)').props.onChangeText('99:99'));
    await act(async () => {
      button(tree, 'Créer le tournoi').props.onPress();
    });
    expect(onSubmit).not.toHaveBeenCalled();
    const all = texts(tree);
    expect(all).toContain('Le nom doit avoir 3 à 60 caractères.');
    expect(all).toContain('Choisis au moins une catégorie.');
    expect(all.some((s) => s.startsWith('Date AAAA-MM-JJ'))).toBe(true);
  });

  it('renders in Kreyòl', () => {
    const { tree } = mount(true);
    expect(button(tree, 'Rapid').props.selected).toBe(true);
    press(tree, 'Pèsonalize');
    expect(buttons(tree).some((b) => b.props.label === 'Prive (PIN)')).toBe(true);
    expect(button(tree, 'Kreye tounwa a')).toBeTruthy();
  });
});

describe('TournoisPinCard', () => {
  it('shows the PIN prominently with copy/share and the join link', () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as any);
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <TournoisPinCard tid="t_abcdef" pin="482913" title="Salle NS3" visibility="private" ht={false} />,
      );
    });
    const pin = tree.root.findAll((n) => n.props.testID === 'tournament-pin' && n.type === Text)[0];
    expect(pin.props.children).toBe('482 913');
    expect(pin.props.selectable).toBe(true);
    expect(pin.props.accessibilityLabel).toBe('PIN 4 8 2 9 1 3');
    const link = 'https://academy.edlight.org/tournois/rejoindre?pin=482913';
    expect(texts(tree)).toContain(link);
    press(tree, 'Copier ou partager le PIN');
    expect(share).toHaveBeenLastCalledWith({ message: '482913' });
    press(tree, 'Partager le lien d’invitation');
    // One sentence + the link, no em-dash (owner feedback on share texts).
    expect(share).toHaveBeenLastCalledWith({ message: `Rejoins mon tournoi « Salle NS3 » avec le PIN 482 913 : ${link}` });
  });
});
