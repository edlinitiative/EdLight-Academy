import { useCallback, useEffect, useRef, useState } from 'react';
import { flushReviewPush } from '../../../services/reviewService';

/**
 * Is "these errors are in your Révision" actually true yet? (LJ-09)
 *
 * DirectBankQuiz hands each first-attempt miss to `recordReviewOutcome`, which
 * applies it to a per-tab cache at once and pushes the merged map to
 * users/{uid}/mastery/review after a 4 s debounce — fire-and-forget, and a
 * failed push is only logged. So the result screen cannot claim the errors
 * were saved just because the student made them.
 *
 * This hook asks reviewService to push exactly these entries NOW
 * (`flushReviewPush`, a merge write) and reports "confirmed" only when
 * Firestore acknowledges that write — the SDK's setDoc promise settles on the
 * server commit, never on the local cache. One write, no read-back polling,
 * and an exact answer.
 *
 *   idle         nothing to confirm (signed out, or no first-try misses)
 *   pending      the write is in flight
 *   confirmed    the server acknowledged every miss
 *   unconfirmed  signed out, write failed, or no ack within 12 s (offline:
 *                the SDK keeps the write queued); "Vérifier à nouveau" flushes
 *                again
 */
export type ReviewConfirmState = 'idle' | 'pending' | 'confirmed' | 'unconfirmed';

export type FlushReview = (ids: string[]) => Promise<void>;

const defaultFlush: FlushReview = (ids) => flushReviewPush(ids);

export function useReviewConfirmation(
  uid: string | null | undefined,
  ids: string[],
  // Kept for callers' signature: the flush writes this session's cached
  // entries, so there is no older server copy to tell apart any more.
  _since?: number,
  { flush = defaultFlush }: { flush?: FlushReview } = {},
) {
  const key = ids.join('|');
  const active = !!uid && ids.length > 0;
  const [state, setState] = useState<ReviewConfirmState>(active ? 'pending' : 'idle');
  const [round, setRound] = useState(0);
  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => {
    if (!active || !uid) { setState('idle'); return undefined; }
    let alive = true;
    setState('pending');
    flushRef.current(key.split('|'))
      .then(() => { if (alive) setState('confirmed'); })
      .catch(() => { if (alive) setState('unconfirmed'); });
    return () => { alive = false; };
  }, [uid, key, active, round]);

  const recheck = useCallback(() => setRound((r) => r + 1), []);
  return { state, recheck };
}
