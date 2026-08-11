import { useQuery } from '@tanstack/react-query';
import useStore from '../contexts/store';
import { getWeeklyTop, getAllTimeTop, getCollectives, weekId, prevWeekId, isValidAlias } from '../services/leaderboardService';
import { computeRankDeltas } from '../utils/rankDeltas';
import type { GroupField } from '../../../shared/leaderboardAgg';

/** Hide alias-less and opted-out entries; re-rank so the board shows no gaps. */
function toBoard(entries: any[] | undefined) {
  return (entries || [])
    .filter((e: any) => isValidAlias(e.displayName) && e.hidden !== true)
    .map((e: any, i: number) => ({ ...e, rank: i + 1 }));
}

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
  const currentList = toBoard(entries);

  // The weekly board resets every Monday (each ISO week is its own
  // subcollection), so early in the week it can be legitimately empty. A blank
  // board reads as broken and gives new visitors nothing to aim at — fall back
  // to LAST week's results (labeled by the consumer via `showingLastWeek`)
  // until someone scores this week.
  const weekIsEmpty = period === 'week' && !isLoading && currentList.length === 0;
  const lastId = prevWeekId();
  const { data: prevEntries, isLoading: prevLoading } = useQuery({
    queryKey: ['leaderboard-weekly', lastId, fetchCount],
    queryFn: () => getWeeklyTop(fetchCount, lastId),
    staleTime: 2 * 60 * 1000,
    enabled: weekIsEmpty,
  });
  const prevList = toBoard(prevEntries);

  const showingLastWeek = weekIsEmpty && prevList.length > 0;
  const list = showingLastWeek ? prevList : currentList;
  const myEntry = uid ? list.find((e: any) => e.id === uid) || null : null;

  // Day-over-day movement (▲ / ▼) — device-local snapshot, current week only.
  // A fallback (last-week) board is final, so it never shows movement.
  const deltaSignature = list.map((e: any) => `${e.id}:${e.rank}`).join(',');
  const { data: deltas } = useQuery({
    queryKey: ['leaderboard-deltas', id, deltaSignature],
    queryFn: () => computeRankDeltas(id, list),
    enabled: period === 'week' && !showingLastWeek && list.length > 0,
    staleTime: Infinity,
  });

  return {
    entries: list.slice(0, max),
    /** rank movement per entry id since yesterday (positive = climbed). */
    deltas: (period === 'week' && !showingLastWeek ? deltas : undefined) || {},
    myEntry,
    myRank: myEntry ? (myEntry as any).rank : null,
    isLoading: isLoading || (weekIsEmpty && prevLoading),
    isFetching,
    refetch,
    weekId: id,
    /** True when the fresh week has no entries yet and last week's board is shown instead. */
    showingLastWeek,
  };
}

/**
 * useCollectives — exhaustive school/city/department ranking for a period.
 * Server-aggregated (GET /api/leaderboard/collectives) so the totals count
 * every opted-in learner, not just the individual top-N the board fetches.
 * Only runs when `enabled` (i.e. a collective tab is actually open).
 */
export function useCollectives(field: GroupField, period: 'week' | 'all' = 'week', enabled = true) {
  const { data, isPending, isFetching } = useQuery({
    queryKey: ['leaderboard-collectives', field, period],
    queryFn: () => getCollectives(field, period),
    staleTime: 2 * 60 * 1000,
    enabled,
  });

  return {
    groups: data || [],
    isLoading: enabled && isPending,
    isFetching,
  };
}
