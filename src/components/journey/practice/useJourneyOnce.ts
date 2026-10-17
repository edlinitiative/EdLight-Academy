import { useEffect, useRef } from 'react';
import { trackJourney, type JourneyEvent } from '../../../utils/learningJourney';

/**
 * Send a journey event once per `key` (PRD §15: no duplicates from re-renders,
 * StrictMode double effects or retries). `key = null` means "not yet". A new
 * key — a new session, a new result — sends again. Detail is technical
 * context only: ids, mode, source, counts. Never answers.
 */
export function useJourneyOnce(
  name: JourneyEvent,
  key: string | null,
  detail: Record<string, string | number | boolean | null | undefined>,
) {
  const sent = useRef<string | null>(null);
  const detailRef = useRef(detail);
  detailRef.current = detail;
  useEffect(() => {
    if (!key || sent.current === key) return;
    sent.current = key;
    trackJourney(name, detailRef.current);
  }, [name, key]);
}
