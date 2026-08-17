/**
 * NativeTabNavigator — the REAL iOS tab bar (UITabBarController).
 * ---------------------------------------------------------------------------
 * The reference (Ted's Ledger app) is a stock SwiftUI `TabView` with nothing but
 * `.tint(Ink.brass)` — verified: zero tab-bar customisation in that codebase. So
 * everything admired in it (Liquid Glass, the selection capsule, the metrics,
 * drag-along-the-bar to switch tabs, minimize-on-scroll) is the SYSTEM bar, and
 * no amount of styling a React Native View reproduces it. This renders the
 * actual UIKit control instead, so those behaviours are the OS's, not ours.
 *
 * iOS only. Android keeps the JS bar (see TabNavigator.tsx) because the native
 * Android bar takes bitmap `ImageSourcePropType` icons and this project has no
 * tab icon assets — SF Symbols have no Android equivalent.
 *
 * Everything the JS bar did is preserved: adaptive 3rd tab, bilingual labels,
 * focus-mode hiding, pop-to-root on tab press, and double-tap-to-refresh.
 */
import React, { useRef } from 'react';
import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation';
import { useQueryClient } from '@tanstack/react-query';
import useStore from '../contexts/store';
import { gradeProfile } from '../config/trackConfig';
import { lightColors, darkColors } from '../theme/theme';
import { popToRootOnTabPress } from './tabPressBehaviour';

import DashboardScreen from '../screens/DashboardScreen';
import CoursesNavigator from './CoursesNavigator';
import ExamsNavigator from './ExamsNavigator';
import QuizNavigator from './QuizNavigator';
import TriviaScreen from '../screens/TriviaScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createNativeBottomTabNavigator();

/** Two taps on the SAME tab within this window trigger a data refresh. */
const DOUBLE_TAP_MS = 350;

/** Filled SF Symbols — the same family and weight the reference draws from. */
const SF = {
  dashboard: 'square.grid.2x2.fill',
  courses: 'books.vertical.fill',
  exams: 'list.bullet.clipboard.fill',
  quiz: 'checklist',
  games: 'gamecontroller.fill',
  profile: 'person.fill',
} as const;

const icon = (sfSymbol: string) => () => ({ sfSymbol } as any);

export default function NativeTabNavigator() {
  const theme = useStore((s) => s.theme);
  const language = useStore((s) => s.language);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);
  const focusMode = useStore((s) => s.focusMode);
  const grade = useStore((s) => s.grade);
  // Adaptive 3rd tab: Quiz-primary grades (7e–8e, NS1–NS3) get a Quiz tab where
  // Exams would be. Route name stays "Exams" so navigate('Exams') keeps working.
  const quizPrimary = gradeProfile(grade).primaryTab === 'Quiz';
  const dark = theme === 'dark';
  const queryClient = useQueryClient();
  const lastPress = useRef<{ name: string; time: number }>({ name: '', time: 0 });

  return (
    <Tab.Navigator
      // The system bar tints exactly like SwiftUI's `.tint()`.
      tabBarActiveTintColor={dark ? darkColors.azure : lightColors.azure}
      tabBarInactiveTintColor={dark ? darkColors.muted : lightColors.muted}
      // iOS 26: the bar shrinks away as content scrolls down and returns on the
      // way back up — the "can you make it disappear on scrolling?" ask, done by
      // the OS rather than by us animating a View.
      minimizeBehavior="onScrollDown"
      // Matches the JS bar's press haptic.
      hapticFeedbackEnabled
      // Exam-taking and gameplay hide the bar so it can never cover a screen's
      // own submit/next controls.
      tabBarHidden={focusMode}
      screenListeners={({ route }) => ({
        tabPress: () => {
          const now = Date.now();
          const prev = lastPress.current;
          if (prev.name === route.name && now - prev.time < DOUBLE_TAP_MS) {
            // Only refresh what's on screen; a blanket invalidate refetched the
            // heavy exam catalog on a stray double tap.
            queryClient.invalidateQueries({ type: 'active' });
            lastPress.current = { name: '', time: 0 };
          } else {
            lastPress.current = { name: route.name, time: now };
          }
        },
      })}
      screenOptions={{
        sceneStyle: { backgroundColor: dark ? darkColors.bg : lightColors.bg },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ tabBarLabel: t('Accueil', 'Akèy'), tabBarIcon: icon(SF.dashboard) }}
      />
      <Tab.Screen
        name="Courses"
        component={CoursesNavigator}
        listeners={({ navigation }) => ({
          tabPress: popToRootOnTabPress(navigation, 'Courses', 'CourseList', () => ({
            resetAt: Date.now(),
          })),
        })}
        options={{ tabBarLabel: t('Cours', 'Kou'), tabBarIcon: icon(SF.courses) }}
      />
      <Tab.Screen
        name="Exams"
        component={quizPrimary ? QuizNavigator : ExamsNavigator}
        listeners={quizPrimary ? undefined : ({ navigation }) => ({
          tabPress: popToRootOnTabPress(navigation, 'Exams', 'ExamLanding'),
        })}
        options={{
          tabBarLabel: quizPrimary ? t('Quiz', 'Quiz') : t('Examens', 'Egzamen'),
          tabBarIcon: icon(quizPrimary ? SF.quiz : SF.exams),
        }}
      />
      <Tab.Screen
        name="Trivia"
        component={TriviaScreen}
        options={{ tabBarLabel: t('Jeux', 'Jwèt'), tabBarIcon: icon(SF.games) }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarLabel: t('Profil', 'Pwofil'), tabBarIcon: icon(SF.profile) }}
      />
    </Tab.Navigator>
  );
}
