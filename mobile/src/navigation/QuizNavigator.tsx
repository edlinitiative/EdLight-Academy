import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import QuizzesScreen from '../screens/QuizzesScreen';
import ExamBrowserScreen from '../screens/ExamBrowserScreen';
import ExamOverviewScreen from '../screens/ExamOverviewScreen';
import ExamTakeScreen from '../screens/ExamTakeScreen';
import ExamResultsScreen from '../screens/ExamResultsScreen';
import ExamHistoryScreen from '../screens/ExamHistoryScreen';
import OfflinePacksScreen from '../screens/OfflinePacksScreen';
import type { PracticeHandoff } from '../utils/learningJourney';
import type { ExamsParamList } from './ExamsNavigator';

/**
 * Quiz stack — the 3rd bottom-bar tab for Quiz-primary grades (7e–8e,
 * NS1–NS3), where practice leads instead of Bac exams. QuizzesScreen is the
 * root and is self-contained (it drives quiz-taking via internal state).
 *
 * Route `Quizzes` takes `{ handoff: practiceParams({...}) }` here AND in the
 * Courses stack (CoursesNavigator `Quizzes`), so a lesson can push practice on
 * its own stack (back returns to the lesson) or switch to this tab.
 *
 * The exam screens (everything but ExamLanding) are registered here too. The
 * tab keeps the route name "Exams" for every grade, so app-wide deep links say
 * `navigate('Exams', { screen: 'ExamOverview' | 'ExamTake' | ... })`. With only
 * `Quizzes` in this stack those links silently fell through to the quiz
 * picker for every 7e–NS3 student: a study-plan exam task opened "Chimie,
 * Choisis un niveau" (TestFlight build 61), and Reprendre on an exam did the
 * same. Pushed with `initial: false`, the quiz picker stays underneath.
 */
export type QuizParamList = {
  /**
   * `handoff` — practice context from a lesson / result / Home, built with
   * `practiceParams()` (utils/learningJourney) and read back with
   * `readPracticeHandoff()`. QuizzesScreen consumes it once, then clears it.
   * `courseId` alone opens that course's chapter list.
   */
  Quizzes: { courseId?: string; handoff?: PracticeHandoff } | undefined;
} & Omit<ExamsParamList, 'ExamLanding'>;

const Stack = createNativeStackNavigator<QuizParamList>();

export default function QuizNavigator() {
  return (
    <Stack.Navigator initialRouteName="Quizzes" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Quizzes" component={QuizzesScreen as any} />
      <Stack.Screen name="ExamBrowser" component={ExamBrowserScreen} />
      <Stack.Screen name="ExamOverview" component={ExamOverviewScreen} />
      <Stack.Screen name="ExamTake" component={ExamTakeScreen} />
      <Stack.Screen name="ExamResults" component={ExamResultsScreen} />
      <Stack.Screen name="ExamHistory" component={ExamHistoryScreen} />
      <Stack.Screen name="OfflinePacks" component={OfflinePacksScreen} />
    </Stack.Navigator>
  );
}
