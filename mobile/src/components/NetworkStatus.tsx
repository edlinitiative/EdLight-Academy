import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import NetInfo from '@react-native-community/netinfo';

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
    const resolve = (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) =>
      state.isConnected === false || state.isInternetReachable === false ? false : true;

    NetInfo.fetch().then((state) => setIsConnected(resolve(state)));
    const unsub = NetInfo.addEventListener((state) => setIsConnected(resolve(state)));
    return () => unsub();
  }, []);

  return isConnected;
}

export default function NetworkStatus() {
  const isConnected = useConnectivity();
  const translateY = useRef(new Animated.Value(-60)).current;
  const [visible, setVisible] = useState(false);

  const offline = isConnected === false;

  useEffect(() => {
    if (offline) {
      setVisible(true);
      Animated.timing(translateY, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: -60,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setVisible(false));
    }
  }, [offline]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.banner, { transform: [{ translateY }] }]}>
      <WifiOff color="#ffffff" size={14} />
      <Text style={styles.text}>Pas de connexion</Text>
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
    backgroundColor: '#ef4444',
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
