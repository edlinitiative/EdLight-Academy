/**
 * useLeaderboard — weekly XP leaderboard
 * ──────────────────────────────────────
 * Reads the current ISO-week's top entries and locates the signed-in user's
 * rank within them. Degrades gracefully to an empty list offline.
 */

import { useQuery } from '@tanstack/react-query';
import useStore from '../contexts/store';
import { getWeeklyTop, getAllTimeTop, getCollectives, getUserWeeklyRank, weekId, isValidAlias } from '../services/leaderboardService';
import type { GroupField } from '../../shared/leaderboardAgg';

export function useLeaderboard(max = 25, period: 'week' | 'all' = 'week') {
  const user = useStore((s) => s.user);
  const uid = user?.uid ?? null;
  const id = weekId();
  const periodId = period === 'all' ? 'all-time' : id;

  const { data: entries, isPending: isLoading, refetch, isFetching } = useQuery({
    queryKey: ['leaderboard-weekly', periodId, max],
    queryFn: () => (period === 'all' ? getAllTimeTop(max) : getWeeklyTop(max, id)),
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
  const myEntryInPage = uid ? list.find((e) => e.id === uid) || null : null;

  // When the learner isn't in the fetched page, look up their exact rank via a
  // count aggregate — otherwise a genuinely-ranked user past the top-N wrongly
  // saw the "join" CTA / "—". Only fires when needed.
  const needsRankLookup = !!uid && !isLoading && !myEntryInPage;
  const { data: fallbackRank } = useQuery({
    queryKey: ['leaderboard-my-rank', periodId, uid],
    queryFn: () => getUserWeeklyRank(uid, periodId),
    enabled: needsRankLookup,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const myEntry = myEntryInPage || fallbackRank?.entry || null;
  const myRank = myEntryInPage ? myEntryInPage.rank : (fallbackRank?.rank ?? null);

  return {
    entries: list,
    myEntry,
    myRank,
    isLoading,
    isFetching,
    refetch,
    weekId: id,
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
    refetchOnWindowFocus: true,
    enabled,
  });

  return {
    groups: data || [],
    // isPending is `true` for a disabled query that never ran; only surface
    // loading when the query is actually enabled.
    isLoading: enabled && isPending,
    isFetching,
  };
}
