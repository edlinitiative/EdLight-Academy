import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, BookOpen, ClipboardList, ListChecks, Gamepad2, User } from 'lucide-react-native';
import useStore from '../contexts/store';
import { gradeProfile } from '../config/trackConfig';
import { tapLight } from '../utils/haptics';
import { useReduceMotion } from '../utils/motion';
import { lightColors, darkColors, typeScale, fonts } from '../theme/theme';

import DashboardScreen from '../screens/DashboardScreen';
import CoursesNavigator from './CoursesNavigator';
import ExamsNavigator from './ExamsNavigator';
import QuizNavigator from './QuizNavigator';
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

// Tab tints come straight from the palette so the active/inactive hierarchy
// matches the rest of the app. The old near-black inactive (#111827) killed the
// contrast with the active brand color; the muted token restores it.
const ACTIVE = lightColors.azure; // '#1B6FE0'
const INACTIVE = lightColors.muted; // '#64748b'

// Floating "liquid glass" bar (native iOS 26 TabView look): a detached
// translucent capsule where each item is an icon+label column, and the focused
// item sits inside its own frosted lens capsule.
const BAR_HEIGHT = 56;
const BAR_MARGIN = 16;
const ICON_SIZE = 20;

// Two taps on the SAME tab within this window trigger a data refresh.
const DOUBLE_TAP_MS = 350;

// One "liquid glass" tab item: icon + label as a single column, with the
// focused lens capsule wrapping BOTH (like the native iOS 26 TabView) instead
// of a highlight behind the icon alone. The lens glides in (opacity + scale);
// reduce-motion collapses the transition to an instant state change.
function TabItem({
  Icon,
  label,
  color,
  focused,
  dark,
}: {
  Icon: typeof LayoutDashboard;
  label: string;
  color: string;
  focused: boolean;
  dark: boolean;
}) {
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    const target = focused ? 1 : 0;
    progress.value = reduceMotion ? target : withTiming(target, { duration: 220 });
  }, [focused, reduceMotion, progress]);

  const lensStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.86 + progress.value * 0.14 }],
  }));

  // Frosted lens: a light glass tint with a thin edge, not a flat brand fill.
  const lensBg = dark ? 'rgba(76,154,245,0.22)' : 'rgba(255,255,255,0.85)';
  const lensEdge = dark ? 'rgba(148,163,184,0.25)' : 'rgba(27,111,224,0.18)';

  return (
    <View style={styles.item}>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: 15,
            backgroundColor: lensBg,
            borderWidth: 1,
            borderColor: lensEdge,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: dark ? 0.3 : 0.08,
            shadowRadius: 5,
          },
          lensStyle,
        ]}
      />
      <Icon color={color} size={ICON_SIZE} />
      <Text
        allowFontScaling
        maxFontSizeMultiplier={1.3}
        numberOfLines={1}
        style={[typeScale.micro, { fontSize: 9.5, lineHeight: 11, marginTop: 2, color, fontFamily: focused ? fonts.bold : fonts.medium }]}
      >
        {label}
      </Text>
    </View>
  );
}

export default function TabNavigator() {
  const theme = useStore((s) => s.theme);
  const language = useStore((s) => s.language);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);
  const focusMode = useStore((s) => s.focusMode);
  // Adaptive 3rd tab: Quiz-primary grades (7e–8e, NS1–NS3) get a Quiz tab where
  // Exams would be, so practice leads instead of Bac exams. Route name stays
  // "Exams" so navigate('Exams') keeps working everywhere.
  const grade = useStore((s) => s.grade);
  const quizPrimary = gradeProfile(grade).primaryTab === 'Quiz';
  const insets = useSafeAreaInsets();
  const dark = theme === 'dark';
  const queryClient = useQueryClient();

  // Tracks the last tab press so we can detect a quick double-tap on the same tab.
  const lastPress = useRef<{ name: string; time: number }>({ name: '', time: 0 });

  // Float above the home indicator on notched phones, 12px above the edge elsewhere.
  const bottomOffset = Math.max(insets.bottom, 12);

  return (
    <Tab.Navigator
      // No paddingBottom here: content scrolls UNDER the translucent floating bar
      // (each screen adds its own bottom padding so nothing is permanently hidden).
      sceneContainerStyle={{
        backgroundColor: dark ? '#0b1220' : '#f4f6fb',
      }}
      screenListeners={({ route }) => ({
        // Single tap keeps default behavior (navigate / pop-to-top of the stack).
        // A second tap on the same tab within DOUBLE_TAP_MS refreshes all data.
        tabPress: () => {
          tapLight();
          const now = Date.now();
          const prev = lastPress.current;
          if (prev.name === route.name && now - prev.time < DOUBLE_TAP_MS) {
            // Only refresh what's currently on screen. A blanket invalidate
            // refetched every cached query (incl. the heavy exam catalog) on a
            // stray double tap — expensive on slow/metered connections.
            queryClient.invalidateQueries({ type: 'active' });
            lastPress.current = { name: '', time: 0 };
          } else {
            lastPress.current = { name: route.name, time: now };
          }
        },
      })}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: dark ? darkColors.azure : ACTIVE,
        tabBarInactiveTintColor: dark ? darkColors.muted : INACTIVE,
        // Icon+label are rendered together inside TabItem so the focused lens
        // capsule can wrap both — hide the navigator's own labels.
        tabBarShowLabel: false,
        // Liquid glass: a strong BlurView with only a whisper of overlay, so
        // the content genuinely refracts through the bar like the native
        // iOS 26 TabView, plus a thin light rim for the glass edge.
        tabBarBackground: () => (
          <BlurView
            intensity={dark ? 55 : 75}
            tint={dark ? 'dark' : 'light'}
            style={[StyleSheet.absoluteFill, { borderRadius: BAR_HEIGHT / 2, overflow: 'hidden' }]}
          >
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: dark ? 'rgba(17,24,39,0.28)' : 'rgba(255,255,255,0.22)' },
              ]}
            />
          </BlurView>
        ),
        // Focus mode (exam-taking, trivia gameplay) hides the floating bar so it
        // never overlaps a screen's own bottom actions (e.g. the Submit button).
        tabBarStyle: focusMode
          ? { display: 'none' }
          : {
              position: 'absolute',
              left: BAR_MARGIN,
              right: BAR_MARGIN,
              bottom: bottomOffset,
              height: BAR_HEIGHT,
              borderRadius: BAR_HEIGHT / 2,
              backgroundColor: 'transparent',
              borderTopWidth: 0,
              borderWidth: 1,
              borderColor: dark ? 'rgba(148,163,184,0.18)' : 'rgba(255,255,255,0.6)',
              overflow: 'hidden',
              paddingTop: 7,
              paddingBottom: 7,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: dark ? 0.5 : 0.14,
              shadowRadius: 18,
              elevation: 12,
            },
        tabBarItemStyle: { paddingHorizontal: 0 },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarAccessibilityLabel: t('Accueil', 'Akèy'),
          tabBarIcon: ({ color, focused }) => (
            <TabItem Icon={LayoutDashboard} label={t('Accueil', 'Akèy')} color={color} focused={focused} dark={dark} />
          ),
        }}
      />
      <Tab.Screen
        name="Courses"
        component={CoursesNavigator}
        options={{
          tabBarAccessibilityLabel: t('Cours', 'Kou'),
          tabBarIcon: ({ color, focused }) => (
            <TabItem Icon={BookOpen} label={t('Cours', 'Kou')} color={color} focused={focused} dark={dark} />
          ),
        }}
      />
      <Tab.Screen
        name="Exams"
        component={quizPrimary ? QuizNavigator : ExamsNavigator}
        listeners={quizPrimary ? undefined : ({ navigation }) => ({
          // Tapping "Examens" should land on the exam home (the level/subject
          // picker) — not resume whatever the nested stack retained (a specific
          // exam list, or the in-progress ExamTake the user just left). Because
          // ExamTake hides the tab bar, the user always leaves the exam before
          // tapping the tab, so the retained top is a stale exam context. Reset
          // the stack to ExamLanding whenever it isn't already there.
          // (In-progress answers aren't lost — the "Reprendre" banner resumes.)
          tabPress: (e) => {
            const examsRoute = navigation
              .getState()
              .routes.find((r: any) => r.name === 'Exams') as any;
            const nested = examsRoute?.state;
            if (!nested) return; // stack not initialized yet → default (ExamLanding)
            const topName = nested.routes[nested.index ?? nested.routes.length - 1]?.name;
            if (topName && topName !== 'ExamLanding') {
              e.preventDefault();
              (navigation as any).navigate('Exams', { screen: 'ExamLanding' });
            }
          },
        })}
        options={{
          tabBarAccessibilityLabel: quizPrimary ? t('Quiz', 'Quiz') : t('Examens', 'Egzamen'),
          tabBarIcon: ({ color, focused }) => (
            <TabItem
              Icon={quizPrimary ? ListChecks : ClipboardList}
              label={quizPrimary ? t('Quiz', 'Quiz') : t('Examens', 'Egzamen')}
              color={color}
              focused={focused}
              dark={dark}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Trivia"
        component={TriviaScreen}
        options={{
          tabBarAccessibilityLabel: t('Jeux', 'Jwèt'),
          tabBarIcon: ({ color, focused }) => (
            <TabItem Icon={Gamepad2} label={t('Jeux', 'Jwèt')} color={color} focused={focused} dark={dark} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarAccessibilityLabel: t('Profil', 'Pwofil'),
          tabBarIcon: ({ color, focused }) => (
            <TabItem Icon={User} label={t('Profil', 'Pwofil')} color={color} focused={focused} dark={dark} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  item: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 13,
    paddingVertical: 4,
    borderRadius: 15,
    minWidth: 58,
  },
});
