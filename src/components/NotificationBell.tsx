import React, { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import useStore from '../contexts/store';

/**
 * Top-bar notification bell with an unread-count badge.
 *
 * Only rendered for signed-in users. The unread count is fetched via a dynamic
 * import of the notification service so Firebase stays out of the initial shell
 * bundle (consistent with the app's lazy-Firebase strategy).
 */
export default function NotificationBell({ className = '' }) {
  const { user, isAuthenticated, showNotifications, toggleNotifications } = useStore();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    const uid = useStore.getState().user?.uid;
    if (!uid) {
      setCount(0);
      return;
    }
    try {
      const { getUnreadNotifications } = await import('../services/notificationService');
      const unread = await getUnreadNotifications(uid);
      setCount(Array.isArray(unread) ? unread.length : 0);
    } catch {
      /* offline / not ready — leave count as-is */
    }
  }, []);

  // Poll the unread count while signed in.
  useEffect(() => {
    if (!isAuthenticated || !user?.uid) {
      setCount(0);
      return undefined;
    }
    refresh();
    const id = window.setInterval(refresh, 60 * 1000);
    return () => window.clearInterval(id);
  }, [isAuthenticated, user?.uid, refresh]);

  // When the panel closes the user has likely read some — refresh the badge.
  useEffect(() => {
    if (!showNotifications) refresh();
  }, [showNotifications, refresh]);

  if (!isAuthenticated) return null;

  return (
    <button
      type="button"
      className={`notif-bell ${className}`.trim()}
      onClick={() => toggleNotifications()}
      aria-label={count > 0 ? `Notifications (${count} non lues)` : 'Notifications'}
      aria-haspopup="dialog"
      aria-expanded={showNotifications}
      title="Notifications"
    >
      <Bell size={18} strokeWidth={2} aria-hidden="true" />
      {count > 0 && (
        <span className="notif-bell__badge" aria-hidden="true">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  );
}
