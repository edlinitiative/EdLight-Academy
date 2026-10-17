/**
 * Pure connectivity/foreground interpretation shared by the offline banner
 * and the react-query lifecycle bridge, so the two can never disagree.
 */

export type NetSnapshot = {
  isConnected: boolean | null;
  isInternetReachable?: boolean | null;
};

/**
 * Online unless NetInfo says otherwise EXPLICITLY. `null` (unknown, common for
 * a moment at launch and on network handover) counts as online, so a transient
 * unknown never pauses queries or flashes an offline banner.
 */
export function isOnlineSnapshot(state: NetSnapshot | null | undefined): boolean {
  if (!state) return true;
  return !(state.isConnected === false || state.isInternetReachable === false);
}

/** react-query "focus" = the app is in the foreground. */
export function isForegroundAppState(status: string | null | undefined): boolean {
  return status === 'active';
}
