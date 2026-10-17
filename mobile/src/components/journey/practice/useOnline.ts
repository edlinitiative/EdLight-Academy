import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

/**
 * true online · false explicitly offline · null unknown (never flashes a
 * false "offline" while NetInfo is still resolving). Same rule as
 * components/NetworkStatus.
 */
export function useOnline(): boolean | null {
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(() => {
    const resolve = (s: { isConnected: boolean | null; isInternetReachable: boolean | null }) =>
      !(s.isConnected === false || s.isInternetReachable === false);
    let alive = true;
    NetInfo.fetch().then((s) => { if (alive) setOnline(resolve(s)); }).catch(() => {});
    const unsub = NetInfo.addEventListener((s) => setOnline(resolve(s)));
    return () => { alive = false; unsub(); };
  }, []);
  return online;
}
