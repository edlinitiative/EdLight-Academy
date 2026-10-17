import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, getDocFromServer } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import type { ReviewMap } from '../../../utils/review';

/**
 * Is "these errors are in your Révision" actually true yet? (LJ-09)
 *
 * DirectBankQuiz hands each first-attempt miss to `recordReviewOutcome`, which
 * applies it to a per-tab cache at once and pushes the merged map to
 * users/{uid}/mastery/review after a 4 s debounce — fire-and-forget, and a
 * failed push is only logged. So the result screen cannot claim the errors
 * were saved just because the student made them. This hook reads the review
 * doc back FROM THE SERVER (never the local cache, which would echo our own
 * pending write) and reports "confirmed" only when every id carries a miss
 * stamped during this session.
 *
 *   idle         nothing to confirm (signed out, or no first-try misses)
 *   pending      waiting for the push / the read-back
 *   confirmed    the server copy has every miss
 *   unconfirmed  not seen after the last check (offline, push failed, slow)
 *
 * reviewService is read-only for this slice; a `flushReviewPush()` returning
 * the write's promise would make this exact and cheaper — see the hand-off.
 */
export type ReviewConfirmState = 'idle' | 'pending' | 'confirmed' | 'unconfirmed';

export type ReadReviewMap = (uid: string) => Promise<{ map: ReviewMap; pending: boolean }>;

export const readServerReviewMap: ReadReviewMap = async (uid) => {
  const snap = await getDocFromServer(doc(db, 'users', uid, 'mastery', 'review'));
  const q = snap.exists() ? snap.data()?.questions : null;
  return { map: (q && typeof q === 'object' ? q : {}) as ReviewMap, pending: !!snap.metadata?.hasPendingWrites };
};

/** After the 4 s push debounce, then twice more for a slow network. */
const DEFAULT_DELAYS = [5500, 9000, 16000];

export function useReviewConfirmation(
  uid: string | null | undefined,
  ids: string[],
  since: number,
  { read = readServerReviewMap, delays = DEFAULT_DELAYS }: { read?: ReadReviewMap; delays?: number[] } = {},
) {
  const key = ids.join('|');
  const active = !!uid && ids.length > 0;
  const [state, setState] = useState<ReviewConfirmState>(active ? 'pending' : 'idle');
  const [round, setRound] = useState(0);
  const readRef = useRef(read);
  readRef.current = read;

  useEffect(() => {
    if (!active || !uid) { setState('idle'); return undefined; }
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    setState('pending');
    const want = key.split('|');
    const check = async (attempt: number) => {
      try {
        const { map, pending } = await readRef.current(uid);
        if (!alive) return;
        const all = !pending && want.every((id) => (map[id]?.missedAt ?? 0) >= since);
        if (all) { setState('confirmed'); return; }
      } catch {
        /* offline or denied — treat like "not yet" */
      }
      if (!alive) return;
      if (attempt + 1 < delays.length) {
        timers.push(setTimeout(() => { void check(attempt + 1); }, Math.max(0, delays[attempt + 1] - delays[attempt])));
      } else {
        setState('unconfirmed');
      }
    };
    // A manual re-check reads straight away; the first pass waits for the push.
    timers.push(setTimeout(() => { void check(0); }, round > 0 ? 0 : delays[0]));
    return () => { alive = false; timers.forEach(clearTimeout); };
    // `delays` is a config constant per call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, key, since, active, round]);

  const recheck = useCallback(() => setRound((r) => r + 1), []);
  return { state, recheck };
}
