import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View, useColorScheme } from 'react-native';
import {
  NavigationContainer,
  createNavigationContainerRef,
  getStateFromPath as defaultGetStateFromPath,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import useStore from '../contexts/store';
import TabNavigator from './TabNavigator';
import AuthModal from '../components/AuthModal';
import WelcomeGradeModal from '../components/WelcomeGradeModal';
import NavTour from '../components/NavTour';
import NetworkStatus from '../components/NetworkStatus';
import SandraScreen from '../screens/SandraScreen';
import StudyPlanScreen from '../screens/StudyPlanScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';
import ChallengeScreen from '../screens/ChallengeScreen';
import TeachScreen from '../screens/TeachScreen';
import ClassesScreen from '../screens/ClassesScreen';
import ProgressShareScreen from '../screens/ProgressShareScreen';
import AmbassadorScreen from '../screens/AmbassadorScreen';
import SearchScreen from '../screens/SearchScreen';
import ArenaLobbyScreen from '../screens/arena/ArenaLobbyScreen';
import ArenaLiveScreen from '../screens/arena/ArenaLiveScreen';
import ArenaDoorsScreen from '../screens/arena/ArenaDoorsScreen';
import ArenaResultScreen from '../screens/arena/ArenaResultScreen';
import CompetitionWorkspaceScreen from '../screens/arena/CompetitionWorkspaceScreen';
import TournoisScreen from '../screens/arena/TournoisScreen';
import ArenaHubScreen from '../screens/arena/ArenaHubScreen';
import ArenaWatchScreen from '../screens/arena/ArenaWatchScreen';
import AvatarEditorScreen, { type AvatarSection } from '../screens/AvatarEditorScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { savedCompetitionTarget, restoreCompetitionTarget } from './competitionContinuity';
import * as ExpoLinking from 'expo-linking';
import { useReduceMotion } from '../utils/motion';
import { resolveAppPath, stateForTarget, type ArenaHubSection } from './arenaLinks';
import { setCurrentRouteProvider } from '../services/telemetry';
import { shouldReplayInitialTarget } from './initialLink';
import {
  LEARNING_STATE_KEY,
  isPristineLaunch,
  learningStateToNavState,
  readLearningState,
  snapshotLearningState,
} from './learningContinuity';
import { queryClient } from '../lifecycle/queryClient';

/** false = the course is known to be gone from the catalog; undefined = unknown. */
function courseInCatalog(courseId: string): boolean | undefined {
  const data = queryClient.getQueryData<any[]>(['coursesData']);
  if (!Array.isArray(data) || data.length === 0) return undefined;
  return data.some((c) => c && String(c.id) === courseId);
}

/**
 * Reopen the learning place saved before the app was killed (CON-02/CON-10),
 * only into an untouched launch. See learningContinuity.ts for the rules.
 */
async function restoreLearningPlace(uid: string | null): Promise<boolean> {
  const raw = await AsyncStorage.getItem(LEARNING_STATE_KEY);
  if (!raw || !navigationRef.isReady()) return false;
  // ExamsNavigator is the Exams tab for every grade, so its root is fixed.
  const examsRoot = 'ExamLanding' as const;
  const rec = readLearningState(raw, { uid, now: Date.now(), examsRoot, courseExists: courseInCatalog });
  if (!rec) return false;
  const state = learningStateToNavState(rec, { examsRoot });
  if (!state || !isPristineLaunch(navigationRef.getRootState())) return false;
  navigationRef.resetRoot(state);
  return true;
}

export type RootParamList = {
  Loading: undefined;
  Tournois: { tournamentId?: string; pin?: string } | undefined;
  CompetitionWorkspace: { kind?: 'home' | 'event' | 'team' | 'invite' | 'league' | 'school'; id?: string } | undefined;
  Main: undefined;
  Search: undefined;
  Sandra: { ask?: string } | undefined;
  StudyPlan: undefined;
  Leaderboard: undefined;
  Teach: undefined;
  Classes: undefined;
  ProgressShare: undefined;
  Ambassador: undefined;
  Defi: { code: string };
  /** Mon avatar (web /profile/avatar). `preview` is dev-only (signed-out screenshots). */
  AvatarEditor: { section?: AvatarSection; preview?: string | boolean; theme?: string } | undefined;
  /*
   * The Arena sits at the ROOT, not inside the Jeux tab.
   *
   * On tournament night this is the product, and anything that lets a student
   * wander into Cours mid-round and lose their place is a defect. A root route
   * takes the screen the way the exam runner already does — which is the
   * precedent for a takeover screen in this app.
   */
  /** The permanent Arena destination (also the Jeux tab's Arène segment). */
  ArenaHub: { section?: ArenaHubSection } | undefined;
  /** Portrait spectator view; with no id it watches whatever is live. */
  ArenaWatch: { tournamentId?: string } | undefined;
  ArenaLobby: { tournamentId: string };
  ArenaDoors: { tournamentId: string };
  ArenaLive: { tournamentId: string };
  ArenaResult: { tournamentId: string };
};

const Stack = createNativeStackNavigator<RootParamList>();

// Ref so out-of-tree callers (e.g. the notification-tap handler in App.tsx) can
// drive navigation without a component's `navigation` prop.
export const navigationRef = createNavigationContainerRef<RootParamList>();
// Error reports carry the focused screen's static NAME (never its params).
setCurrentRouteProvider(() => (navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : null));

/**
 * Navigate from a tapped notification. Safe to call before the tree mounts —
 * no-ops until the container is ready (a cold-start tap can fire that early).
 * `daily` also arms the daily-challenge auto-start on the Trivia tab.
 */
export function navigateToTab(tab: string, opts?: { daily?: boolean }) {
  if (!navigationRef.isReady()) return;
  if (opts?.daily) {
    useStore.getState().setPendingDailyChallenge(true);
  }
  (navigationRef.navigate as any)('Main', { screen: tab });
}

// Modal wrappers: give the screens a working X button (goBack) — they're
// otherwise presentation-agnostic components.

/**
 * Route an in-app path from a Sandra chat link (e.g. "/study-plan",
 * "/exams/terminale") to a real navigation action, dismissing the chat first.
 * Unrecognized paths leave the chat open so a tap never feels broken.
 */
function navigateFromSandra(navigation: any, path: string) {
  const p = (path || '').toLowerCase();
  const goTab = (screen: string, params?: object) => {
    navigation.goBack();
    navigation.navigate('Main', { screen, params });
  };
  if (p.startsWith('/study-plan')) {
    navigation.goBack();
    navigation.navigate('StudyPlan');
  } else if (p.startsWith('/exam')) {
    // Sandra links a specific paper ("/exams/terminale/<id>"), a level
    // ("/exams/9e") or the results page; open that, not the tab root. Every
    // grade's Exams tab is ExamsNavigator, which carries these screens.
    // The id keeps its original case, so it is read from `path`, not `p`.
    const [, , level, examId] = (path || '').split(/[?#]/)[0].split('/');
    if (level === 'resultats') {
      goTab('Exams', { screen: 'ExamHistory', initial: false });
    } else if (level && examId) {
      goTab('Exams', { screen: 'ExamOverview', params: { level: level.toLowerCase(), examId }, initial: false });
    } else if (level) {
      goTab('Exams', { screen: 'ExamBrowser', params: { level: level.toLowerCase() }, initial: false });
    } else {
      goTab('Exams');
    }
  } else if (p.startsWith('/quiz')) {
    goTab('Courses', { screen: 'Quizzes', initial: false });
  } else if (p.startsWith('/course')) {
    goTab('Courses');
  } else if (p.startsWith('/jeux') || p.startsWith('/game') || p.startsWith('/trivia')) {
    goTab('Trivia');
  } else if (p.startsWith('/classement') || p.startsWith('/leaderboard')) {
    navigation.goBack();
    navigation.navigate('Leaderboard');
  } else if (p.startsWith('/profile')) {
    goTab('Profile');
  }
}

function SandraModal({ navigation, route }: any) {
  return (
    <SandraScreen
      onClose={() => navigation.goBack()}
      onNavigate={(path) => navigateFromSandra(navigation, path)}
      initialAsk={route.params?.ask}
    />
  );
}
function SearchModal({ navigation }: any) {
  return <SearchScreen navigation={navigation} onClose={() => navigation.goBack()} />;
}
function StudyPlanModal({ navigation }: any) {
  return <StudyPlanScreen onClose={() => navigation.goBack()} />;
}
function LeaderboardModal({ navigation }: any) {
  return <LeaderboardScreen onClose={() => navigation.goBack()} />;
}
function TeachModal({ navigation }: any) {
  return <TeachScreen onClose={() => navigation.goBack()} />;
}
function ChallengeModal({ navigation, route }: any) {
  return <ChallengeScreen code={String(route.params?.code ?? '')} onClose={() => navigation.goBack()} />;
}

// Deep links. ONE URL contract shared with the web routes — see
// navigation/arenaLinks.ts for the table, the reserved Arena words
// (championnat, demo, histoire, studio…) that can never parse as a tournament
// id, the id-shape check, and the hub fallback for every unsupported Arena
// destination. Duel invites (`/defi/<code>`) go through the same resolver so
// a malformed code opens the Jeux tab instead of a dead challenge screen.
//
// The `config` below is what React Navigation uses to BUILD paths (and the
// fallback parser for paths arenaLinks.ts does not own); parsing for every
// Arena and duel path goes through `resolveAppPath` first.
//
// Native delivery is separate from this table: Android only hands the app the
// https paths listed in app.json's intent filters, iOS only those in the
// apple-app-site-association file on academy.edlight.org.
const linking = {
  // In development, Expo Go's own URL (exp://<host>/--/) also opens app paths.
  prefixes: ['edlight://', 'https://academy.edlight.org', ...(__DEV__ ? [ExpoLinking.createURL('/')] : [])],
  config: {
    screens: {
      Defi: 'defi/:code',
      AvatarEditor: 'profile/avatar',
      ArenaHub: 'arena',
      ArenaWatch: 'arena/demo',
      ArenaLobby: 'arena/jouer/:tournamentId',
    },
  },
  getStateFromPath(path: string, options: any) {
    // /profile/avatar opens over Main, so back lands on the app, not nowhere.
    const avatar = /^\/?profile\/avatar\/?(\?(.*))?$/i.exec(path);
    if (avatar) {
      // Parsed by hand: RN's URLSearchParams polyfill is incomplete.
      const q: Record<string, string> = {};
      for (const pair of (avatar[2] || '').split('&')) {
        const [k, v = ''] = pair.split('=');
        if (k) q[decodeURIComponent(k)] = decodeURIComponent(v);
      }
      const params: Record<string, string> = {};
      if (q.section) params.section = q.section;
      if (__DEV__ && q.preview) params.preview = q.preview;
      if (__DEV__ && q.preview && q.theme) params.theme = q.theme;
      return { routes: [{ name: 'Main' }, { name: 'AvatarEditor', params }] } as any;
    }
    const target = resolveAppPath(path);
    if (target) return stateForTarget(target) as any;
    return defaultGetStateFromPath(path, options);
  },
};

/**
 * Must stay in sync with the expo-splash-screen plugin config in app.json —
 * the background AND the 140pt image width, so the JS splash lands exactly
 * where the native one left off.
 */
const SPLASH = {
  light: { background: '#FFFFFF', image: require('../../assets/splash.png') },
  dark: { background: '#0b1220', image: require('../../assets/splash-dark.png') },
} as const;

/** Matches `imageWidth` in the expo-splash-screen plugin config. */
const SPLASH_LOGO_SIZE = 98;

/**
 * The animated splash.
 *
 * The REAL logo asset, breathing. An earlier version redrew the mark as SVG so
 * it could animate freely — but a hand-traced approximation is not the logo,
 * and it read as one: the proportions and stroke weights never match the real
 * file. The actual artwork with a slow zoom is both honest and simpler.
 *
 * A native launch screen cannot animate, so the sequence is: the native splash
 * shows this same asset at the same size, and the moment JS can render, this
 * takes over and starts the breath. Nothing resizes at the handoff, so the swap
 * is invisible; only the motion marks it.
 *
 * Follows the SYSTEM appearance, not the app's theme toggle — the native splash
 * it continues is chosen by the OS.
 */
function LoadingScreen() {
  const splash = useColorScheme() === 'dark' ? SPLASH.dark : SPLASH.light;
  const zoom = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    // Reduced motion: the logo simply holds still — same asset, same size,
    // so the native-splash handoff is still invisible.
    if (reduceMotion) {
      zoom.stopAnimation();
      zoom.setValue(0);
      return undefined;
    }
    // A slow in-and-out, not a pulse: 6% is enough to read as alive at this
    // size, and anything faster starts to look like a loading spinner.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(zoom, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(zoom, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    // The loop must not outlive the screen (auth resolves → Loading unmounts).
    return () => loop.stop();
  }, [zoom, reduceMotion]);

  const scale = zoom.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });

  return (
    <View style={{ flex: 1, backgroundColor: splash.background, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.Image
        source={splash.image}
        style={{ width: SPLASH_LOGO_SIZE, height: SPLASH_LOGO_SIZE, transform: [{ scale }] }}
        resizeMode="contain"
      />
    </View>
  );
}

/**
 * Stack transitions, through the shared reduced-motion hook. With reduce
 * motion on, travel (slides) becomes an immediate change — the same screens,
 * the same order, no movement — and fades are kept short.
 */
type StackAnimation = 'fade' | 'slide_from_right' | 'slide_from_bottom' | 'none';
function useTransition() {
  const reduceMotion = useReduceMotion();
  return (animation: StackAnimation, animationDuration?: number) => (reduceMotion
    ? { animation: 'none' as const }
    : animationDuration != null ? { animation, animationDuration } : { animation });
}

export default function AppNavigator() {
  const authConfirmed = useStore((s) => s.authConfirmed);
  const tx = useTransition();
  const uid = useStore((s) => s.user?.uid ?? null);
  const previousUid = useRef(uid);
  const [ready, setReady] = useState(false);
  const restored = useRef(false);
  const restorationComplete = useRef(false);
  useEffect(() => {
    const previous = previousUid.current; previousUid.current = uid;
    if (previous && previous !== uid) {
      void AsyncStorage.removeItem('competition:last-destination');
      void AsyncStorage.getAllKeys().then((keys) => AsyncStorage.multiRemove(keys.filter((key) => key.startsWith(`competition-draft:${previous}:`))));
      if (navigationRef.isReady()) navigationRef.resetRoot({ routes: [{ name: 'Main' }] });
    }
  }, [uid]);
  useEffect(() => {
    if (!authConfirmed || !ready || restored.current) return;
    restored.current = true;
    let valid = true;
    void Promise.all([ExpoLinking.getInitialURL(), AsyncStorage.getItem('competition:last-destination')]).then(([url, raw]) => {
      if (!valid) return;
      if (url) {
        // Linking may have resolved while only Loading was registered.
        // Reapply the typed destination after authentication readiness.
        const target = resolveAppPath(url);
        // Any target, not only competitions: duel invites and Arène links
        // that cold-started the app were dropped on Home (P0 validation).
        if (navigationRef.isReady() && shouldReplayInitialTarget(target, navigationRef.getCurrentRoute()?.name))
          (navigationRef.navigate as any)(target!.screen, target!.params);
        return;
      }
      if (raw) {
        try {
          const target = restoreCompetitionTarget(JSON.parse(raw), useStore.getState().user?.uid ?? null);
          if (target && navigationRef.isReady()) {
            (navigationRef.navigate as any)(target.screen, target.params);
            return;
          }
        } catch { /* ignore invalid local navigation */ }
      }
      // No link and no competition place: reopen the learning place, if any.
      return restoreLearningPlace(useStore.getState().user?.uid ?? null).then(() => undefined);
    }).catch(() => undefined).finally(() => { if(valid)restorationComplete.current=true; });
    return () => { valid = false; };
  }, [authConfirmed, ready]);
  const rememberDestination = () => {
    if(!restorationComplete.current)return;
    const target = savedCompetitionTarget(navigationRef.getCurrentRoute());
    if (target) void AsyncStorage.setItem('competition:last-destination', JSON.stringify({ uid, target })).catch(() => undefined);
    else if (navigationRef.getCurrentRoute()?.name === 'Main') void AsyncStorage.removeItem('competition:last-destination').catch(() => undefined);
    // The learning place (tab + validated stack). A root modal (Sandra,
    // Search, Arena…) returns null and keeps the place underneath it.
    const learning = snapshotLearningState(navigationRef.getRootState(), uid, Date.now());
    if (learning) void AsyncStorage.setItem(LEARNING_STATE_KEY, JSON.stringify(learning)).catch(() => undefined);
  };

  return (
    <>
      <NetworkStatus />
      <NavigationContainer ref={navigationRef} linking={linking} onReady={() => setReady(true)} onStateChange={rememberDestination}>
        <Stack.Navigator screenOptions={{ headerShown: false, ...tx('fade') }}>
          {!authConfirmed ? (
            <Stack.Screen name="Loading" component={LoadingScreen} />
          ) : (
            <>
              <Stack.Screen name="Main" component={TabNavigator} />
              <Stack.Screen name="Tournois" component={TournoisScreen} />
              <Stack.Screen name="CompetitionWorkspace" component={CompetitionWorkspaceScreen} />
              <Stack.Screen
                name="Search"
                component={SearchModal}
                options={tx('fade', 120)}
              />
              <Stack.Screen
                name="Sandra"
                component={SandraModal}
                // Full-screen card (not a native 'modal'): native-stack modals on
                // iOS break KeyboardAvoidingView (chat input hid behind the
                // keyboard) and layer the auth modal underneath. A card that
                // slides up keeps the same feel and fixes both.
                options={tx('slide_from_bottom')}
              />
              <Stack.Screen
                name="StudyPlan"
                component={StudyPlanModal}
                options={{ presentation: 'modal', ...tx('slide_from_bottom') }}
              />
              <Stack.Screen
                name="Leaderboard"
                component={LeaderboardModal}
                options={tx('slide_from_right')}
              />
              <Stack.Screen
                name="ArenaLobby"
                component={ArenaLobbyScreen}
                options={tx('slide_from_right')}
              />
              <Stack.Screen
                name="ArenaHub"
                component={ArenaHubScreen}
                options={tx('slide_from_right')}
              />
              <Stack.Screen
                name="ArenaWatch"
                component={ArenaWatchScreen}
                options={tx('slide_from_right')}
              />
              <Stack.Screen
                name="ArenaDoors"
                component={ArenaDoorsScreen}
                options={tx('fade')}
              />
              <Stack.Screen
                name="ArenaResult"
                component={ArenaResultScreen}
                options={tx('slide_from_bottom')}
              />
              <Stack.Screen
                name="ArenaLive"
                component={ArenaLiveScreen}
                options={{
                  ...tx('fade'),
                  // No swipe-back and no header: a student cannot gesture
                  // themselves out of a live question by accident, and there is
                  // nowhere to go until the round ends anyway.
                  gestureEnabled: false,
                }}
              />
              <Stack.Screen
                name="Teach"
                component={TeachModal}
                options={{ presentation: 'modal', ...tx('slide_from_bottom') }}
              />
              <Stack.Screen name="Classes" component={ClassesScreen} options={tx('slide_from_right')} />
              <Stack.Screen name="ProgressShare" component={ProgressShareScreen} options={tx('slide_from_right')} />
              <Stack.Screen name="Ambassador" component={AmbassadorScreen} options={tx('slide_from_right')} />
              <Stack.Screen
                name="AvatarEditor"
                component={AvatarEditorScreen}
                options={tx('slide_from_right')}
              />
              <Stack.Screen
                name="Defi"
                component={ChallengeModal}
                options={tx('slide_from_bottom')}
              />
            </>
          )}
        </Stack.Navigator>
        <AuthModal />
        <WelcomeGradeModal />
        <NavTour />
      </NavigationContainer>
    </>
  );
}
