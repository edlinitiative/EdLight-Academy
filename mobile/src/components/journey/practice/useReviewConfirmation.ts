import { useCallback, useEffect, useRef, useState } from 'react';
import { flushReviewPush } from '../../../services/reviewService';
import type { ReviewConfirmState } from './session';

/**
 * Is "these errors are in your Révision" actually true yet? (LJ-09)
 *
 * The web polls the server copy back because its review service is
 * fire-and-forget. Mobile owns an exact signal instead: `flushReviewPush`
 * writes this session's misses and resolves on the server's acknowledgement.
 *
 *   idle         nothing to confirm (signed out, or no new misses)
 *   pending      write in flight
 *   confirmed    the server acknowledged every miss
 *   unconfirmed  not acknowledged (offline, timeout, write refused) — the
 *                misses are still on this phone and the background sync
 *                retries; `recheck()` tries again now
 */
export function useReviewConfirmation(
  signedIn: boolean,
  ids: string[],
  flush: (ids: string[]) => Promise<void> = flushReviewPush,
): { state: ReviewConfirmState; recheck: () => void } {
  const key = ids.join('|');
  const active = signedIn && ids.length > 0;
  const [state, setState] = useState<ReviewConfirmState>(active ? 'pending' : 'idle');
  const [round, setRound] = useState(0);
  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => {
    if (!active) { setState('idle'); return undefined; }
    let alive = true;
    setState('pending');
    flushRef.current(key.split('|'))
      .then(() => { if (alive) setState('confirmed'); })
      .catch(() => { if (alive) setState('unconfirmed'); });
    return () => { alive = false; };
  }, [active, key, round]);

  const recheck = useCallback(() => setRound((r) => r + 1), []);
  return { state, recheck };
}
