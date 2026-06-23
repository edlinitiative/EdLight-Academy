/**
 * useLeaderboard — weekly XP leaderboard
 * ──────────────────────────────────────
 * Reads the current ISO-week's top entries and locates the signed-in user's
 * rank within them. Degrades gracefully to an empty list offline.
 */

import { useQuery } from '@tanstack/react-query';
import useStore from '../contexts/store';
import { getWeeklyTop, weekId } from '../services/leaderboardService';

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

  const list = entries || [];
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
