import React, { useEffect, useRef } from 'react';
import { View, Image, Animated } from 'react-native';
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
function SandraModal({ navigation }: any) {
  return <SandraScreen onClose={() => navigation.goBack()} />;
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

  return (
    <View style={{ flex: 1, backgroundColor: '#0857A6', alignItems: 'center', justifyContent: 'center' }}>
      <Animated.Image
        source={require('../../assets/logo.png')}
        style={{ width: 120, height: 120, opacity }}
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
