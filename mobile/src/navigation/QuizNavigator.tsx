import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import QuizzesScreen from '../screens/QuizzesScreen';
import type { PracticeHandoff } from '../utils/learningJourney';

/**
 * Standalone Quiz stack — used as the 3rd bottom-bar tab for Quiz-primary grades
 * (7e–8e, NS1–NS3), where practice leads instead of Bac exams. QuizzesScreen is
 * self-contained (it drives quiz-taking via internal state), so this is a thin
 * single-screen stack; its only external "back" is guarded on stack depth.
 *
 * Route `Quizzes` takes `{ handoff: practiceParams({...}) }` here AND in the
 * Courses stack (CoursesNavigator `Quizzes`), so a lesson can push practice on
 * its own stack (back returns to the lesson) or switch to this tab.
 */
export type QuizParamList = {
  /**
   * `handoff` — practice context from a lesson / result / Home, built with
   * `practiceParams()` (utils/learningJourney) and read back with
   * `readPracticeHandoff()`. QuizzesScreen consumes it once, then clears it.
   * `courseId` alone opens that course's chapter list.
   */
  Quizzes: { courseId?: string; handoff?: PracticeHandoff } | undefined;
};

const Stack = createNativeStackNavigator<QuizParamList>();

export default function QuizNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Quizzes" component={QuizzesScreen as any} />
    </Stack.Navigator>
  );
}
