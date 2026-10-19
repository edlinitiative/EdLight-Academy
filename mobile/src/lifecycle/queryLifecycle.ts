/**
 * Native lifecycle → react-query.
 * ───────────────────────────────
 * TanStack Query's defaults listen to browser `online` / `visibilitychange`
 * events, which React Native never fires. Without this bridge, a screen opened
 * offline stays on its error/cached state after the connection returns, and
 * foregrounding the app never refreshes stale data.
 *
 *   NetInfo  → onlineManager : paused queries/mutations resume on reconnect,
 *                              stale queries refetch (refetchOnReconnect).
 *   AppState → focusManager  : stale queries refetch on foreground
 *                              (refetchOnWindowFocus).
 *
 * Arena realtime data is unaffected: it uses Firestore onSnapshot listeners,
 * not queries, and Firestore manages its own reconnection.
 *
 * The same two signals retry a failed profile sync and replay the persisted
 * write outbox (services/writeOutbox) for the signed-in account.
 */

import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { isForegroundAppState, isOnlineSnapshot } from './connectivity';
import { retryProfileSyncIfDue, sessionGuard } from './session';
import { drainWriteOutbox } from '../services/writeOutbox';
import { flushTelemetry } from '../services/telemetry';

let installed = false;

export function installQueryLifecycle(): () => void {
  if (installed) return () => {};
  installed = true;

  onlineManager.setEventListener((setOnline) => {
    let wasOnline = true;
    const unsub = NetInfo.addEventListener((state) => {
      const online = isOnlineSnapshot(state);
      setOnline(online);
      if (online && !wasOnline) {
        retryProfileSyncIfDue('reconnect');
        void drainWriteOutbox(sessionGuard.current().uid);
        void flushTelemetry();
      }
      wasOnline = online;
    });
    return unsub;
  });

  focusManager.setEventListener((handleFocus) => {
    const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
      const focused = isForegroundAppState(status);
      handleFocus(focused);
      if (focused) {
        retryProfileSyncIfDue('foreground');
        void drainWriteOutbox(sessionGuard.current().uid);
      }
      void flushTelemetry();
    });
    return () => sub.remove();
  });

  return () => {
    // Restore inert listeners; the managers keep their last state.
    onlineManager.setEventListener(() => () => {});
    focusManager.setEventListener(() => () => {});
    installed = false;
  };
}
