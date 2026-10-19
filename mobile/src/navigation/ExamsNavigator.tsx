import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ExamLandingScreen from '../screens/ExamLandingScreen';
import ExamBrowserScreen from '../screens/ExamBrowserScreen';
import ExamOverviewScreen from '../screens/ExamOverviewScreen';
import ExamTakeScreen from '../screens/ExamTakeScreen';
import ExamResultsScreen from '../screens/ExamResultsScreen';
import ExamHistoryScreen from '../screens/ExamHistoryScreen';
import OfflinePacksScreen from '../screens/OfflinePacksScreen';
import QuizzesScreen from '../screens/QuizzesScreen';
import type { PracticeHandoff } from '../utils/learningJourney';

/**
 * The 3rd tab's stack, for EVERY grade. Until TestFlight build 63, 7e–8e and
 * NS1–NS3 mounted a separate Quiz stack here instead, so those students never
 * saw ExamLanding at all. Quick practice now lives in this stack as `Quizzes`
 * (pushed over the landing, so back returns to it); the Courses stack keeps
 * its own `Quizzes` route for practice launched from a lesson.
 */
export type ExamsParamList = {
  ExamLanding: undefined;
  /**
   * Quick practice (QuizzesScreen). `handoff` is built with `practiceParams()`
   * (utils/learningJourney); `courseId` alone opens that course's chapters.
   */
  Quizzes: { courseId?: string; handoff?: PracticeHandoff } | undefined;
  /** `explicit`: the level was chosen on the landing switch — no grade curation. */
  ExamBrowser: { level: string; subject?: string; explicit?: boolean };
  /** Coursera-style exam landing: stats, structure, attempts, one clear CTA. */
  ExamOverview: { level: string; examId: string };
  /** `autostart` skips the in-screen intro (set when coming from ExamOverview
   *  or a resume card); a plain deep link still gets the intro. */
  ExamTake: { level: string; examId: string; autostart?: boolean };
  ExamResults: { level: string; examId: string };
  /** "Mes résultats" — every submitted exam, newest first. */
  ExamHistory: undefined;
  /** "Hors ligne": downloadable exam and practice packs, storage management. */
  OfflinePacks: { kind?: 'exam' | 'practice'; level?: string } | undefined;
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
      <Stack.Screen name="OfflinePacks" component={OfflinePacksScreen} />
      <Stack.Screen name="Quizzes" component={QuizzesScreen as any} />
    </Stack.Navigator>
  );
}
