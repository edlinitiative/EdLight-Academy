import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

// Floating pill bar (Instagram-style): detached from the screen edge, rounded,
// elevated. Sized explicitly so labels never clip, whatever the device width.
const BAR_HEIGHT = 62;
const BAR_MARGIN = 16;

export default function TabNavigator() {
  const theme = useStore((s) => s.theme);
  const insets = useSafeAreaInsets();
  const dark = theme === 'dark';
  const bg = dark ? '#111827' : '#ffffff';

  // Float above the home indicator on notched phones, 12px above the edge elsewhere.
  const bottomOffset = Math.max(insets.bottom, 12);

  return (
    <Tab.Navigator
      sceneContainerStyle={{
        backgroundColor: dark ? '#0b1220' : '#f4f6fb',
        paddingBottom: BAR_HEIGHT + bottomOffset,
      }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACTIVE,
        tabBarInactiveTintColor: INACTIVE,
        tabBarAllowFontScaling: false,
        tabBarStyle: {
          position: 'absolute',
          left: BAR_MARGIN,
          right: BAR_MARGIN,
          bottom: bottomOffset,
          height: BAR_HEIGHT,
          borderRadius: BAR_HEIGHT / 2,
          backgroundColor: bg,
          borderTopWidth: 0,
          paddingTop: 8,
          paddingBottom: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: dark ? 0.5 : 0.14,
          shadowRadius: 18,
          elevation: 12,
        },
        tabBarItemStyle: { paddingHorizontal: 0 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
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
          tabBarLabel: 'Exams',
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
