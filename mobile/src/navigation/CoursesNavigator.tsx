import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import CoursesScreen from '../screens/CoursesScreen';
import CourseDetailScreen from '../screens/CourseDetailScreen';
import QuizzesScreen from '../screens/QuizzesScreen';

export type CoursesParamList = {
  /** `resetAt`: a nonce that clears the retained level/subject/search drill-down,
   *  so entry points like Home's "Voir tout" always land on the catalog root
   *  instead of whatever sub-list the student left behind. */
  CourseList: { resetAt?: number } | undefined;
  CourseDetail: {
    courseId: string;
    courseName?: string;
    /** Reopen this exact lesson (Reprendre / notification deep links). */
    lessonId?: string;
    /** Auto-open the first unfinished lesson so the tap lands on a playable page. */
    autoplay?: boolean;
  };
  Quizzes: { courseId?: string };
};

const Stack = createNativeStackNavigator<CoursesParamList>();

export default function CoursesNavigator() {
  return (
    <Stack.Navigator initialRouteName="CourseList" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CourseList" component={CoursesScreen} />
      <Stack.Screen name="CourseDetail" component={CourseDetailScreen} />
      <Stack.Screen name="Quizzes" component={QuizzesScreen} />
    </Stack.Navigator>
  );
}
