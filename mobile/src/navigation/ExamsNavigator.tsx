import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ExamLandingScreen from '../screens/ExamLandingScreen';
import ExamBrowserScreen from '../screens/ExamBrowserScreen';
import ExamTakeScreen from '../screens/ExamTakeScreen';
import ExamResultsScreen from '../screens/ExamResultsScreen';

export type ExamsParamList = {
  ExamLanding: undefined;
  ExamBrowser: { level: string; subject?: string };
  ExamTake: { level: string; examId: string };
  ExamResults: { level: string; examId: string };
};

const Stack = createNativeStackNavigator<ExamsParamList>();

export default function ExamsNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ExamLanding" component={ExamLandingScreen} />
      <Stack.Screen name="ExamBrowser" component={ExamBrowserScreen} />
      <Stack.Screen name="ExamTake" component={ExamTakeScreen} />
      <Stack.Screen name="ExamResults" component={ExamResultsScreen} />
    </Stack.Navigator>
  );
}
