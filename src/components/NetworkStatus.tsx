import React, { useEffect, useRef, useState } from 'react';
import { WifiOff, CheckCircle2 } from './icons';
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

  /**
   * Tell the document the banner is up, so the page can make room for it.
   *
   * The banner is FIXED to the bottom centre and, while offline, persistent —
   * not a toast that passes. At 390px it therefore sat on top of the last line
   * of page content, which redesign plan §8 forbids ("no clipped critical text
   * or covered actions") and §13 calls out as a floating control covering task
   * content. `pointer-events: none` meant it never blocked a click, so this
   * only ever looked like the page was cut off — the quietest kind of bug.
   *
   * An attribute rather than `:has()` so the coupling is greppable from both
   * sides, and it is cleaned up on unmount.
   */
  useEffect(() => {
    const root = document.documentElement;
    if (visible) root.setAttribute('data-network-banner', status);
    else root.removeAttribute('data-network-banner');
    return () => root.removeAttribute('data-network-banner');
  }, [visible, status]);

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
