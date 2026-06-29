import './global.css';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { onAuthStateChange, upsertUserDocument } from './src/services/firebase';
import useStore from './src/contexts/store';
import AppNavigator from './src/navigation/AppNavigator';

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
      } else {
        logout();
      }
      setAuthConfirmed();
    });
    return unsubscribe;
  }, []);

  return <AppNavigator />;
}

export default function App() {
  const { theme } = useStore();

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <AuthGate />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
