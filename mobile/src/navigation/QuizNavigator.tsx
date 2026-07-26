import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import QuizzesScreen from '../screens/QuizzesScreen';

/**
 * Standalone Quiz stack — used as the 3rd bottom-bar tab for Quiz-primary grades
 * (7e–8e, NS1–NS3), where practice leads instead of Bac exams. QuizzesScreen is
 * self-contained (it drives quiz-taking via internal state), so this is a thin
 * single-screen stack; its only external "back" is guarded on canGoBack.
 */
export type QuizParamList = {
  Quizzes: { courseId?: string } | undefined;
};

const Stack = createNativeStackNavigator<QuizParamList>();

export default function QuizNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Quizzes" component={QuizzesScreen as any} />
    </Stack.Navigator>
  );
}
