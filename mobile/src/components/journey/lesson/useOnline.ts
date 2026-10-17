/**
 * useOffline — true only on an EXPLICIT negative from NetInfo (same rule as
 * components/NetworkStatus): an unknown state never flashes "offline".
 */
import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

export function useOffline(): boolean {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const resolve = (s: { isConnected: boolean | null; isInternetReachable: boolean | null }) =>
      s.isConnected === false || s.isInternetReachable === false;
    let alive = true;
    NetInfo.fetch().then((s) => { if (alive) setOffline(resolve(s)); }).catch(() => {});
    const unsub = NetInfo.addEventListener((s) => setOffline(resolve(s)));
    return () => { alive = false; unsub(); };
  }, []);
  return offline;
}
