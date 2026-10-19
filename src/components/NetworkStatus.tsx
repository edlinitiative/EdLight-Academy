import React, { useEffect, useRef, useState } from 'react';
import { WifiOff, CheckCircle2, RefreshCw } from './icons';
import useStore from '../contexts/store';
import { syncMessage, type SyncPhase } from '../../shared/syncStatus';
// The storage-only instance: no Firebase import into the initial bundle.
import { outbox } from '../services/outboxStore';

/**
 * Global connectivity banner — the one offline / queued / reconnect state for
 * the web (roadmap §5 "Offline and reconnection", PRE-04). The words come from
 * shared/syncStatus.ts, the same module the phone banner uses.
 *
 * • Goes offline  → persistent "Hors ligne — le contenu enregistré reste
 *   disponible", plus "N actions en attente d'envoi" when the signed-in account
 *   has queued writes in the outbox (XP awards, mastery, study plan).
 * • Comes back    → "Connexion rétablie · envoi…" while the queue drains, and
 *   "Tout est synchronisé ✓" only once the outbox is actually empty (it removes
 *   an operation only on a server ack). It used to say "Synchronisé ✓" the
 *   instant the browser fired `online`, before anything had been sent.
 *   Visible data refreshes on its own: React Query refetches on `online`.
 *
 * Uses an aria-live region so screen readers announce the change without
 * stealing focus. Rendered once near the app root (see Layout).
 */

/** The signed-in account's queued-write count, live. */
export function usePendingSyncCount(uid: string | null | undefined): number {
  const [pending, setPending] = useState(0);
  useEffect(() => {
    if (!uid) {
      setPending(0);
      return undefined;
    }
    let alive = true;
    outbox.pendingCount(uid).then((n) => { if (alive) setPending(n); }).catch(() => undefined);
    const off = outbox.subscribe((who, n) => { if (who === uid) setPending(n); });
    return () => { alive = false; off(); };
  }, [uid]);
  return pending;
}

/** Hold the "reconnected" banner this long after the queue is empty… */
const SETTLED_MS = 3000;
/** …and never longer than this while a write keeps being refused (it stays queued). */
const MAX_SYNCING_MS = 12_000;

export default function NetworkStatus() {
  const uid = useStore((s: any) => s.user?.uid ?? null);
  const language = useStore((s: any) => s.language);
  const pending = usePendingSyncCount(uid);

  const getInitial = (): SyncPhase =>
    typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'online';
  const [status, setStatus] = useState<SyncPhase>(getInitial);

  useEffect(() => {
    const handleOffline = () => setStatus('offline');
    const handleOnline = () => setStatus('reconnected');
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  // Track whether a non-empty queue drained during this reconnect window, and
  // hide the banner once it has (bounded either way).
  const hadPending = useRef(false);
  const [drained, setDrained] = useState(false);
  useEffect(() => {
    if (status === 'offline') {
      if (pending > 0) hadPending.current = true;
      setDrained(false);
      return undefined;
    }
    if (status !== 'reconnected') {
      hadPending.current = false;
      setDrained(false);
      return undefined;
    }
    if (pending > 0) {
      hadPending.current = true;
      setDrained(false);
    } else if (hadPending.current) {
      setDrained(true);
    }
    const id = setTimeout(() => setStatus('online'), pending > 0 ? MAX_SYNCING_MS : SETTLED_MS);
    return () => clearTimeout(id);
  }, [status, pending]);

  const message = syncMessage({ phase: status, pending, drained, lang: language || 'fr' });
  const visible = !!message;
  const tone = message?.tone ?? 'online';

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
      className={`network-banner network-banner--${status === 'offline' ? 'offline' : 'reconnected'} network-banner--${tone} ${visible ? 'is-visible' : ''}`}
      role="status"
      aria-live="polite"
      aria-hidden={!visible}
      data-pending={pending > 0 ? pending : undefined}
    >
      {message && (
        <>
          {tone === 'offline' ? <WifiOff size={16} aria-hidden="true" />
            : tone === 'synced' ? <CheckCircle2 size={16} aria-hidden="true" />
              : <RefreshCw size={16} aria-hidden="true" />}
          <span>{message.text}</span>
        </>
      )}
    </div>
  );
}
