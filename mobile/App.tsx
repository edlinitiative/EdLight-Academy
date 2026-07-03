import './global.css';
import React, { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { registerRootComponent } from 'expo';
import * as Notifications from 'expo-notifications';
import { onAuthStateChange, upsertUserDocument } from './src/services/firebase';
import useStore from './src/contexts/store';
import AppNavigator from './src/navigation/AppNavigator';
import {
  requestPermissions,
  scheduleDailyStudyReminder,
} from './src/services/notificationService';
import { hydrateQueryCache, persistQueryCacheOnChange } from './src/services/queryPersistence';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
    },
  },
});

function AuthGate() {
  const { setUser, setAuthConfirmed, logout } = useStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (firebaseUser) => {
      if (firebaseUser) {
        await upsertUserDocument(firebaseUser, false);
        setUser({
          uid: firebaseUser.uid,
          name: firebaseUser.displayName || '',
          email: firebaseUser.email || '',
          picture: firebaseUser.photoURL || '',
        });
        // Request notification permission after sign-in, then schedule the
        // daily study reminder. Best-effort — never blocks the auth flow.
        requestPermissions()
          .then((granted) => { if (granted) scheduleDailyStudyReminder(); })
          .catch(() => {});
      } else {
        logout();
      }
      setAuthConfirmed();
    });
    return unsubscribe;
  }, []);

  return <AppNavigator />;
}

function App() {
  const { theme, setActiveTab } = useStore();
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

  // Handle notification taps — route user to the right screen.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const type = response.notification.request.content.data?.type as string | undefined;
      if (type === 'trivia-reminder' || type === 'leaderboard') {
        setActiveTab('trivia');
      } else if (type === 'study-reminder') {
        setActiveTab('courses');
      }
      // achievement / streak — no navigation needed; they're ambient
    });
    return () => sub.remove();
  }, []);

  if (!cacheHydrated) return null;

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
