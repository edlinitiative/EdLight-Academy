/**
 * Which tournament is on air?
 *
 * The broadcast URL is `/direct` with no arguments. Somebody points a projector
 * at it in a school hall and leaves it there; nobody is going to paste a
 * tournament id into it at 18:39. So the page has to answer this itself.
 *
 * The order below is the order of what a viewer would want to see if they
 * walked in right now:
 *
 *   live · grading   — it is happening
 *   doors            — it is about to happen
 *   provisional      — it just happened and the podium is up
 *   final            — the most recent one, as a record
 *   registration     — the next one, as an announcement
 *
 * `?tid=` still wins when it is supplied, because a rehearsal needs to point
 * the stage at a draft nobody else can see.
 *
 * ── Why a listener rather than a fetch ──────────────────────────────────────
 * The transition from `registration` to `doors` to `live` happens while the
 * page is already open — that is the entire evening. A page that resolved this
 * once at load would sit on the announcement screen through the first five
 * questions.
 */

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../services/firebase';

/** Most interesting first. A tournament in an earlier state never wins. */
const PRIORITY = ['live', 'grading', 'doors', 'provisional', 'final', 'registration'] as const;

/**
 * Bounded on purpose. The collection holds one document a month and this query
 * runs on every spectator's browser; an unbounded read of a growing collection
 * is a bill that arrives quietly a year later.
 */
const WATCHED_STATES = [...PRIORITY];

function millis(v: any): number {
  if (!v) return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return 0;
}

export interface OnAir {
  tid: string | null;
  /** No tournament in any interesting state. The stage shows its resting page. */
  none: boolean;
  loading: boolean;
}

/**
 * Pure: pick the tournament a viewer walking in now should be shown.
 *
 * Exported for tests — the ordering is a product decision, not an
 * implementation detail, and it is the kind of thing that is quietly wrong for
 * a month before anyone notices they were watching last month's champion.
 */
export function pickOnAir(
  rows: { id: string; state: string; startsAt: number }[],
): string | null {
  for (const state of PRIORITY) {
    const inState = rows.filter((r) => r.state === state);
    if (inState.length === 0) continue;
    // Several in one state is not expected, but if it happens the most recent
    // start is the one that is actually being played.
    return inState.sort((a, b) => b.startsAt - a.startsAt)[0].id;
  }
  return null;
}

export function useOnAir(explicitTid?: string | null): OnAir {
  const [tid, setTid] = useState<string | null>(explicitTid || null);
  const [loading, setLoading] = useState(!explicitTid);
  const [none, setNone] = useState(false);

  useEffect(() => {
    if (explicitTid) { setTid(explicitTid); setLoading(false); setNone(false); return undefined; }

    const q = query(collection(db, 'tournaments'), where('state', 'in', WATCHED_STATES));
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => {
          const v = d.data() as any;
          return { id: d.id, state: String(v.state ?? ''), startsAt: millis(v.startsAt) };
        });
        const picked = pickOnAir(rows);
        setTid(picked);
        setNone(picked === null);
        setLoading(false);
      },
      () => {
        // A rules refusal or a dropped connection must not leave a projector on
        // a spinner. The stage falls back to its resting page, which is real.
        setNone(true);
        setLoading(false);
      },
    );
  }, [explicitTid]);

  return { tid, none, loading };
}
