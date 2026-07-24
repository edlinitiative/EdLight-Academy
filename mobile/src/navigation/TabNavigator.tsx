import React, { useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, BookOpen, ClipboardList, Gamepad2, User } from 'lucide-react-native';
import useStore from '../contexts/store';
import { tapLight } from '../utils/haptics';

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

const ACTIVE = '#1B6FE0';
const INACTIVE = '#111827';

// Floating pill bar (Instagram-style): detached from the screen edge, rounded,
// elevated. Sized explicitly so labels never clip, whatever the device width.
// Height trimmed ~20% (was 62) so the bar takes less of the screen and sits
// further clear of any screen's own bottom actions.
const BAR_HEIGHT = 50;
const BAR_MARGIN = 16;
// Icons scaled to match the shorter bar so icon + label never clip.
const ICON_SIZE = 20;

// Two taps on the SAME tab within this window trigger a data refresh.
const DOUBLE_TAP_MS = 350;

// Rounded highlight behind the focused tab's icon. Themed tint of the brand
// color — subtle in light mode, a touch stronger in dark so it reads.
function TabIcon({
  Icon,
  color,
  size,
  focused,
  dark,
}: {
  Icon: typeof LayoutDashboard;
  color: string;
  size: number;
  focused: boolean;
  dark: boolean;
}) {
  return (
    <View
      style={[
        styles.iconPill,
        focused && {
          backgroundColor: dark ? 'rgba(56,132,214,0.24)' : 'rgba(27,111,224,0.12)',
        },
      ]}
    >
      <Icon color={color} size={ICON_SIZE} />
    </View>
  );
}

// Tab label as its own Text so it honors Dynamic Type but stays capped: modest
// scaling (up to 1.3×) keeps the floating pill from overflowing on large-font
// devices while no longer opting fully out of accessibility scaling.
function TabLabel({ label, color }: { label: string; color: string }) {
  return (
    <Text
      allowFontScaling
      maxFontSizeMultiplier={1.3}
      numberOfLines={1}
      style={{ fontSize: 10, fontWeight: '600', color }}
    >
      {label}
    </Text>
  );
}

export default function TabNavigator() {
  const theme = useStore((s) => s.theme);
  const language = useStore((s) => s.language);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);
  const focusMode = useStore((s) => s.focusMode);
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
        tabBarActiveTintColor: dark ? '#4C9AF5' : ACTIVE,
        tabBarInactiveTintColor: dark ? '#9aa8c0' : INACTIVE,
        // Allow Dynamic Type; the per-label maxFontSizeMultiplier caps growth.
        tabBarAllowFontScaling: true,
        // Frosted-glass pill: a translucent BlurView background lets the app
        // show through, with a thin light rim for the glass edge. The overlay is
        // kept light so scrolling content stays visible (blurred) behind it.
        tabBarBackground: () => (
          <BlurView
            intensity={dark ? 40 : 55}
            tint={dark ? 'dark' : 'light'}
            style={[StyleSheet.absoluteFill, { borderRadius: BAR_HEIGHT / 2, overflow: 'hidden' }]}
          >
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: dark ? 'rgba(17,24,39,0.35)' : 'rgba(255,255,255,0.3)' },
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
              paddingTop: 6,
              paddingBottom: 6,
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
          tabBarLabel: ({ color }) => <TabLabel label={t('Accueil', 'Akèy')} color={color} />,
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon Icon={LayoutDashboard} color={color} size={size} focused={focused} dark={dark} />
          ),
        }}
      />
      <Tab.Screen
        name="Courses"
        component={CoursesNavigator}
        options={{
          tabBarLabel: ({ color }) => <TabLabel label={t('Cours', 'Kou')} color={color} />,
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon Icon={BookOpen} color={color} size={size} focused={focused} dark={dark} />
          ),
        }}
      />
      <Tab.Screen
        name="Exams"
        component={ExamsNavigator}
        options={{
          tabBarLabel: ({ color }) => <TabLabel label={t('Examens', 'Egzamen')} color={color} />,
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon Icon={ClipboardList} color={color} size={size} focused={focused} dark={dark} />
          ),
        }}
      />
      <Tab.Screen
        name="Trivia"
        component={TriviaScreen}
        options={{
          tabBarLabel: ({ color }) => <TabLabel label={t('Jeux', 'Jwèt')} color={color} />,
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon Icon={Gamepad2} color={color} size={size} focused={focused} dark={dark} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: ({ color }) => <TabLabel label={t('Profil', 'Pwofil')} color={color} />,
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon Icon={User} color={color} size={size} focused={focused} dark={dark} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  iconPill: {
    paddingHorizontal: 14,
    paddingVertical: 2,
    borderRadius: 12,
  },
});
