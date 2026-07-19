import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import useStore from '../contexts/store';
import TabNavigator from './TabNavigator';
import AuthModal from '../components/AuthModal';
import WelcomeLanguageModal from '../components/WelcomeLanguageModal';
import NavTour from '../components/NavTour';
import NetworkStatus from '../components/NetworkStatus';
import SandraScreen from '../screens/SandraScreen';
import StudyPlanScreen from '../screens/StudyPlanScreen';

export type RootParamList = {
  Loading: undefined;
  Main: undefined;
  Sandra: undefined;
  StudyPlan: undefined;
};

const Stack = createNativeStackNavigator<RootParamList>();

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
  } else if (
    p.startsWith('/profile') ||
    p.startsWith('/classement') ||
    p.startsWith('/leaderboard')
  ) {
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

function LoadingScreen() {
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
  // rather than a flat pulsing logo.
  const scale = opacity.interpolate({ inputRange: [0.4, 1], outputRange: [0.96, 1.04] });

  return (
    <LinearGradient
      colors={['#2E86F0', '#1B6FE0', '#0857A6']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.Image
        source={require('../../assets/logo.png')}
        style={{ width: 120, height: 120, opacity, transform: [{ scale }] }}
        resizeMode="contain"
      />
    </LinearGradient>
  );
}

export default function AppNavigator() {
  const authConfirmed = useStore((s) => s.authConfirmed);

  return (
    <>
      <NetworkStatus />
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
          {!authConfirmed ? (
            <Stack.Screen name="Loading" component={LoadingScreen} />
          ) : (
            <>
              <Stack.Screen name="Main" component={TabNavigator} />
              <Stack.Screen
                name="Sandra"
                component={SandraModal}
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="StudyPlan"
                component={StudyPlanModal}
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
            </>
          )}
        </Stack.Navigator>
        <AuthModal />
        <WelcomeLanguageModal />
        <NavTour />
      </NavigationContainer>
    </>
  );
}
