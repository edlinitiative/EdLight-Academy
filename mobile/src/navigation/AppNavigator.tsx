import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import useStore from '../contexts/store';
import { useColors } from '../theme/theme';
import TabNavigator from './TabNavigator';
import AuthModal from '../components/AuthModal';
import WelcomeGradeModal from '../components/WelcomeGradeModal';
import NavTour from '../components/NavTour';
import NetworkStatus from '../components/NetworkStatus';
import SandraScreen from '../screens/SandraScreen';
import StudyPlanScreen from '../screens/StudyPlanScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';
import ChallengeScreen from '../screens/ChallengeScreen';

export type RootParamList = {
  Loading: undefined;
  Main: undefined;
  Sandra: undefined;
  StudyPlan: undefined;
  Leaderboard: undefined;
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

function SandraModal({ navigation }: any) {
  return (
    <SandraScreen
      onClose={() => navigation.goBack()}
      onNavigate={(path) => navigateFromSandra(navigation, path)}
    />
  );
}
function StudyPlanModal({ navigation }: any) {
  return <StudyPlanScreen onClose={() => navigation.goBack()} />;
}
function LeaderboardModal({ navigation }: any) {
  return <LeaderboardScreen onClose={() => navigation.goBack()} />;
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

function LoadingScreen() {
  const colors = useColors();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Gentle "breathing" — opacity + a subtle scale so the splash feels alive
  // rather than a flat pulsing logo. Themed background so a dark-mode user
  // doesn't get a full-screen white flash on every cold launch.
  const scale = opacity.interpolate({ inputRange: [0.4, 1], outputRange: [0.96, 1.04] });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.Image
        source={require('../../assets/logo.png')}
        style={{ width: 120, height: 120, opacity, transform: [{ scale }] }}
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
