/**
 * Is there an Arena tournament open for sign-up right now?
 *
 * This is the question the whole product had no answer to. The registration
 * screen (`ArenaLobbyScreen`, mobile) was fully built and worked — school
 * picker, grade attestation, the actual registration call — and the ONLY
 * link to it anywhere in the app was a button on the RESULTS screen of a
 * tournament that had already finished. A student who had never played had
 * no way in, and neither did the very first tournament ever. The web side had
 * no presence at all: no page, no banner, nothing.
 *
 * This hook is the missing piece both surfaces needed: a live answer to
 * "should we be telling someone about this right now", read from the one
 * public field that already says so — `tournaments/{tid}.state`.
 *
 * `registration` and `doors` only. `live` and everything after it means
 * sign-up has closed; showing a banner that says "join now" over a
 * tournament already in progress is worse than showing nothing.
 */

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../services/firebase';

/** `doors` is the more urgent moment — the room is filling right now. */
const PRIORITY = ['doors', 'registration'] as const;
const WATCHED_STATES = [...PRIORITY];

function millis(v: any): number {
  if (!v) return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return 0;
}

export interface OpenArena {
  id: string;
  title: string;
  titleHt: string;
  state: 'registration' | 'doors';
  startsAt: number;
  schools: number;
  players: number;
  isTest?: boolean;
}

/** Exported for tests — which tournament a visitor should be told about. */
export function pickOpenArena(
  rows: { id: string; title: string; titleHt: string; state: string; startsAt: number; schools: number; players: number; isTest?: boolean }[],
): OpenArena | null {
  for (const state of PRIORITY) {
    const inState = rows.filter((r) => r.state === state && !r.isTest && !/\b(test|demo|démo)\b/i.test(r.title));
    if (inState.length === 0) continue;
    const chosen = inState.sort((a, b) => a.startsAt - b.startsAt)[0];
    return { ...chosen, state: state as OpenArena['state'] };
  }
  return null;
}

/**
 * `undefined` while the answer is unknown, `null` once we know there is none.
 *
 * The distinction matters because the /arena page renders the answer: starting
 * at `null` made it say "Aucune édition ouverte aux inscriptions" to every
 * visitor for the length of a Firestore round-trip, which on a slow Haitian
 * connection is long enough to read, believe and leave. A banner can treat
 * both as "show nothing" (`if (!open) return null`) and is unaffected.
 */
export function useOpenArena(): OpenArena | null | undefined {
  const [open, setOpen] = useState<OpenArena | null | undefined>(undefined);

  useEffect(() => {
    const q = query(collection(db, 'tournaments'), where('state', 'in', WATCHED_STATES));
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => {
          const v = d.data() as any;
          return {
            id: d.id,
            title: typeof v.title === 'string' ? v.title : d.id,
            titleHt: typeof v.titleHt === 'string' ? v.titleHt : (typeof v.title === 'string' ? v.title : d.id),
            isTest: v.isTest === true || v.testMode === true,
            state: String(v.state ?? ''),
            startsAt: millis(v.startsAt),
            schools: typeof v.counts?.schools === 'number' ? v.counts.schools : 0,
            players: typeof v.counts?.players === 'number' ? v.counts.players : 0,
          };
        });
        setOpen(pickOpenArena(rows));
      },
      () => setOpen(null),
    );
  }, []);

  return open;
}
