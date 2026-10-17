import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { setStatusBarStyle } from 'expo-status-bar';
import { useTheme } from '../../theme/theme';

/**
 * The Jeux tab and every Arène screen are night in both OS themes, so the
 * status bar must be light-content while one is focused — and hand back the
 * app's own style (App.tsx: light in dark mode, dark in light mode) on blur.
 */
export default function useNightStatusBar() {
  const { isDark } = useTheme();
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light', true);
      return () => setStatusBarStyle(isDark ? 'light' : 'dark', true);
    }, [isDark]),
  );
}
