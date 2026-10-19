/**
 * The 3rd tab is "Examens" (ExamsNavigator → ExamLanding) for EVERY grade.
 * TestFlight build 63: an NS I student never saw the exam landing because
 * 7e–8e and NS1–NS3 mounted a Quiz-only stack there. These tests pin the tab
 * per grade on both bars, the stack's routes, the practice helper and the
 * landing's opening level.
 */
import React from 'react';
import { examStackRoot, openPractice, resetTabToStack } from '../navHelpers';
import { examLandingLevel, gradeProfile } from '../../config/trackConfig';
import { navActionForRoute } from '../planTaskNav';

const renderer: { create(el: React.ReactElement): { unmount(): void } } = require('react-test-renderer');
const { act }: { act(cb: () => unknown): any } = require('react-test-renderer');

// ── Capture the Tab.Screen / Stack.Screen props instead of mounting natives ──
const captured: { name: string; component: any; options?: any; listeners?: any }[] = [];
const fakeNavigator = () => ({
  Navigator: ({ children }: any) => <>{children}</>,
  Screen: (props: any) => { captured.push(props); return null; },
});
jest.mock('@bottom-tabs/react-navigation', () => ({ createNativeBottomTabNavigator: () => fakeNavigator() }));
jest.mock('@react-navigation/bottom-tabs', () => ({ createBottomTabNavigator: () => fakeNavigator() }));
jest.mock('@react-navigation/native-stack', () => ({ createNativeStackNavigator: () => fakeNavigator() }));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
// Expo Go → the default export renders the JS bar (Android's bar) under test.
jest.mock('expo-constants', () => ({ __esModule: true, default: { executionEnvironment: 'storeClient' }, ExecutionEnvironment: { StoreClient: 'storeClient' } }));
jest.mock('../../settings/preferences', () => ({ usePreference: () => [true, jest.fn()] }));
jest.mock('../tabScreens', () => ({
  DashboardTab: 'DashboardTab', CoursesTab: 'CoursesTab', ExamsTab: 'ExamsTab',
  TriviaTab: 'TriviaTab', ProfileTab: 'ProfileTab',
}));
// Every screen module the Exams stack imports, as a named sentinel.
for (const m of ['ExamLandingScreen', 'ExamBrowserScreen', 'ExamOverviewScreen', 'ExamTakeScreen', 'ExamResultsScreen', 'ExamHistoryScreen', 'OfflinePacksScreen', 'QuizzesScreen']) {
  jest.doMock(`../../screens/${m}`, () => ({ __esModule: true, default: m }), { virtual: false });
}

const useStore = require('../../contexts/store').default;
const GRADES = ['7e', '8e', '9e', 'NS1', 'NS2', 'NS3', 'NS4', 'POSTBAC', null] as const;

function tabsFor(grade: string | null, which: 'native' | 'js') {
  captured.length = 0;
  useStore.setState({ grade, language: 'fr', theme: 'light', focusMode: false });
  let r: any;
  const Comp = which === 'native' ? require('../NativeTabNavigator').default : require('../TabNavigator').default;
  act(() => { r = renderer.create(<Comp />); });
  act(() => r.unmount());
  return captured.slice();
}

describe('3rd tab: Examens for every grade', () => {
  it.each(GRADES)('native bar, grade %s → ExamsTab labelled Examens', (grade) => {
    const exams = tabsFor(grade, 'native').find((s) => s.name === 'Exams')!;
    expect(exams.component).toBe('ExamsTab');
    expect(exams.options.tabBarLabel).toBe('Examens');
  });

  it.each(GRADES)('JS bar (Android / Expo Go), grade %s → ExamsTab', (grade) => {
    const exams = tabsFor(grade, 'js').find((s) => s.name === 'Exams')!;
    expect(exams.component).toBe('ExamsTab');
    expect(exams.options.tabBarAccessibilityLabel).toBe('Examens');
  });
});

describe('ExamsNavigator', () => {
  it('registers the landing, every exam screen and quick practice', () => {
    captured.length = 0;
    const ExamsNavigator = require('../ExamsNavigator').default;
    let r: any;
    act(() => { r = renderer.create(<ExamsNavigator />); });
    act(() => r.unmount());
    expect(captured.map((s) => s.name)).toEqual([
      'ExamLanding', 'ExamBrowser', 'ExamOverview', 'ExamTake', 'ExamResults', 'ExamHistory', 'OfflinePacks', 'Quizzes',
    ]);
  });
});

describe('deep links and practice entry points', () => {
  it('examStackRoot is always ExamLanding', () => {
    expect(examStackRoot({ getState: () => ({ routeNames: ['ExamLanding', 'Quizzes'] }) })).toBe('ExamLanding');
    expect(examStackRoot(undefined)).toBe('ExamLanding');
  });

  it('a study-plan exam task still opens ExamOverview in the Exams tab', () => {
    expect(navActionForRoute({ kind: 'exam', levelSlug: 'terminale', examId: 'ex1' } as any)).toEqual({
      tab: 'Exams',
      params: { screen: 'ExamOverview', params: { level: 'terminale', examId: 'ex1' }, initial: false },
    });
  });

  const fakeNav = (built: boolean) => {
    const calls: any[] = [];
    return {
      calls,
      getState: () => ({ routes: [{ name: 'Exams', state: built ? { key: 'exams-stack' } : undefined }] }),
      dispatch: (a: any) => calls.push(['dispatch', a]),
      navigate: (...a: any[]) => calls.push(['navigate', ...a]),
    };
  };

  it.each(['7e', '8e', 'NS1', 'NS2', 'NS3'])('openPractice(%s): quick practice on top of the exam landing', (grade) => {
    const nav = fakeNav(true);
    openPractice(nav, grade);
    const [, action] = nav.calls[0];
    expect(action.target).toBe('exams-stack');
    expect(action.payload.routes.map((r: any) => r.name)).toEqual(['ExamLanding', 'Quizzes']);
    expect(action.payload.index).toBe(1);
    expect(nav.calls[1]).toEqual(['navigate', 'Exams']);
  });

  it.each(['9e', 'NS4', 'POSTBAC'])('openPractice(%s): the exam landing alone', (grade) => {
    const nav = fakeNav(true);
    openPractice(nav, grade);
    expect(nav.calls[0][1].payload.routes.map((r: any) => r.name)).toEqual(['ExamLanding']);
  });

  it('resetTabToStack on a never-visited tab keeps the root under the target', () => {
    const nav = fakeNav(false);
    resetTabToStack(nav, 'Exams', [{ name: 'ExamLanding' }, { name: 'Quizzes' }]);
    expect(nav.calls).toEqual([['navigate', 'Exams', { screen: 'Quizzes', params: undefined, initial: false }]]);
  });
});

describe('examLandingLevel: the level the landing opens on', () => {
  it.each([
    ['7e', '9eme_af'], ['8e', '9eme_af'], ['9e', '9eme_af'],
    ['NS1', 'baccalaureat'], ['NS2', 'baccalaureat'], ['NS3', 'baccalaureat'], ['NS4', 'baccalaureat'],
    ['POSTBAC', 'universite'], [null, null],
  ])('%s → %s', (grade, level) => {
    expect(examLandingLevel(grade as any)).toBe(level);
  });

  it('does not change examLevel (Home/readiness still de-emphasise exams below 9e)', () => {
    for (const g of ['7e', '8e', 'NS1', 'NS2', 'NS3']) expect(gradeProfile(g).examLevel).toBeNull();
  });
});
