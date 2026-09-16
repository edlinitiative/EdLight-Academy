import './global.css';
import React, { useEffect, useRef, useState } from 'react';
import { colorScheme } from 'nativewind';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { registerRootComponent } from 'expo';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { onAuthStateChange, upsertUserDocument, getUserProfile, updateUserGrade } from './src/services/firebase';
import useStore from './src/contexts/store';
import AppNavigator, { navigationRef, navigateToTab } from './src/navigation/AppNavigator';
import {
  areNotificationsEnabled,
  requestPermissions,
  scheduleEngagementReminders,
} from './src/services/notificationService';
import { registerForPushNotifications } from './src/services/pushService';
import { syncMasteryOnLogin, startMasterySync, stopMasterySync, disposeMasterySync } from './src/services/masterySync';
import { hydrateQueryCache, persistQueryCacheOnChange } from './src/services/queryPersistence';

// Hold the native splash until the app can actually show its first real screen.
//
// Without this, Expo hides the splash on the first JS frame — which is App's
// `return null` — and the navigator then puts up its own logo while auth
// resolves. Same artwork, but the native splash draws it `contain` (near
// full-width) and the JS screen drew it at 120pt on a themed ground, so a cold
// launch flashed what looked like two different logos. One splash, held until
// ready, is the whole fix. (TestFlight: "when the app is loading, it shows two
// versions of the logo".)
SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden, or the module is unavailable — launch must not depend on it.
});

/** Never leave a user staring at a splash because auth never resolved. */
const SPLASH_MAX_MS = 4000;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
    },
  },
});

// Throttle passive user-doc upserts. onAuthStateChange fires on every ID-token
// refresh (~hourly) and app resume, not just sign-in — writing the user doc on
// each was wasteful (getDoc + setDoc, and bumped last_seen far more than
// intended). Upsert at most once per hour per uid from the passive listener
// (explicit sign-in paths in authService still upsert immediately).
let lastPassiveUpsertUid: string | null = null;
let lastPassiveUpsertAt = 0;
const PASSIVE_UPSERT_INTERVAL_MS = 60 * 60 * 1000;

function AuthGate() {
  const { setUser, setAuthConfirmed, logout } = useStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (firebaseUser) => {
      if (firebaseUser) {
        const now = Date.now();
        if (firebaseUser.uid !== lastPassiveUpsertUid || now - lastPassiveUpsertAt > PASSIVE_UPSERT_INTERVAL_MS) {
          lastPassiveUpsertUid = firebaseUser.uid;
          lastPassiveUpsertAt = now;
          await upsertUserDocument(firebaseUser, false);
        }
        setUser({
          uid: firebaseUser.uid,
          name: firebaseUser.displayName || '',
          email: firebaseUser.email || '',
          picture: firebaseUser.photoURL || '',
        });
        // Sync grade/track with the user doc. Local state was the only home
        // for these (lost on reinstall, invisible to the server), so:
        //   server has it, device doesn't → restore (reinstall / new device);
        //   device has it, server doesn't → backfill (pre-persistence users,
        //   and guests who picked a grade before signing up).
        // Best-effort; never blocks auth.
        getUserProfile(firebaseUser.uid)
          .then((profile) => {
            const s = useStore.getState();
            const serverGrade = typeof profile?.grade === 'string' && profile.grade ? profile.grade : null;
            if (serverGrade && !s.grade) {
              s.setGrade(serverGrade);
              s.setGradeChosen(true);
            } else if (!serverGrade && s.grade && s.gradeChosen) {
              updateUserGrade(firebaseUser.uid, s.grade);
            }
            const serverTrack = typeof profile?.track === 'string' && profile.track ? profile.track : null;
            if (serverTrack && !s.track) s.setTrack(serverTrack);
          })
          .catch(() => {});
        // Request notification permission after sign-in, then schedule the
        // daily study reminder and register the Expo push token — but only
        // when the user's Notifications toggle allows it. Best-effort — never
        // blocks the auth flow.
        requestPermissions()
          .then(async (granted) => {
            if (!granted || !(await areNotificationsEnabled())) return;
            await scheduleEngagementReminders();
            await registerForPushNotifications(firebaseUser.uid);
          })
          .catch(() => {});
        // Mastery lives on the device (AsyncStorage) for offline use, but it is
        // the app's core signal — losing a term's work to a reinstall is not
        // acceptable. Pull the server's copy, join it with this device's, and
        // write back if the device was ahead. Monotonic merge, so it is safe on
        // every token refresh, not just a fresh sign-in.
        syncMasteryOnLogin(firebaseUser.uid).catch(() => {});
      } else {
        lastPassiveUpsertUid = null; // re-upsert on next sign-in
        stopMasterySync();
        logout();
      }
      setAuthConfirmed();
    });
    return unsubscribe;
  }, []);

  // Mirror mastery upward as it changes (debounced, signed-in only). Registered
  // once for the app's lifetime; it gates itself on the auth state.
  useEffect(() => disposeMasterySync, []);
  useEffect(() => { startMasterySync(); }, []);

  return <AppNavigator />;
}

function App() {
  const { theme } = useStore();
  const authConfirmed = useStore((s) => s.authConfirmed);
  // Source Sans 3 (per-weight) is the app's display/body face — the Estil Klè
  // restyle. Falls back to system if it fails.
  const [fontsLoaded, fontError] = useFonts({
    'SourceSans3-Regular': require('@expo-google-fonts/source-sans-3/400Regular/SourceSans3_400Regular.ttf'),
    'SourceSans3-SemiBold': require('@expo-google-fonts/source-sans-3/600SemiBold/SourceSans3_600SemiBold.ttf'),
    'SourceSans3-Bold': require('@expo-google-fonts/source-sans-3/700Bold/SourceSans3_700Bold.ttf'),
  });
  // Drive NativeWind's dark: variants from our store theme (manual toggle, not
  // just the OS setting), so className-based dark styles track the app's theme.
  useEffect(() => {
    colorScheme.set(theme === 'dark' ? 'dark' : 'light');
  }, [theme]);
  // Seed the query cache from AsyncStorage BEFORE the first screen mounts so
  // cold starts render last-known data instantly (refetch happens in the
  // background). The read takes a few ms — the splash screen covers it.
  const [cacheHydrated, setCacheHydrated] = useState(false);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    hydrateQueryCache(queryClient).finally(() => {
      if (cancelled) return;
      setCacheHydrated(true);
      // Only start persisting after hydration so a partial startup snapshot
      // can never overwrite the previously saved cache.
      unsubscribe = persistQueryCacheOnChange(queryClient);
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  // Handle notification taps — route the user to the right screen. Navigation
  // goes through the container ref (navigateToTab) rather than the old
  // setActiveTab store field, which nothing read → taps were silently no-ops.
  useEffect(() => {
    // Map any casing / legacy tab keys to the real tab route names.
    const TAB_ALIASES: Record<string, string> = {
      dashboard: 'Dashboard', accueil: 'Dashboard', home: 'Dashboard',
      courses: 'Courses', cours: 'Courses',
      exams: 'Exams',
      trivia: 'Trivia', jeux: 'Trivia', games: 'Trivia',
      profile: 'Profile', profil: 'Profile',
    };

    const handle = (data: Record<string, unknown> | undefined) => {
      const type = data?.type as string | undefined;
      if (type === 'trivia-reminder' || type === 'daily-quiz' || type === 'streak') {
        // "Quiz du jour" / streak nudge — open the daily challenge and auto-start it.
        navigateToTab('Trivia', { daily: true });
      } else if (type === 'leaderboard') {
        // Weekly ranking nudge → the dedicated Classement page (a root screen),
        // not the Jeux tab.
        if (navigationRef.isReady()) (navigationRef.navigate as any)('Leaderboard');
      } else if (type === 'study-reminder') {
        navigateToTab('Courses');
      } else if (type === 'achievement') {
        // Badge unlocked → Profile, where achievements live.
        navigateToTab('Profile');
      } else if (typeof data?.tab === 'string') {
        navigateToTab(TAB_ALIASES[data.tab.toLowerCase()] ?? 'Dashboard');
      } else if (typeof data?.url === 'string') {
        Linking.openURL(data.url).catch(() => {});
      }
    };

    // Dedupe: the cold-start launch response (fetched below) can also be
    // re-delivered to the listener on some platforms — handle each tap once.
    const handledIds = new Set<string>();
    const runHandle = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification?.request?.identifier;
      if (id) {
        if (handledIds.has(id)) return;
        handledIds.add(id);
      }
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      // A cold-start tap fires before the nav tree is ready. Crucially, wait for
      // `authConfirmed` too: the target routes (Main's tabs, Leaderboard) only
      // exist once auth resolves — until then the navigator is still on the
      // Loading screen, so navigating silently no-ops and the app opens on the
      // default screen. Retry (up to ~9s) until both the container is ready AND
      // auth has resolved (true for signed-in or signed-out).
      let tries = 0;
      const attempt = () => {
        if ((navigationRef.isReady() && useStore.getState().authConfirmed) || tries > 60) {
          return handle(data);
        }
        tries += 1;
        setTimeout(attempt, 150);
      };
      attempt();
    };

    // Cold start launched BY tapping a notification: that response is delivered
    // via getLastNotificationResponseAsync, NOT to the listener below, so
    // without this the app opened on Dashboard instead of the target screen.
    Notifications.getLastNotificationResponseAsync().then(runHandle).catch(() => {});

    const sub = Notifications.addNotificationResponseReceivedListener(runHandle);
    return () => sub.remove();
  }, []);

  // The native splash stays up until the first real screen is ready, so the
  // app never swaps one logo for another. `authConfirmed` is part of "ready"
  // because until it resolves the navigator only has the Loading screen to
  // show — which is exactly the second logo we're removing.
  const ready = cacheHydrated && (fontsLoaded || fontError) && authConfirmed;

  useEffect(() => {
    if (!ready) return;
    // One frame after the real tree paints, so the reveal lands on content
    // rather than on an empty root view.
    const id = setTimeout(() => { SplashScreen.hideAsync().catch(() => {}); }, 0);
    return () => clearTimeout(id);
  }, [ready]);

  // Safety net: a stalled auth handshake (no network on a cold start) must not
  // strand the user on the splash. After this the JS Loading screen takes over,
  // and it is drawn to match the splash so the handoff is still invisible.
  useEffect(() => {
    const id = setTimeout(() => { SplashScreen.hideAsync().catch(() => {}); }, SPLASH_MAX_MS);
    return () => clearTimeout(id);
  }, []);

  // Wait for the cache and fonts (but don't block forever if fonts error out).
  if (!cacheHydrated || (!fontsLoaded && !fontError)) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <AuthGate />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

registerRootComponent(App);
