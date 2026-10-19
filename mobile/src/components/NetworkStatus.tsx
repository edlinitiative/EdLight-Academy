import React, { useEffect, useRef, useState } from 'react';
import { Text, Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WifiOff, RefreshCw } from 'lucide-react-native';
import NetInfo from '@react-native-community/netinfo';
import useStore from '../contexts/store';
import { useColors } from '../theme/theme';
import { isOnlineSnapshot } from '../lifecycle/connectivity';
import { useReduceMotion } from '../utils/motion';

/**
 * Live connectivity via NetInfo. Returns:
 *   null  — unknown (initial / unresolved), banner stays hidden
 *   true  — online
 *   false — offline (explicit disconnect or no internet reachability)
 * We only report `false` on an explicit negative so transient "unknown"
 * states never flash a false offline banner.
 */
function useConnectivity(): boolean | null {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  useEffect(() => {
    // Same interpretation as the react-query online bridge (lifecycle/connectivity).
    const resolve = isOnlineSnapshot;

    NetInfo.fetch().then((state) => setIsConnected(resolve(state)));
    const unsub = NetInfo.addEventListener((state) => setIsConnected(resolve(state)));
    return () => unsub();
  }, []);

  return isConnected;
}

export default function NetworkStatus() {
  const isConnected = useConnectivity();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const hiddenY = -(80 + insets.top); // fully off-screen even with a large notch
  const translateY = useRef(new Animated.Value(hiddenY)).current;
  const [visible, setVisible] = useState(false);
  const reduceMotion = useReduceMotion();

  const offline = isConnected === false;

  // Coming back online: say so briefly while queries refetch (the react-query
  // online bridge resumes them), so the student knows the screen is updating
  // rather than wondering whether what they see is still the offline copy.
  const [refreshing, setRefreshing] = useState(false);
  const wasOffline = useRef(false);
  useEffect(() => {
    if (offline) {
      wasOffline.current = true;
      setRefreshing(false);
      return;
    }
    if (isConnected && wasOffline.current) {
      wasOffline.current = false;
      setRefreshing(true);
      const id = setTimeout(() => setRefreshing(false), 2500);
      return () => clearTimeout(id);
    }
  }, [offline, isConnected]);

  const show = offline || refreshing;

  useEffect(() => {
    if (show) {
      setVisible(true);
      Animated.timing(translateY, {
        toValue: 0,
        // Reduce Motion: the banner appears in place instead of sliding.
        duration: reduceMotion ? 0 : 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: hiddenY,
        duration: reduceMotion ? 0 : 300,
        useNativeDriver: true,
      }).start(() => setVisible(false));
    }
  }, [show, hiddenY, reduceMotion]);

  if (!visible) return null;

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[styles.banner, { backgroundColor: offline ? colors.danger : colors.azureFill, paddingTop: 8 + insets.top, transform: [{ translateY }] }]}
    >
      {offline ? <WifiOff color="#ffffff" size={14} /> : <RefreshCw color="#ffffff" size={14} />}
      <Text style={styles.text}>
        {offline
          ? (isCreole ? 'Pa gen koneksyon' : 'Pas de connexion')
          : (isCreole ? 'Koneksyon an tounen · n ap mete ajou' : 'Connexion rétablie · mise à jour')}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  text: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
});
