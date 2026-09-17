import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, useColorScheme } from 'react-native';
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

  useEffect(() => {
    // A slow in-and-out, not a pulse: 6% is enough to read as alive at this
    // size, and anything faster starts to look like a loading spinner.
    Animated.loop(
      Animated.sequence([
        Animated.timing(zoom, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(zoom, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    ).start();
  }, [zoom]);

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
