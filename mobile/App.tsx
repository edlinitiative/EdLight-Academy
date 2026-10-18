import './global.css';
import React, { useEffect, useRef, useState } from 'react';
import { colorScheme } from 'nativewind';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { registerRootComponent } from 'expo';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { onAuthStateChange } from './src/services/firebase';
import useStore, { waitForStoreHydration } from './src/contexts/store';
import AppNavigator, { navigationRef, navigateToTab } from './src/navigation/AppNavigator';
import {
  areNotificationsEnabled,
  scheduleEngagementReminders,
} from './src/services/notificationService';
import { registerForPushNotifications } from './src/services/pushService';
import { syncMasteryOnLogin, startMasterySync, disposeMasterySync } from './src/services/masterySync';
import { hydrateQueryCache, persistQueryCacheOnChange } from './src/services/queryPersistence';
import { installGlobalErrorHandlers, installProductionTelemetry, reportError } from './src/services/telemetry';
import AppErrorBoundary from './src/components/AppErrorBoundary';
import { queryClient } from './src/lifecycle/queryClient';
import { installQueryLifecycle } from './src/lifecycle/queryLifecycle';
import { classifyAuthTransition, shouldClearStudentState } from './src/lifecycle/sessionLogic';
import {
  sessionGuard,
  syncProfile,
  syncGradeAndTrack,
  clearStudentSession,
  installAccountIsolation,
} from './src/lifecycle/session';

// Report errors nothing else caught (JS exceptions, unhandled rejections in
// release), tagged with the build / OTA update that produced them.
installProductionTelemetry();
installGlobalErrorHandlers();
// NetInfo → onlineManager, AppState → focusManager (see lifecycle/queryLifecycle).
installQueryLifecycle();
// Any change of the store's account drops the query caches (lifecycle/session).
installAccountIsolation();

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

/**
 * Resolves who is signed in and shows the app — never waiting on Firestore.
 *
 * Before, the listener awaited `upsertUserDocument` (a Firestore read + write)
 * before `setUser`/`setAuthConfirmed`, with no catch: offline, with Firestore
 * blocked, or on a rejected write, a signed-in student sat on the loading
 * screen indefinitely. Now:
 *   - the session is confirmed from Firebase Auth alone (restored offline from
 *     its AsyncStorage persistence), in a `finally`, so it always happens;
 *   - profile sync, grade/track reconciliation, reminders/push and mastery
 *     sync are fire-and-forget, each with its own error handling; profile sync
 *     keeps its own retryable state (lifecycle/session);
 *   - results of async work are applied only if the same account is still
 *     signed in (sessionGuard);
 *   - a different account than the one this device last knew — with or
 *     without an explicit logout — first clears the previous student's state.
 * Events are handled strictly in order, so a quick sign-out/sign-in can never
 * be applied out of sequence.
 */
function AuthGate() {
  useEffect(() => {
    let chain = Promise.resolve();
    let active = true;

    const handle = async (firebaseUser: any) => {
      // Compare against the persisted account, so wait until it is loaded.
      await waitForStoreHydration();
      if (!active) return;
      const store = useStore.getState();
      try {
        const nextUid: string | null = firebaseUser?.uid ?? null;
        const transition = classifyAuthTransition(store.user?.uid ?? null, nextUid);
        const token = sessionGuard.begin(nextUid);

        if (shouldClearStudentState(transition)) {
          clearStudentSession(transition === 'account-switch' ? 'account-switch' : 'signed-out');
        }

        if (!firebaseUser) {
          // Signed out. Nothing else to do: 'still-signed-out' (a guest's cold
          // launch) deliberately keeps the guest's local work and grade, which
          // sign-up carries into the new account.
          return;
        }

        const uid: string = firebaseUser.uid;
        useStore.getState().setUser({
          uid,
          name: firebaseUser.displayName || '',
          email: firebaseUser.email || '',
          picture: firebaseUser.photoURL || '',
        });

        // ── Best-effort follow-ups. None of these may block or throw. ──
        syncProfile(firebaseUser, { reason: transition }).catch(() => {});
        syncGradeAndTrack(uid, token).catch(() => {});

        // Reminders + push token ONLY for students who already granted
        // permission and kept the in-app toggle on. This never prompts: the
        // permission ask belongs to a moment where its value is clear (a
        // chosen study reminder, a followed event — see notificationService
        // callers), not to a passive auth event.
        areNotificationsEnabled()
          .then(async (enabled) => {
            if (!enabled || !sessionGuard.isCurrent(token)) return;
            await scheduleEngagementReminders();
            await registerForPushNotifications(uid);
          })
          .catch(() => {});

        // Mastery lives on the device (AsyncStorage) for offline use, but it is
        // the app's core signal — losing a term's work to a reinstall is not
        // acceptable. Pull the server's copy, join it with this device's, and
        // write back if the device was ahead. Monotonic merge, so it is safe on
        // every auth event. Runs after any account-switch wipe above, so the
        // previous student's map is never merged into this account.
        syncMasteryOnLogin(uid).catch(() => {});
      } catch (error) {
        reportError(error, { flow: 'auth_gate' });
      } finally {
        // Always: a signed-out, signed-in or failed handling must still let
        // the navigator leave the loading screen.
        useStore.getState().setAuthConfirmed();
      }
    };

    const unsubscribe = onAuthStateChange((firebaseUser) => {
      chain = chain.then(() => handle(firebaseUser)).catch((error) => {
        reportError(error, { flow: 'auth_gate_chain' });
        useStore.getState().setAuthConfirmed();
      });
    });
    return () => {
      active = false;
      unsubscribe();
    };
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
  // Two faces, matching the web: Plus Jakarta Sans 700/800 for headings and
  // numerals (fonts.heading / fonts.headingBold), Source Sans 3 for UI and body.
  // Pure JS + .ttf assets on top of expo-font, so it rides an OTA update — no
  // native build. The Instrument Serif display voice is retired (fonts.display
  // now resolves to the heading face), so it is no longer loaded.
  const [fontsLoaded, fontError] = useFonts({
    'PlusJakartaSans-Bold': require('@expo-google-fonts/plus-jakarta-sans/700Bold/PlusJakartaSans_700Bold.ttf'),
    'PlusJakartaSans-ExtraBold': require('@expo-google-fonts/plus-jakarta-sans/800ExtraBold/PlusJakartaSans_800ExtraBold.ttf'),
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
      } else if (type === 'duel-result') {
        // Your opponent played the duel you sent — the Jeux tab is where the
        // result and the rematch button are.
        navigateToTab('Trivia');
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

  // Hand off to the ANIMATED splash as soon as JS can draw it — deliberately
  // NOT waiting for auth any more.
  //
  // A native launch screen cannot animate, so holding it until everything was
  // ready meant the animation was never seen. The handoff is safe now because
  // both sides draw the same mark at the same 140pt on the same ground: nothing
  // moves or resizes, so the swap is invisible and only the animation starting
  // marks it. (That equivalence is the whole reason the two-logo bug is gone —
  // it was never about *when* we handed off, but about handing off to something
  // that looked different.)
  const ready = cacheHydrated && (fontsLoaded || fontError);

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
        <AppErrorBoundary>
          <AuthGate />
        </AppErrorBoundary>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

registerRootComponent(App);
