import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Platform } from 'react-native';
import { popToRootOnTabPress } from './tabPressBehaviour';
import NativeTabNavigator from './NativeTabNavigator';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import TabIcon, { type TabIconName } from './TabIcon';
import useStore from '../contexts/store';
import { gradeProfile } from '../config/trackConfig';
import { tapLight } from '../utils/haptics';
import { useReduceMotion } from '../utils/motion';
import { JS_TAB_BAR } from '../onboarding/tourGeometry';

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
  /** intent: opened from the ArenaHub route as practice or a friend challenge. */
  Trivia: { intent?: 'practice' | 'challenge'; nonce?: number } | undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

// Tab tints. Inactive is near-ink on purpose: this bar follows the Ledger app's
// tab bar (stock iOS TabView, `.tint(brass)`), where unselected items are heavy
// dark glyphs and the selected one is separated by BOTH the accent hue and a
// capsule behind it. An earlier pass here lightened inactive to `muted` to keep
// it off the active color — with two state signals instead of one, the darker
// treatment reads better and matches the reference.
// The bar's three looks (Oct 17 premium pass). The selected tab is an azure
// WASH with an azure glyph (the accent now marks "you are here"); the others
// step back to a muted ink. On the Jeux tab the bar joins the Arène night so a
// white capsule never floats over the night world.
type BarTone = 'light' | 'dark' | 'night';
const BAR = {
  light: { bg: '#FFFFFF', lens: '#EAF2FE', active: '#1558B8', inactive: '#5F6B7A', shadow: 0.12 },
  dark:  { bg: '#162238', lens: '#1C304E', active: '#7DB4F8', inactive: '#94A3B8', shadow: 0.45 },
  night: { bg: '#0B1730', lens: '#1F3456', active: '#9DC4FF', inactive: '#7F95B8', shadow: 0.5 },
} as const;

// Floating bar: a detached OPAQUE capsule. It was glass (blur + translucent
// tint + light rim) until Oct 17, when Ted rejected hairline-on-translucent
// surfaces app-wide; it now lifts off the page with a soft shadow only.
// 58 with 5pt padding leaves a 48pt touch height: tighter than the old 60, still
// clear of Apple's 44pt floor on the control every user touches every session.
// Shared with the onboarding tour so its arrow always lands on the real tab.
const BAR_HEIGHT = JS_TAB_BAR.height;
const BAR_MARGIN = JS_TAB_BAR.margin;
// 23, up from 20, to match the reference's optical size. The glyphs themselves
// are now real filled SF Symbols on iOS (see TabIcon.tsx) rather than Lucide
// outlines, which is what actually closed the gap to the reference.
const ICON_SIZE = 23;

// Two taps on the SAME tab within this window trigger a data refresh.
const DOUBLE_TAP_MS = 350;


// One tab item, wrapped by the focused capsule. The capsule is a NEUTRAL fill,
// not a brand tint — the accent lives only in the icon, which keeps the bar
// quiet and lets the selected item read as "lifted" rather than "coloured in".
// It fades/scales in; reduce-motion collapses that to an instant state change.
// Icons only (Ted, 2026-08-31): the glyphs are unambiguous and the bar reads
// calmer without five captions. Accessibility keeps the names via each
// screen's tabBarAccessibilityLabel.
function TabItem({
  icon,
  color,
  focused,
  tone,
}: {
  icon: TabIconName;
  color: string;
  focused: boolean;
  tone: BarTone;
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
  // The selected glyph rises 1.5pt with its capsule; reduce-motion snaps it.
  const glyphStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -1.5 * progress.value }],
  }));

  // A neutral step off the bar's own surface — darker in light mode, lighter in
  // dark. No border and no shadow: the reference capsule is a flat tonal shift.
  const lensBg = BAR[tone].lens;

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
      <Animated.View style={glyphStyle}>
        <TabIcon name={icon} color={color} size={ICON_SIZE} focused={focused} />
      </Animated.View>
    </View>
  );
}

function JsTabNavigator() {
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
  const { width } = useWindowDimensions();
  // Which tab is on screen decides the bar's tone (Jeux → night).
  const [activeTab, setActiveTab] = useState('Dashboard');
  const tone: BarTone = activeTab === 'Trivia' ? 'night' : dark ? 'dark' : 'light';
  const bar = BAR[tone];
  // On tablets the capsule stays phone-sized and centred instead of stretching.
  const sideMargin = Math.max(BAR_MARGIN, (width - 420) / 2);

  // Tracks the last tab press so we can detect a quick double-tap on the same tab.
  const lastPress = useRef<{ name: string; time: number }>({ name: '', time: 0 });

  // Float above the home indicator on notched phones, 12px above the edge elsewhere.
  const bottomOffset = Math.max(insets.bottom, 12);

  return (
    <Tab.Navigator
      // No paddingBottom here: content scrolls UNDER the floating bar
      // (each screen adds its own bottom padding so nothing is permanently hidden).
      // React Navigation 7 removed the `sceneContainerStyle` prop in favour of the
      // `sceneStyle` screen option.
      screenListeners={({ route }) => ({
        focus: () => setActiveTab(route.name),
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
        sceneStyle: { backgroundColor: dark ? '#0b1220' : '#f4f6fb' },
        tabBarActiveTintColor: bar.active,
        tabBarInactiveTintColor: bar.inactive,
        // Icon+label are rendered together inside TabItem so the focused lens
        // capsule can wrap both — hide the navigator's own labels.
        tabBarShowLabel: false,
        // OPAQUE capsule (Ted, Oct 17): no blur, no translucent tint, no rim —
        // a hairline over a see-through fill read as generic. Depth is the
        // diffuse shadow below, which needs the bar itself unclipped.
        tabBarBackground: () => (
          <View
            style={[
              StyleSheet.absoluteFill,
              { borderRadius: BAR_HEIGHT / 2, backgroundColor: bar.bg },
            ]}
          />
        ),
        // Focus mode (exam-taking, trivia gameplay) hides the floating bar so it
        // never overlaps a screen's own bottom actions (e.g. the Submit button).
        tabBarStyle: focusMode
          ? { display: 'none' }
          : {
              position: 'absolute',
              left: sideMargin,
              right: sideMargin,
              bottom: bottomOffset,
              height: BAR_HEIGHT,
              borderRadius: BAR_HEIGHT / 2,
              backgroundColor: 'transparent',
              borderTopWidth: 0,
              paddingTop: 5,
              paddingBottom: 5,
              // Softer and lower than the old glass bar: an opaque pill needs a
              // diffuse lift, not a hard drop.
              shadowColor: '#0f172a',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: bar.shadow,
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
            <TabItem icon="dashboard" color={color} focused={focused} tone={tone} />
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
            <TabItem icon="courses" color={color} focused={focused} tone={tone} />
          ),
        }}
      />
      <Tab.Screen
        name="Exams"
        component={quizPrimary ? QuizNavigator : ExamsNavigator}
        listeners={({ navigation }) => ({
          // Tapping "Examens" should land on the exam home (the level/subject
          // picker) — not resume whatever the nested stack retained (a specific
          // exam list, or the in-progress ExamTake the user just left). Because
          // ExamTake hides the tab bar, the user always leaves the exam before
          // tapping the tab, so the retained top is a stale exam context. Reset
          // the stack to ExamLanding whenever it isn't already there.
          // (In-progress answers aren't lost — the "Reprendre" banner resumes.)
          // Quiz-primary grades land on the quiz picker, which now shares its
          // stack with the exam screens a deep link may have pushed.
          tabPress: popToRootOnTabPress(navigation, 'Exams', quizPrimary ? 'Quizzes' : 'ExamLanding'),
        })}
        options={{
          tabBarAccessibilityLabel: quizPrimary ? t('Quiz', 'Quiz') : t('Examens', 'Egzamen'),
          tabBarIcon: ({ color, focused }) => (
            <TabItem
              icon={quizPrimary ? 'quiz' : 'exams'}
              color={color}
              focused={focused} tone={tone}
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
            <TabItem icon="games" color={color} focused={focused} tone={tone} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarAccessibilityLabel: t('Profil', 'Pwofil'),
          tabBarIcon: ({ color, focused }) => (
            <TabItem icon="profile" color={color} focused={focused} tone={tone} />
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

/**
 * iOS renders the REAL UIKit tab bar (Liquid Glass, drag-to-switch,
 * minimize-on-scroll — all system behaviour). Android keeps the JS bar above,
 * because the native Android bar needs bitmap icons and this project has no tab
 * icon assets; SF Symbols have no Android equivalent.
 */
export default function TabNavigator() {
  return Platform.OS === 'ios' && !IN_EXPO_GO ? <NativeTabNavigator /> : <JsTabNavigator />;
}

/** Expo Go has no RNCTabView, so the native bar is a pink "Unimplemented
 *  component" overlay there; dev runs in Expo Go use the JS bar instead.
 *  Store/dev-client builds are unaffected. */
const IN_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
