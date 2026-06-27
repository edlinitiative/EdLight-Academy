import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { LayoutDashboard, BookOpen, ClipboardList, Zap, User } from 'lucide-react-native';
import useStore from '../contexts/store';

import DashboardScreen from '../screens/DashboardScreen';
import CoursesNavigator from './CoursesNavigator';
import ExamsNavigator from './ExamsNavigator';
import TriviaScreen from '../screens/TriviaScreen';
import ProfileScreen from '../screens/ProfileScreen';

export type TabParamList = {
  Dashboard: undefined;
  Courses: undefined;
  Exams: undefined;
  Trivia: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

const ACTIVE = '#0857A6';
const INACTIVE = '#9ca3af';

export default function TabNavigator() {
  const { theme } = useStore();
  const dark = theme === 'dark';
  const bg = dark ? '#111827' : '#ffffff';
  const border = dark ? '#1f2937' : '#e5e7eb';

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACTIVE,
        tabBarInactiveTintColor: INACTIVE,
        tabBarStyle: { backgroundColor: bg, borderTopColor: border, height: 60, paddingBottom: 8 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarLabel: 'Accueil',
          tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Courses"
        component={CoursesNavigator}
        options={{
          tabBarLabel: 'Cours',
          tabBarIcon: ({ color, size }) => <BookOpen color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Exams"
        component={ExamsNavigator}
        options={{
          tabBarLabel: 'Examens',
          tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Trivia"
        component={TriviaScreen}
        options={{
          tabBarLabel: 'Trivia',
          tabBarIcon: ({ color, size }) => <Zap color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profil',
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
}
