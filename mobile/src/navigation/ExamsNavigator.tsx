import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ExamLandingScreen from '../screens/ExamLandingScreen';
import ExamBrowserScreen from '../screens/ExamBrowserScreen';
import ExamOverviewScreen from '../screens/ExamOverviewScreen';
import ExamTakeScreen from '../screens/ExamTakeScreen';
import ExamResultsScreen from '../screens/ExamResultsScreen';
import ExamHistoryScreen from '../screens/ExamHistoryScreen';

export type ExamsParamList = {
  ExamLanding: undefined;
  ExamBrowser: { level: string; subject?: string };
  /** Coursera-style exam landing: stats, structure, attempts, one clear CTA. */
  ExamOverview: { level: string; examId: string };
  /** `autostart` skips the in-screen intro (set when coming from ExamOverview
   *  or a resume card); a plain deep link still gets the intro. */
  ExamTake: { level: string; examId: string; autostart?: boolean };
  ExamResults: { level: string; examId: string };
  /** "Mes résultats" — every submitted exam, newest first. */
  ExamHistory: undefined;
};

const Stack = createNativeStackNavigator<ExamsParamList>();

export default function ExamsNavigator() {
  return (
    <Stack.Navigator initialRouteName="ExamLanding" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ExamLanding" component={ExamLandingScreen} />
      <Stack.Screen name="ExamBrowser" component={ExamBrowserScreen} />
      <Stack.Screen name="ExamOverview" component={ExamOverviewScreen} />
      <Stack.Screen name="ExamTake" component={ExamTakeScreen} />
      <Stack.Screen name="ExamResults" component={ExamResultsScreen} />
      <Stack.Screen name="ExamHistory" component={ExamHistoryScreen} />
    </Stack.Navigator>
  );
}
