import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { CommonActions } from '@react-navigation/native';
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

// Tab tints. Inactive is near-ink on purpose: this bar follows the Ledger app's
// tab bar (stock iOS TabView, `.tint(brass)`), where unselected items are heavy
// dark glyphs and the selected one is separated by BOTH the accent hue and a
// capsule behind it. An earlier pass here lightened inactive to `muted` to keep
// it off the active color — with two state signals instead of one, the darker
// treatment reads better and matches the reference.
const ACTIVE = lightColors.azure; // '#1B6FE0'
const INACTIVE = lightColors.ink; // '#0f172a'

// Floating bar, Ledger-style: a detached OPAQUE capsule (not glass). The
// reference bar is solid white — content passes behind it, it doesn't refract
// through it — which reads calmer and keeps the icons crisp over any content.
// 58 with 5pt padding leaves a 48pt touch height: tighter than the old 60, still
// clear of Apple's 44pt floor on the control every user touches every session.
const BAR_HEIGHT = 58;
const BAR_MARGIN = 20;
// 23, up from 20: the reference uses filled SF Symbols, which carry far more
// visual weight than a monoline stroke. Size + stroke weight get most of that
// presence without gambling on `fill` rendering cleanly across five glyphs.
const ICON_SIZE = 23;

// Two taps on the SAME tab within this window trigger a data refresh.
const DOUBLE_TAP_MS = 350;

// One tab item: icon + label as a single column, with the focused capsule
// wrapping BOTH. The capsule is a NEUTRAL fill, not a brand tint — in the
// reference the accent lives only in the icon and label, which keeps the bar
// quiet and lets the selected item read as "lifted" rather than "coloured in".
// It fades/scales in; reduce-motion collapses that to an instant state change.
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
      <Icon color={color} size={ICON_SIZE} strokeWidth={focused ? 2.4 : 2} />
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
        // Opaque capsule, not glass. The reference bar is a solid white pill on
        // the page ground: no blur, no translucency, no rim highlight. Dropping
        // the BlurView also drops a per-frame GPU blur under every scroll.
        tabBarBackground: () => (
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: BAR_HEIGHT / 2,
                backgroundColor: dark ? darkColors.surface : lightColors.surface,
              },
            ]}
          />
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
              // No rim: the reference pill has no visible border in light mode.
              // Dark mode keeps a hairline so the pill separates from the ground.
              borderWidth: dark ? 1 : 0,
              borderColor: dark ? 'rgba(148,163,184,0.16)' : 'transparent',
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
            <TabItem Icon={LayoutDashboard} label={t('Accueil', 'Akèy')} color={color} focused={focused} dark={dark} />
          ),
        }}
      />
      <Tab.Screen
        name="Courses"
        component={CoursesNavigator}
        listeners={({ navigation }) => ({
          // bottom-tabs dispatches nothing when the tapped tab is already focused,
          // so re-tapping "Cours" from inside a lesson did nothing at all. Mirror
          // the Exams behaviour: always return to the catalog root, and send a
          // fresh `resetAt` so CourseList also clears its level/subject drill-down
          // (that state is local to the screen and invisible to the navigator).
          tabPress: (e) => {
            const coursesRoute = navigation
              .getState()
              .routes.find((r: any) => r.name === 'Courses') as any;
            const nested = coursesRoute?.state;
            if (!nested) return; // stack not initialized yet → default (CourseList)
            e.preventDefault();
            navigation.dispatch({
              ...CommonActions.reset({
                index: 0,
                routes: [{ name: 'CourseList', params: { resetAt: Date.now() } }],
              }),
              target: nested.key,
            });
          },
        })}
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
              // RESET, don't navigate: navigate() only pops when ExamLanding is
              // already in the stack, otherwise it PUSHES on top and leaves the
              // stale screen underneath (Android back then returns to it).
              navigation.dispatch({
                ...CommonActions.reset({ index: 0, routes: [{ name: 'ExamLanding' }] }),
                target: nested.key,
              });
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
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    minWidth: 58,
  },
});
