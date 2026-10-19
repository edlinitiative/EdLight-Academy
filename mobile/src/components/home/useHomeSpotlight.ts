/**
 * useHomeSpotlight — the one time-sensitive thing that opens Accueil, if any.
 *
 * Reads only what already exists: the Arène's open / active tournament and
 * this student's registration for it, plus the user tournaments the student
 * joined or created (`users/{uid}/myTournaments`) — one of which, the nearest
 * in time, is watched live for its real state. The ordering itself is pure
 * and shared with the web (shared/homeSpotlight.ts).
 *
 * Not covered, on purpose: a duel "received". Duels are link-addressed — the
 * data model has no addressee to query (see hooks/useChallenges.ts) — so
 * there is no honest "someone challenged you" to surface.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import useStore from '../../contexts/store';
import { useOpenArenaTournament, useActiveArenaTournament, useArenaMyRegistration, useNow } from '../../hooks/useArena';
import { listMine, watchTournament, type Tournament } from '../../services/tournoisService';
import { queryKeys } from '../../lifecycle/queryKeys';
import {
  arenaSpotlight, nearestTournoi, pickSpotlight, tournoiSpotlight,
  type ArenaSpotlight, type TournoiSpotlight,
} from '../../../../shared/homeSpotlight';
import type { ArenaTournament } from '../../services/arenaService';

export type HomeSpotlight =
  | (ArenaSpotlight & { tournament: ArenaTournament })
  | TournoiSpotlight;

export function useHomeSpotlight(): HomeSpotlight | null {
  const uid = useStore((s) => s.user?.uid ?? null) as string | null;
  // Re-evaluated every 30s so "soon" turns into "live" without a refresh; the
  // card runs its own 1s clock for the countdown.
  const now = useNow(30_000);

  const { data: open } = useOpenArenaTournament();
  const { data: active } = useActiveArenaTournament();
  const live = active && active.state === 'live' ? active : null;
  const shownId = live?.id ?? open?.id ?? null;
  const { data: registration } = useArenaMyRegistration(shownId);

  const arena = arenaSpotlight({ open, active: live, registered: !!registration, now });
  const arenaItem = arena ? { ...arena, tournament: (live ?? open) as ArenaTournament } : null;

  const { data: mine } = useQuery({
    queryKey: queryKeys.myTournaments(uid),
    queryFn: () => listMine(uid as string),
    enabled: !!uid,
    staleTime: 5 * 60 * 1000,
  });
  const nearest = nearestTournoi(mine, now);
  const watchedId = nearest?.tid ?? null;
  const [doc, setDoc] = useState<Tournament | null>(null);
  useEffect(() => {
    setDoc(null);
    if (!watchedId) return undefined;
    try {
      return watchTournament(watchedId, (t) => setDoc(t));
    } catch {
      return undefined;
    }
  }, [watchedId]);
  const tournoi = doc && watchedId ? tournoiSpotlight({ ...doc, id: watchedId }, now) : null;

  return pickSpotlight<HomeSpotlight>([arenaItem, tournoi]);
}
