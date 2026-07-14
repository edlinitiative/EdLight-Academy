import { useQuery } from '@tanstack/react-query';
import useStore from '../contexts/store';
import { getWeeklyTop, getAllTimeTop, weekId, isValidAlias } from '../services/leaderboardService';

export function useLeaderboard(max = 25, period: 'week' | 'all' = 'week') {
  const user = useStore((s) => s.user);
  const uid = user?.uid ?? null;
  const id = weekId();

  // Always fetch the same top-N so every consumer (compact widget, full
  // list…) shares ONE query/Firestore read; slice locally for smaller views.
  const fetchCount = Math.max(max, 25);

  const { data: entries, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['leaderboard-weekly', period === 'all' ? 'all-time' : id, fetchCount],
    queryFn: () => (period === 'all' ? getAllTimeTop(fetchCount) : getWeeklyTop(fetchCount, id)),
    staleTime: 2 * 60 * 1000,
  });

  // Entries without a usable pseudo (legacy "." etc.) keep their XP in
  // Firestore but never render publicly — re-rank over the named ones so the
  // board shows no gaps. A nameless viewer gets myRank=null and is prompted
  // to pick a pseudo by the Leaderboard UI.
  const list = (entries || [])
    .filter((e: any) => isValidAlias(e.displayName))
    .map((e: any, i: number) => ({ ...e, rank: i + 1 }));
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
