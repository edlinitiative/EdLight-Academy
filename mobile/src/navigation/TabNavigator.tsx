import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { CommonActions } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import TabIcon, { type TabIconName } from './TabIcon';
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

// Tab tints. Inactive is near-ink on purpose: this bar follows the Ledger app's
// tab bar (stock iOS TabView, `.tint(brass)`), where unselected items are heavy
// dark glyphs and the selected one is separated by BOTH the accent hue and a
// capsule behind it. An earlier pass here lightened inactive to `muted` to keep
// it off the active color — with two state signals instead of one, the darker
// treatment reads better and matches the reference.
const ACTIVE = lightColors.azure; // '#1B6FE0'
const INACTIVE = lightColors.ink; // '#0f172a'

// Floating bar, Ledger-style: a detached TRANSLUCENT capsule. A light-mode
// screenshot of the reference looked solid white, so an earlier pass made this
// opaque — wrong: it only looked solid because it was blurring a near-white
// ground. In dark mode the reference is visibly see-through (page text reads
// through it), so it is glass in both themes.
// 58 with 5pt padding leaves a 48pt touch height: tighter than the old 60, still
// clear of Apple's 44pt floor on the control every user touches every session.
const BAR_HEIGHT = 58;
const BAR_MARGIN = 20;
// 23, up from 20, to match the reference's optical size. The glyphs themselves
// are now real filled SF Symbols on iOS (see TabIcon.tsx) rather than Lucide
// outlines, which is what actually closed the gap to the reference.
const ICON_SIZE = 23;

// Two taps on the SAME tab within this window trigger a data refresh.
const DOUBLE_TAP_MS = 350;

/**
 * Builds a `tabPress` handler that sends a tab back to its stack root.
 *
 * The trap this exists to avoid: `e.preventDefault()` cancels the TAB SWITCH,
 * and a reset dispatched with `target: <nested stack key>` only rewrites that
 * inner stack — it never changes which tab is active. Calling preventDefault
 * unconditionally therefore made the tab look completely dead when pressed from
 * a different tab ("it does nothing when i click on it"). So: only intercept
 * when the tab is ALREADY focused; otherwise let the navigator do the switch and
 * simply clear the stale inner stack on the way in.
 */
function popToRootOnTabPress(
  navigation: any,
  tabName: string,
  rootName: string,
  makeParams?: () => object,
) {
  return (e: { preventDefault: () => void }) => {
    const state = navigation.getState();
    const nested = (state.routes.find((r: any) => r.name === tabName) as any)?.state;
    // Stack not built yet → the default action lands on its initial route anyway.
    if (!nested) return;
    const top = nested.routes[nested.index ?? nested.routes.length - 1]?.name;
    // Already showing the root: do nothing, so useScrollToTop still fires.
    if (top === rootName) return;
    const isFocused = state.routes[state.index]?.name === tabName;
    // Stay put and pop to the root. When NOT focused we must let the default
    // run, or the tab never changes.
    if (isFocused) e.preventDefault();
    navigation.dispatch({
      ...CommonActions.reset({
        index: 0,
        routes: [{ name: rootName, params: makeParams?.() }],
      }),
      target: nested.key,
    });
  };
}

// One tab item: icon + label as a single column, with the focused capsule
// wrapping BOTH. The capsule is a NEUTRAL fill, not a brand tint — in the
// reference the accent lives only in the icon and label, which keeps the bar
// quiet and lets the selected item read as "lifted" rather than "coloured in".
// It fades/scales in; reduce-motion collapses that to an instant state change.
function TabItem({
  icon,
  label,
  color,
  focused,
  dark,
}: {
  icon: TabIconName;
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
    transform: [{ scale: 0.9 + progress.value * 0.1 }],
  }));

  // A neutral step off the bar's own surface — darker in light mode, lighter in
  // dark. No border and no shadow: the reference capsule is a flat tonal shift.
  const lensBg = dark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)';

  return (
    <View style={styles.item}>
      <Animated.View
        pointerEvents="none"
        style={[
          // Inset horizontally so the capsule reads as its own pill and never
          // crowds the neighbouring tab.
          { position: 'absolute', top: 0, bottom: 0, left: 4, right: 4 },
          { borderRadius: 999, backgroundColor: lensBg },
          lensStyle,
        ]}
      />
      <TabIcon name={icon} color={color} size={ICON_SIZE} focused={focused} />
      <Text
        allowFontScaling
        maxFontSizeMultiplier={1.3}
        numberOfLines={1}
        // 11pt with no fixed lineHeight: 9.5pt sat below the practical legibility
        // floor, and a hard 11pt lineHeight clipped descenders on "Examens" /
        // "Egzamen" once Dynamic Type scaled the text up.
        style={[typeScale.micro, { fontSize: 11, marginTop: 2, color, fontFamily: focused ? fonts.bold : fonts.medium }]}
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
        // Translucent capsule: a strong blur with only a whisper of tint, so page
        // content genuinely shows through the bar the way the reference does.
        tabBarBackground: () => (
          <BlurView
            intensity={dark ? 60 : 80}
            tint={dark ? 'dark' : 'light'}
            style={[StyleSheet.absoluteFill, { borderRadius: BAR_HEIGHT / 2, overflow: 'hidden' }]}
          >
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: dark ? 'rgba(17,24,39,0.30)' : 'rgba(255,255,255,0.45)' },
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
              // A thin light rim reads as the glass edge on a translucent pill.
              borderWidth: 1,
              borderColor: dark ? 'rgba(148,163,184,0.18)' : 'rgba(255,255,255,0.55)',
              overflow: 'hidden',
              paddingTop: 5,
              paddingBottom: 5,
              // Softer and lower than the old glass bar: an opaque pill needs a
              // diffuse lift, not a hard drop.
              shadowColor: '#0f172a',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: dark ? 0.45 : 0.10,
              shadowRadius: 14,
              elevation: 10,
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
            <TabItem icon="dashboard" label={t('Accueil', 'Akèy')} color={color} focused={focused} dark={dark} />
          ),
        }}
      />
      <Tab.Screen
        name="Courses"
        component={CoursesNavigator}
        listeners={({ navigation }) => ({
          // Tapping "Cours" always lands on the catalog root, never a retained
          // lesson. The `resetAt` nonce also clears CourseList's own
          // level/subject drill-down, which is local state the navigator can't see.
          tabPress: popToRootOnTabPress(navigation, 'Courses', 'CourseList', () => ({
            resetAt: Date.now(),
          })),
        })}
        options={{
          tabBarAccessibilityLabel: t('Cours', 'Kou'),
          tabBarIcon: ({ color, focused }) => (
            <TabItem icon="courses" label={t('Cours', 'Kou')} color={color} focused={focused} dark={dark} />
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
          tabPress: popToRootOnTabPress(navigation, 'Exams', 'ExamLanding'),
        })}
        options={{
          tabBarAccessibilityLabel: quizPrimary ? t('Quiz', 'Quiz') : t('Examens', 'Egzamen'),
          tabBarIcon: ({ color, focused }) => (
            <TabItem
              icon={quizPrimary ? 'quiz' : 'exams'}
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
            <TabItem icon="games" label={t('Jeux', 'Jwèt')} color={color} focused={focused} dark={dark} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarAccessibilityLabel: t('Profil', 'Pwofil'),
          tabBarIcon: ({ color, focused }) => (
            <TabItem icon="profile" label={t('Profil', 'Pwofil')} color={color} focused={focused} dark={dark} />
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
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    minWidth: 58,
  },
});
