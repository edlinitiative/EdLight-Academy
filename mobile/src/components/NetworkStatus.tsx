import React, { useEffect, useRef, useState } from 'react';
import { Text, Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WifiOff, RefreshCw, CheckCircle2 } from 'lucide-react-native';
import NetInfo from '@react-native-community/netinfo';
import useStore from '../contexts/store';
import { useColors } from '../theme/theme';
import { isOnlineSnapshot } from '../lifecycle/connectivity';
import { useReduceMotion } from '../utils/motion';
import { syncMessage } from '../../../shared/syncStatus';
import { outbox } from '../services/writeOutbox';

/** The signed-in account's queued-write count (shared/outbox), live. */
export function usePendingSyncCount(uid: string | null | undefined): number {
  const [pending, setPending] = useState(0);
  useEffect(() => {
    if (!uid) { setPending(0); return undefined; }
    let alive = true;
    outbox.pendingCount(uid).then((n) => { if (alive) setPending(n); }).catch(() => undefined);
    const off = outbox.subscribe((who, n) => { if (who === uid) setPending(n); });
    return () => { alive = false; off(); };
  }, [uid]);
  return pending;
}

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
  const uid = useStore((s) => s.user?.uid ?? null);
  const pending = usePendingSyncCount(uid);
  const hiddenY = -(80 + insets.top); // fully off-screen even with a large notch
  const translateY = useRef(new Animated.Value(hiddenY)).current;
  const [visible, setVisible] = useState(false);
  const reduceMotion = useReduceMotion();

  const offline = isConnected === false;

  // Coming back online: say so while queries refetch (the react-query online
  // bridge resumes them) and the outbox replays (lifecycle/queryLifecycle).
  // The banner holds while queued writes drain — 3 s after the queue is empty,
  // 12 s at most, so a write the server keeps refusing never pins it (it stays
  // queued for the next reconnect/foreground). "Tout est synchronisé" is said
  // only when a non-empty queue actually reached zero (server acks).
  const [refreshing, setRefreshing] = useState(false);
  const [drained, setDrained] = useState(false);
  const wasOffline = useRef(false);
  const hadPending = useRef(false);
  useEffect(() => {
    if (offline) {
      wasOffline.current = true;
      if (pending > 0) hadPending.current = true;
      setRefreshing(false);
      setDrained(false);
      return;
    }
    if (isConnected && wasOffline.current) {
      wasOffline.current = false;
      setRefreshing(true);
    }
  }, [offline, isConnected, pending]);
  useEffect(() => {
    if (!refreshing) return undefined;
    if (pending > 0) { hadPending.current = true; setDrained(false); }
    else if (hadPending.current) setDrained(true);
    const id = setTimeout(() => {
      setRefreshing(false);
      setDrained(false);
      hadPending.current = false;
    }, pending > 0 ? 12_000 : 3000);
    return () => clearTimeout(id);
  }, [refreshing, pending]);

  const message = syncMessage({
    phase: offline ? 'offline' : refreshing ? 'reconnected' : 'online',
    pending,
    drained,
    lang: language || 'fr',
  });

  const show = !!message;

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
      accessibilityRole="text"
      style={[styles.banner, {
        backgroundColor: offline ? colors.dangerFill : message?.tone === 'synced' ? colors.successFill : colors.azureFill,
        paddingTop: 8 + insets.top,
        transform: [{ translateY }],
      }]}
    >
      {offline ? <WifiOff color="#ffffff" size={14} /> : message?.tone === 'synced' ? <CheckCircle2 color="#ffffff" size={14} /> : <RefreshCw color="#ffffff" size={14} />}
      <Text style={styles.text}>{message?.text ?? ''}</Text>
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
