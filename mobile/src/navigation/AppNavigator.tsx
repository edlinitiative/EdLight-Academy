import React from 'react';
import { View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import useStore from '../contexts/store';
import TabNavigator from './TabNavigator';
import AuthModal from '../components/AuthModal';

export type RootParamList = {
  Loading: undefined;
  Main: undefined;
};

const Stack = createNativeStackNavigator<RootParamList>();

function LoadingScreen() {
  return <View style={{ flex: 1, backgroundColor: '#ffffff' }} />;
}

export default function AppNavigator() {
  const authConfirmed = useStore((s) => s.authConfirmed);

  return (
    <>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
          {!authConfirmed ? (
            <Stack.Screen name="Loading" component={LoadingScreen} />
          ) : (
            <Stack.Screen name="Main" component={TabNavigator} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
      <AuthModal />
    </>
  );
}
