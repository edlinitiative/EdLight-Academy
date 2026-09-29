/**
 * useCollectives — exhaustive school/city/department ranking for a period.
 * Server-aggregated (GET /api/leaderboard/collectives) so the totals count
 * every opted-in learner, not just the individual top-N the board fetches.
 * Only runs when `enabled` (i.e. a collective tab is actually open).
 *
 * Its own module, importing only the fetch: through useLeaderboard it pulled
 * leaderboardService, and with it the whole Firebase SDK, onto the landing
 * page's critical path for a request that never touches Firestore.
 */

import { useQuery } from '@tanstack/react-query';
import { getCollectives } from '../services/collectivesService';
import type { GroupField } from '../../shared/leaderboardAgg';

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
