/**
 * useLeaderboard — weekly XP leaderboard
 * ──────────────────────────────────────
 * Reads the current ISO-week's top entries and locates the signed-in user's
 * rank within them. Degrades gracefully to an empty list offline.
 */

import { useQuery } from '@tanstack/react-query';
import useStore from '../contexts/store';
import { getWeeklyTop, weekId, isValidAlias } from '../services/leaderboardService';

export function useLeaderboard(max = 25) {
  const user = useStore((s) => s.user);
  const uid = user?.uid ?? null;
  const id = weekId();

  const { data: entries, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['leaderboard-weekly', id, max],
    queryFn: () => getWeeklyTop(max, id),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  // Entries without a usable pseudo (legacy "." etc.) keep their XP in
  // Firestore but never render publicly — re-rank over the named ones so the
  // board shows no gaps. A nameless viewer gets myRank=null and is prompted
  // to pick a pseudo by the Leaderboard UI.
  const list = (entries || [])
    .filter((e) => isValidAlias(e.displayName))
    .map((e, i) => ({ ...e, rank: i + 1 }));
  const myEntry = uid ? list.find((e) => e.id === uid) || null : null;

  return {
    entries: list,
    myEntry,
    myRank: myEntry ? myEntry.rank : null,
    isLoading,
    isFetching,
    refetch,
    weekId: id,
  };
}
