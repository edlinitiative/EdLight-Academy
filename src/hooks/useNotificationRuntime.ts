import { useEffect } from 'react';
import useStore from '../contexts/store';

/**
 * Boots the client-side notification runtime for signed-in users:
 *   • starts the reminder scheduler (foreground delivery of due reminders), and
 *   • re-subscribes to Web Push when permission is already granted and a VAPID
 *     key is configured.
 *
 * Everything is dynamically imported so the notification/push code (and its
 * Firebase usage) stays out of the initial app shell bundle.
 */
export function useNotificationRuntime() {
  const userId = useStore((s) => s.user?.uid);
  const isAuthenticated = useStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (!isAuthenticated || !userId) return undefined;

    let cancelled = false;
    let stop = () => {};

    Promise.all([
      import('../services/reminderScheduler'),
      import('../services/pushNotificationService'),
    ])
      .then(([scheduler, push]) => {
        if (cancelled) return;
        scheduler.startReminderScheduler(userId);
        stop = scheduler.stopReminderScheduler;
        // Keep the stored push subscription fresh when already opted in.
        if (push.getPermission() === 'granted') {
          push.subscribeToPush(userId).catch(() => {});
        }
      })
      .catch(() => {
        /* notification runtime is best-effort */
      });

    return () => {
      cancelled = true;
      stop();
    };
  }, [isAuthenticated, userId]);
}
