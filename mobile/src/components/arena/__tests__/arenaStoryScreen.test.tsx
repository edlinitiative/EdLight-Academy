/**
 * Mode Histoire on the phone: the map renders every chapter (locked ones say
 * so), a stage plays through the real round builder, a win records stars per
 * account on the device and lands on the result, and the round's XP goes
 * through useTrivia.recordResult like any other game.
 */
import React from 'react';
import { AccessibilityInfo, Text } from 'react-native';

jest.setTimeout(30000);

interface TestNode {
  props: Record<string, any>;
  type: unknown;
  children: Array<TestNode | string>;
  findAll(pred: (n: TestNode) => boolean): TestNode[];
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
jest.mock('../arenaHaptics', () => {
  const h = { choose: jest.fn(), commit: jest.fn(), confirmed: jest.fn(), correct: jest.fn(), wrong: jest.fn(), celebrate: jest.fn() };
  return { __esModule: true, default: h, arenaHaptics: h, hapticsAllowed: () => false };
});
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn(), canGoBack: () => true }),
  useIsFocused: () => true,
  useFocusEffect: () => undefined,
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
const mockState: any = { language: 'fr', user: { uid: 'u1' } };
jest.mock('../../../contexts/store', () => {
  const useStore: any = (sel: (s: any) => any) => sel(mockState);
  useStore.getState = () => mockState;
  return { __esModule: true, default: useStore };
});
const mockRecordResult = jest.fn(() => Promise.resolve({ xpEarned: 42 }));
jest.mock('../../../hooks/useTrivia', () => ({ useTrivia: () => ({ recordResult: mockRecordResult, isAuthed: true }) }));
// The round itself is TriviaScreen's QuizPlayer — stubbed to a button that
// finishes with a chosen score, so the test exercises the campaign, not the quiz.
const mockFinishWith = { score: 6 };
jest.mock('../../../screens/TriviaScreen', () => {
  const { Pressable, Text: RNText } = require('react-native');
  return {
    toPrepared: (q: any) => ({ q: q.q, qHt: q.qHt ?? q.q, options: q.options, correctAnswer: q.options[q.answer] }),
    QuizPlayer: ({ questions, onFinish, title }: any) => (
      <Pressable testID="quiz-finish" onPress={() => onFinish(mockFinishWith.score, questions.length, [], [])}>
        <RNText>{`QUIZ ${title} ${questions.length}`}</RNText>
      </Pressable>
    ),
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import ArenaStoryScreen, { prepareStoryRound } from '../../../screens/arena/ArenaStoryScreen';
import { __resetStoryProgressForTests, storyKeyFor } from '../../../hooks/useStoryProgress';
import { __resetReduceMotionForTests } from '../../../utils/motion';
import { STORY_CHAPTERS } from '../../../../../shared/arenaStory';

const textOf = (root: TestNode) => {
  const gather = (n: TestNode | string): string => (typeof n === 'string' ? n : (n.children || []).map(gather).join(''));
  return root.findAll((n) => n.type === Text).map(gather).join(' | ');
};
const byTestId = (root: TestNode, id: string) => root.findAll((n) => n.props?.testID === id && typeof n.type !== 'string');

async function render() {
  let tree: any;
  await act(async () => { tree = renderer.create(<ArenaStoryScreen />); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return { tree, root: tree.root as TestNode };
}

beforeEach(async () => {
  jest.clearAllMocks();
  __resetStoryProgressForTests();
  __resetReduceMotionForTests();
  await AsyncStorage.clear();
  mockFinishWith.score = 6;
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
});

describe('ArenaStoryScreen', () => {
  it('draws the campaign: ten chapters, the first open, the rest locked', async () => {
    const { root, tree } = await render();
    const text = textOf(root);
    expect(text).toContain('Le tour d’Ayiti');
    expect(text).toContain('0 étoiles sur 120');
    for (const c of STORY_CHAPTERS) {
      const [chip] = byTestId(root, `chapter-${c.id}`);
      expect(chip.props.accessibilityRole).toBe('button');
    }
    expect(byTestId(root, 'chapter-ouest')[0].props.accessibilityLabel).toBe('1. Ouest');
    expect(byTestId(root, 'chapter-nord')[0].props.accessibilityLabel).toContain('verrouillé');
    // Stage 1 is playable, stage 2 is not yet.
    expect(byTestId(root, 'stage-0')[0].props.disabled).toBe(false);
    expect(byTestId(root, 'stage-1')[0].props.disabled).toBe(true);
    expect(text).toContain('Jouer l’étape 1');
    tree.unmount();
  });

  it('plays a stage, records the stars on this device and pays XP through recordResult', async () => {
    const { root, tree } = await render();
    await act(async () => { byTestId(root, 'stage-0')[0].props.onPress(); });
    expect(textOf(root)).toContain('QUIZ Ouest · Étape 1 6');
    await act(async () => { byTestId(root, 'quiz-finish')[0].props.onPress(); });
    await act(async () => { await Promise.resolve(); });
    const text = textOf(root);
    expect(text).toContain('Étape réussie !');
    expect(text).toContain('+42 XP');
    expect(mockRecordResult).toHaveBeenCalledWith({ category: 'geo_haiti', score: 6, total: 6, isDaily: false });
    const saved = JSON.parse((await AsyncStorage.getItem(storyKeyFor('u1'))) || '{}');
    expect(saved.ouest).toEqual([3, 0, 0, 0]);
    tree.unmount();
  });

  it('a miss saves nothing and offers a replay', async () => {
    mockFinishWith.score = 1;
    const { root, tree } = await render();
    await act(async () => { byTestId(root, 'stage-0')[0].props.onPress(); });
    await act(async () => { byTestId(root, 'quiz-finish')[0].props.onPress(); });
    const text = textOf(root);
    expect(text).toContain('Pas cette fois…');
    expect(text).toContain('Rejouer');
    expect(JSON.parse((await AsyncStorage.getItem(storyKeyFor('u1'))) || '{}').ouest).toEqual([0, 0, 0, 0]);
    tree.unmount();
  });
});

describe('prepareStoryRound', () => {
  it('builds every stage of every chapter from the phone’s banks, at full length', () => {
    for (const ch of STORY_CHAPTERS) {
      for (const st of [...ch.stages, ch.bossStage]) {
        const round = prepareStoryRound(st);
        expect(round).toHaveLength(st.count);
        expect(new Set(round.map((q) => `${q.q}|${q.correctAnswer}`)).size).toBe(st.count);
      }
    }
  });
});
