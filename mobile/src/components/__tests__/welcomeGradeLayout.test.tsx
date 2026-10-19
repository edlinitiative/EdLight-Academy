/**
 * Onboarding "Ta classe" layout (TestFlight build 63: "size formatting and all
 * look weird" — 44pt numerals in tall uneven cards, "Fondamenta / l" broken
 * mid-word under three narrow tiles). Pins the compact grid: one tile shape
 * for every choice, one-line titles that shrink instead of wrapping, no
 * per-tile captions in the 3-up / 4-up rows, 44pt+ targets, large-text caps.
 */
import React from 'react';
import { Text, StyleSheet } from 'react-native';

interface TestNode {
  props: Record<string, any>;
  findAll(predicate: (node: TestNode) => boolean): TestNode[];
  findAllByType(type: unknown): TestNode[];
}
const renderer: { create(el: React.ReactElement): { root: TestNode; unmount(): void } } = require('react-test-renderer');
const { act }: { act(cb: () => unknown): any } = require('react-test-renderer');

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
jest.mock('../../services/firebase', () => ({ updateUserGrade: jest.fn() }));
jest.mock('../../navigation/AppNavigator', () => ({ navigateToTab: jest.fn() }));
jest.mock('../../services/notificationService', () => ({
  areNotificationsEnabled: () => Promise.resolve(false),
  scheduleEngagementReminders: () => Promise.resolve(),
}));
jest.mock('../../onboarding/onboardingState', () => ({
  startOnboardingRuntime: jest.fn(),
  useOnboardingSurface: () => 'welcome',
  completeWelcomeStep: jest.fn(),
  setMissionStatus: jest.fn(),
}));
jest.mock('../ui/NotificationPrePromptSheet', () => () => null);
jest.mock('../arena/art', () => ({ Avatar: () => null }));
jest.mock('../../hooks/useMyAvatar', () => ({ useMyAvatar: () => ({ avatar: null }) }));

const useStore = require('../../contexts/store').default;
const WelcomeGradeModal = require('../WelcomeGradeModal').default;

const CLASS_TITLES_FR = ['NS I', 'NS II', 'NS III', 'NS IV', '7e', '8e', '9e', 'Après le Bac'];
const CLASS_TITLES_HT = ['NS I', 'NS II', 'NS III', 'NS IV', '7yèm', '8yèm', '9yèm', 'Apre Bak'];

function render(language: 'fr' | 'ht', grade: string | null = null) {
  useStore.setState({ language, grade, quizAttempts: { a: [{}] }, enrolledCourses: [] });
  let r: any;
  act(() => { r = renderer.create(<WelcomeGradeModal />); });
  return { root: r.root as TestNode, unmount: () => act(() => r.unmount()) };
}

const radios = (root: TestNode) =>
  root.findAll((n) => n.props.accessibilityRole === 'radio' && typeof n.props.onPress === 'function'
    && n.props.accessibilityState && n.props.style !== undefined)
    // PressableScale renders an inner pressable with the same props; keep the outer one.
    .filter((n, i, all) => all.findIndex((m) => m.props.accessibilityLabel === n.props.accessibilityLabel) === i);

const titleOf = (tile: TestNode) => {
  const t = tile.findAllByType(Text)[0];
  return { text: [].concat(t.props.children).join(''), props: t.props };
};

describe.each([['fr', CLASS_TITLES_FR], ['ht', CLASS_TITLES_HT]] as const)('WelcomeGradeModal (%s)', (language, classTitles) => {
  it('shows 2 language tiles and all 8 classes', () => {
    const { root, unmount } = render(language);
    const titles = radios(root).map((n) => titleOf(n).text);
    expect(titles.slice(0, 2)).toEqual(['Kreyòl', 'Français']);
    expect(titles.slice(2)).toEqual(classTitles);
    unmount();
  });

  it('every tile shares one shape (same min height, ≥44pt) and a one-line, shrink-to-fit title', () => {
    const { root, unmount } = render(language);
    for (const tile of radios(root)) {
      const style = StyleSheet.flatten(tile.props.style);
      expect(style.minHeight).toBe(60);
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
      const { props } = titleOf(tile);
      expect(props.numberOfLines).toBe(1);
      expect(props.adjustsFontSizeToFit).toBe(true);
      expect(props.maxFontSizeMultiplier).toBeLessThanOrEqual(1.3);
      // No 26–44pt display numerals any more.
      expect(StyleSheet.flatten(props.style).fontSize).toBeLessThanOrEqual(20);
    }
    unmount();
  });

  it('the narrow 3-up / 4-up class tiles carry no caption (group labels sit above the row)', () => {
    const { root, unmount } = render(language);
    const classTiles = radios(root).slice(2, 9); // NS I…IV, 7e…9e
    for (const tile of classTiles) expect(tile.findAllByType(Text)).toHaveLength(1);
    const all = root.findAllByType(Text).map((n) => [].concat(n.props.children).join(''));
    expect(all.filter((s) => s === (language === 'ht' ? 'Fondamantal' : 'Fondamental'))).toHaveLength(1);
    expect(all.filter((s) => s === (language === 'ht' ? 'Nouvo segondè' : 'Nouveau secondaire'))).toHaveLength(1);
    unmount();
  });

  it('the stored class is preselected and a tap moves the selection', () => {
    const { root, unmount } = render(language, 'NS1');
    const sel = () => radios(root).filter((n) => n.props.accessibilityState.selected).map((n) => titleOf(n).text);
    expect(sel()).toContain('NS I');
    const ns4 = radios(root).find((n) => titleOf(n).text === 'NS IV')!;
    act(() => ns4.props.onPress());
    expect(sel()).toContain('NS IV');
    expect(sel()).not.toContain('NS I');
    unmount();
  });
});
