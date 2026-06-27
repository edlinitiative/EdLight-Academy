import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import CoursesScreen from '../screens/CoursesScreen';
import CourseDetailScreen from '../screens/CourseDetailScreen';
import QuizzesScreen from '../screens/QuizzesScreen';

export type CoursesParamList = {
  CourseList: undefined;
  CourseDetail: { courseId: string; courseName?: string };
  Quizzes: { courseId?: string };
};

const Stack = createNativeStackNavigator<CoursesParamList>();

export default function CoursesNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CourseList" component={CoursesScreen} />
      <Stack.Screen name="CourseDetail" component={CourseDetailScreen} />
      <Stack.Screen name="Quizzes" component={QuizzesScreen} />
    </Stack.Navigator>
  );
}
