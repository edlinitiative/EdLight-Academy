import React from 'react';
import { WifiOff } from '../../icons';
import type { ConnectionState } from './trustState';
import './trust.css';

/**
 * One compact pill: Connexion… / En direct / Reconnexion…
 *
 * The state is carried by the WORD and the icon; colour only repeats it.
 * `liveWord` lets a screen that is not a live broadcast (lobby, results) say
 * "Connecté" instead of claiming to be "En direct".
 */
export default function ConnectionPill({ state, isCreole, liveWord = 'live', detail }: {
  state: ConnectionState;
  isCreole: boolean;
  liveWord?: 'live' | 'connected';
  /** Extra words after the label, e.g. what happens to a pending answer. */
  detail?: string | null;
}) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const label = state === 'connecting'
    ? t('Connexion…', 'N ap konekte…')
    : state === 'reconnecting'
      ? t('Reconnexion…', 'N ap rekonekte…')
      : liveWord === 'live'
        ? t('En direct', 'An dirèk')
        : t('Connecté', 'Konekte');
  return (
    <span className={`trust-pill is-${state}`} role="status" aria-live="polite" data-state={state}>
      {state === 'reconnecting'
        ? <WifiOff size={16} aria-hidden="true" />
        : state === 'live'
          ? <span className="trust-pill__dot" aria-hidden="true" />
          : <span className="trust-spin" aria-hidden="true" />}
      <span className="trust-pill__label">{label}</span>
      {detail ? <span className="trust-pill__detail">{detail}</span> : null}
    </span>
  );
}
