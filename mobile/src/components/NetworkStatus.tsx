import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { WifiOff } from 'lucide-react-native';

// @react-native-community/netinfo is not installed.
// Use a hook that always reports connected so no false offline banners appear.
function useConnectivity(): boolean | null {
  return null; // null = unknown, banner only shows on explicit false
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
