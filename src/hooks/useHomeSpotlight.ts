/**
 * useHomeSpotlight (web) — the one time-sensitive thing that opens the
 * Dashboard's content, if any: the Arène championship (sign-up open, doors
 * open, live) or a user tournament the student is in that is starting soon or
 * running. Same ordering as the app (shared/homeSpotlight.ts).
 *
 * Arène reads match `useOpenArena` (test/demo editions never announced on
 * web), plus `live`, plus the student's own registration for whichever event
 * is shown — which decides "play" vs "watch" once it is live.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../services/firebase';
import useStore from '../contexts/store';
import { subscribeRegistration } from '../services/arenaWebService';
import { listMine, watchTournament, type Tournament } from '../services/tournoisService';
import {
  arenaSpotlight, nearestTournoi, pickSpotlight, tournoiSpotlight,
  type ArenaSpotlight, type TournoiSpotlight,
} from '../../shared/homeSpotlight';

export interface SpotlightArenaDoc {
  id: string;
  title: string;
  titleHt: string;
  state: string;
  startsAt: number;
  doorsAt: number;
  minPlayers: number;
  schools: number;
  players: number;
  qualifiedSchools: number;
  isTest: boolean;
}

export type WebHomeSpotlight =
  | (ArenaSpotlight & { doc: SpotlightArenaDoc })
  | TournoiSpotlight;

function millis(v: any): number {
  if (!v) return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return 0;
}
const num = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function toSpotlightArenaDoc(id: string, v: any): SpotlightArenaDoc {
  const title = typeof v?.title === 'string' ? v.title : id;
  return {
    id,
    title,
    titleHt: typeof v?.titleHt === 'string' ? v.titleHt : title,
    state: String(v?.state ?? ''),
    startsAt: millis(v?.startsAt),
    doorsAt: millis(v?.doorsAt),
    minPlayers: num(v?.minPlayers),
    schools: num(v?.counts?.schools),
    players: num(v?.counts?.players),
    qualifiedSchools: num(v?.counts?.qualifiedSchools),
    isTest: v?.isTest === true || v?.testMode === true,
  };
}

/** Same rule as useOpenArena: test / demo editions never reach students on web. */
const announceable = (d: SpotlightArenaDoc) => !d.isTest && !/\b(test|demo|démo)\b/i.test(d.title);

/** Exported for tests: which open (doors > registration) and live event to consider. */
export function splitArenaDocs(rows: SpotlightArenaDoc[]) {
  const ok = rows.filter(announceable).sort((a, b) => a.startsAt - b.startsAt);
  return {
    open: ok.find((r) => r.state === 'doors') ?? ok.find((r) => r.state === 'registration') ?? null,
    live: ok.find((r) => r.state === 'live') ?? null,
  };
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useHomeSpotlight(): WebHomeSpotlight | null {
  const uid: string | null = useStore((s: any) => s.user?.uid ?? null);
  const now = useNow(30_000);

  const [arenaRows, setArenaRows] = useState<SpotlightArenaDoc[]>([]);
  useEffect(() => {
    const q = query(collection(db, 'tournaments'), where('state', 'in', ['doors', 'registration', 'live']));
    return onSnapshot(
      q,
      (snap) => setArenaRows(snap.docs.map((d) => toSpotlightArenaDoc(d.id, d.data()))),
      () => setArenaRows([]),
    );
  }, []);
  const { open, live } = splitArenaDocs(arenaRows);
  const shown = live ?? open;

  const [registered, setRegistered] = useState(false);
  useEffect(() => {
    setRegistered(false);
    if (!shown?.id || !uid) return undefined;
    return subscribeRegistration(shown.id, uid, (r) => setRegistered(!!r));
  }, [shown?.id, uid]);

  const arena = arenaSpotlight({ open, active: live, registered, now });
  const arenaItem = arena && shown ? { ...arena, doc: shown } : null;

  const { data: mine } = useQuery({
    queryKey: ['home-my-tournaments', uid],
    queryFn: () => listMine(uid as string),
    enabled: !!uid,
    staleTime: 5 * 60 * 1000,
  });
  const watchedId = nearestTournoi(mine, now)?.tid ?? null;
  const [doc, setDoc] = useState<Tournament | null>(null);
  useEffect(() => {
    setDoc(null);
    if (!watchedId) return undefined;
    return watchTournament(watchedId, (t) => setDoc(t));
  }, [watchedId]);
  const tournoi = doc && watchedId ? tournoiSpotlight({ ...doc, id: watchedId }, now) : null;

  return pickSpotlight<WebHomeSpotlight>([arenaItem, tournoi]);
}
