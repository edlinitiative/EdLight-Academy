import { useQuery } from '@tanstack/react-query';
import useStore from '../contexts/store';
import { getWeeklyTop, weekId } from '../services/leaderboardService';

export function useLeaderboard(max = 25) {
  const user = useStore((s) => s.user);
  const uid = user?.uid ?? null;
  const id = weekId();

  // Always fetch the same top-N so every consumer (compact widget, full
  // list…) shares ONE query/Firestore read; slice locally for smaller views.
  const fetchCount = Math.max(max, 25);

  const { data: entries, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['leaderboard-weekly', id, fetchCount],
    queryFn: () => getWeeklyTop(fetchCount, id),
    staleTime: 2 * 60 * 1000,
  });

  const list = entries || [];
  const myEntry = uid ? list.find((e: any) => e.id === uid) || null : null;

  return {
    entries: list.slice(0, max),
    myEntry,
    myRank: myEntry ? (myEntry as any).rank : null,
    isLoading,
    isFetching,
    refetch,
    weekId: id,
  };
}
