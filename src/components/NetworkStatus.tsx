import React, { useEffect, useRef, useState } from 'react';
import { WifiOff, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Global connectivity banner.
 *
 * • Goes offline  → persistent "Hors ligne — contenu enregistré disponible"
 *   so the learner knows cached lessons/exams still work.
 * • Comes back    → a brief "Synchronisé ✓" confirmation, then auto-hides.
 *
 * Uses an aria-live region so screen readers announce the change without
 * stealing focus. Render once near the app root (see Layout).
 */
type Status = 'online' | 'offline' | 'reconnected';

export default function NetworkStatus() {
  const { t } = useTranslation();
  const getInitial = (): Status =>
    typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'online';
  const [status, setStatus] = useState<Status>(getInitial);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearHide = () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
    };

    const handleOffline = () => {
      clearHide();
      setStatus('offline');
    };

    const handleOnline = () => {
      clearHide();
      setStatus('reconnected');
      // Show the "Synchronisé ✓" confirmation briefly, then hide the banner.
      hideTimer.current = setTimeout(() => setStatus('online'), 3000);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      clearHide();
    };
  }, []);

  // Nothing to show while steadily online.
  const visible = status !== 'online';

  return (
    <div
      className={`network-banner network-banner--${status} ${visible ? 'is-visible' : ''}`}
      role="status"
      aria-live="polite"
      aria-hidden={!visible}
    >
      {status === 'offline' ? (
        <>
          <WifiOff size={16} aria-hidden="true" />
          <span>{t('network.offline')}</span>
        </>
      ) : (
        <>
          <CheckCircle2 size={16} aria-hidden="true" />
          <span>{t('network.synced')}</span>
        </>
      )}
    </div>
  );
}
