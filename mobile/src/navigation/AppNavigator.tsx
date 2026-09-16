import React, { useEffect, useRef } from 'react';
import { Animated, View, useWindowDimensions } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
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
import SearchScreen from '../screens/SearchScreen';

export type RootParamList = {
  Loading: undefined;
  Main: undefined;
  Search: undefined;
  Sandra: { ask?: string } | undefined;
  StudyPlan: undefined;
  Leaderboard: undefined;
  Teach: undefined;
  Defi: { code: string };
};

const Stack = createNativeStackNavigator<RootParamList>();

// Ref so out-of-tree callers (e.g. the notification-tap handler in App.tsx) can
// drive navigation without a component's `navigation` prop.
export const navigationRef = createNavigationContainerRef<RootParamList>();

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
    goTab('Exams');
  } else if (p.startsWith('/quiz')) {
    goTab('Courses', { screen: 'Quizzes' });
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

// Deep links: duel invites arrive as edlight://defi/<code> (from the share
// message) or https://academy.edlight.org/defi/<code> (the web landing's
// "Ouvrir dans l'app" button). Other routes are deliberately unmapped — in-app
// navigation for them already flows through navigationRef / notifications.
const linking = {
  prefixes: ['edlight://', 'https://academy.edlight.org'],
  config: {
    screens: {
      Defi: 'defi/:code',
    },
  },
};

/** Must stay in sync with expo.splash.backgroundColor in app.json. */
const SPLASH_BACKGROUND = '#FFFFFF';

/**
 * Continuation of the native splash, not a second screen.
 *
 * App.tsx now holds the native splash until the first real screen is ready, so
 * this is only reached when the splash's safety timeout fires (a stalled auth
 * handshake on a cold start). When that happens it must be indistinguishable
 * from the splash it replaces: the SAME asset — assets/splash.png and
 * assets/logo.png are byte-identical — at the same `contain` scale, on the same
 * background. The old version drew it at 120pt on the themed ground, which is
 * what made a cold launch look like two different logos.
 */
function LoadingScreen() {
  const opacity = useRef(new Animated.Value(0.55)).current;
  const { width, height } = useWindowDimensions();

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.55, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // `resizeMode: "contain"` on the native splash fits the square logo to the
  // screen's shorter side. Match that exactly, or the logo visibly resizes at
  // the handoff. Only opacity animates — a scale would change its size, which
  // is the very thing being reported.
  const side = Math.min(width, height);

  return (
    // Matches expo.splash.backgroundColor in app.json. Not the themed bg: the
    // native splash is this color, and stepping to the app ground here would
    // just move the flash earlier.
    <View style={{ flex: 1, backgroundColor: SPLASH_BACKGROUND, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.Image
        source={require('../../assets/splash.png')}
        style={{ width: side, height: side, opacity }}
        resizeMode="contain"
      />
    </View>
  );
}

export default function AppNavigator() {
  const authConfirmed = useStore((s) => s.authConfirmed);

  return (
    <>
      <NetworkStatus />
      <NavigationContainer ref={navigationRef} linking={linking}>
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
          {!authConfirmed ? (
            <Stack.Screen name="Loading" component={LoadingScreen} />
          ) : (
            <>
              <Stack.Screen name="Main" component={TabNavigator} />
              <Stack.Screen
                name="Search"
                component={SearchModal}
                options={{ animation: 'fade', animationDuration: 120 }}
              />
              <Stack.Screen
                name="Sandra"
                component={SandraModal}
                // Full-screen card (not a native 'modal'): native-stack modals on
                // iOS break KeyboardAvoidingView (chat input hid behind the
                // keyboard) and layer the auth modal underneath. A card that
                // slides up keeps the same feel and fixes both.
                options={{ animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="StudyPlan"
                component={StudyPlanModal}
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="Leaderboard"
                component={LeaderboardModal}
                options={{ animation: 'slide_from_right' }}
              />
              <Stack.Screen
                name="Teach"
                component={TeachModal}
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="Defi"
                component={ChallengeModal}
                options={{ animation: 'slide_from_bottom' }}
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
