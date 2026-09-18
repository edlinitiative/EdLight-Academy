/**
 * The stage's one connection to the tournament.
 *
 * Three listeners and a director. Nothing else on the broadcast subscribes to
 * anything: a page with a listener per scene would open and close sockets as
 * scenes change, and the moment a lead change takes the screen is exactly the
 * moment you cannot afford a reconnect.
 *
 * ── Why a listener and not a poll ──────────────────────────────────────────
 * Standings are ONE document every spectator subscribes to, and the event feed
 * is an append-only subcollection. That is the whole reason the Arena chose
 * Firestore listeners over a websocket service: the fan-out is the database's
 * problem, and a broadcast that polls is a broadcast that is four seconds
 * behind the room it is describing.
 *
 * ── Why the events query is bounded ────────────────────────────────────────
 * A tournament emits a few hundred events. Reading all of them on every
 * reconnect would re-play the entire match through the director, which
 * de-duplicates by `seq` and would therefore show nothing — but would still
 * pay for the read. The listener takes the tail, and the director ignores any
 * `seq` it has already seen, so a reconnect mid-match resumes rather than
 * restarts.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, limitToLast, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../services/firebase';
import { createDirector, type Director, type Scene } from '../../shared/arena/director';
import type { ArenaEvent, StandingsSnapshot } from '../../shared/arena/events';
import type { MapPlace, StageData, StageTournament } from './sceneContract';

/** The tail of the feed a reconnecting stage needs to catch up on. */
const EVENT_TAIL = 60;

/** The board's own heartbeat. 100ms is finer than any dwell the director uses. */
const TICK_MS = 100;

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = ''): string => (typeof v === 'string' && v ? v : d);

function millis(v: any): number {
  if (!v) return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return 0;
}

export interface StageState {
  scene: Scene;
  /** Milliseconds the current scene has held the screen. */
  elapsed: number;
  data: StageData;
  /** No tournament document at that id. */
  absent: boolean;
  loading: boolean;
}

export interface UseStageOptions {
  places?: MapPlace[];
  unplacedSchools?: number;
  isCreole?: boolean;
}

export function useStage(tid: string | null | undefined, opts: UseStageOptions = {}): StageState {
  const [tournament, setTournament] = useState<StageTournament | null>(null);
  const [standings, setStandings] = useState<StandingsSnapshot | null>(null);
  const [absent, setAbsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  // The director survives re-renders: it holds the seen-`seq` set and the
  // current scene's start time, and rebuilding it would restart the scene
  // underneath the viewer on every state change.
  const directorRef = useRef<Director | null>(null);
  if (directorRef.current === null) directorRef.current = createDirector();

  // ── The tournament ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tid) { setTournament(null); setLoading(false); return undefined; }
    setLoading(true);
    return onSnapshot(
      doc(db, 'tournaments', tid),
      (snap) => {
        const d = snap.data() as any;
        setLoading(false);
        if (!d) { setTournament(null); setAbsent(true); return; }
        setAbsent(false);
        setTournament({
          id: tid,
          title: str(d.title, tid),
          state: str(d.state, 'draft'),
          startsAt: millis(d.startsAt),
          doorsAt: millis(d.doorsAt),
          questionCount: num(d.questionCount),
          currentIndex: num(d.currentQuestion?.index, -1),
          counts: {
            schools: num(d.counts?.schools),
            players: num(d.counts?.players),
            qualifiedSchools: num(d.counts?.qualifiedSchools),
          },
        });
      },
      () => { setLoading(false); setAbsent(true); },
    );
  }, [tid]);

  // ── The board ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tid) { setStandings(null); return undefined; }
    return onSnapshot(
      doc(db, 'tournaments', tid, 'standings', 'current'),
      (snap) => setStandings((snap.data() as StandingsSnapshot) ?? null),
      () => setStandings(null),
    );
  }, [tid]);

  // ── The feed ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tid) return undefined;
    const q = query(
      collection(db, 'tournaments', tid, 'events'),
      orderBy('seq'),
      limitToLast(EVENT_TAIL),
    );
    return onSnapshot(q, (snap) => {
      // Only additions matter. A modified event is not a thing the server
      // writes, and re-pushing the whole tail on every change would be free
      // for the director (it de-duplicates) and wasteful for everyone else.
      const added = snap.docChanges()
        .filter((c) => c.type === 'added')
        .map((c) => c.doc.data() as ArenaEvent);
      if (added.length > 0) directorRef.current?.push(added);
    });
  }, [tid]);

  // ── The clock ─────────────────────────────────────────────────────────────
  //
  // One interval for the whole stage. Every scene reads `elapsed` from here
  // rather than running its own timer, so twenty sequences cost one timer and
  // a scene can never outlive its own animation.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const scene = directorRef.current.tick(now);

  const data: StageData = useMemo(() => ({
    tournament,
    standings,
    places: opts.places ?? [],
    unplacedSchools: opts.unplacedSchools ?? 0,
    isCreole: opts.isCreole ?? false,
    now,
  }), [tournament, standings, opts.places, opts.unplacedSchools, opts.isCreole, now]);

  return { scene, elapsed: Math.max(0, now - scene.since), data, absent, loading };
}
