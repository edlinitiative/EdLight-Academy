import type { GroupField, GroupRanking } from '../../shared/leaderboardAgg';

/**
 * Exhaustive collective ranking (schools/cities/departments) for the period,
 * computed server-side over ALL entries — see GET /api/leaderboard/collectives.
 * Returns [] on error/offline so the caller can fall back to a local aggregate.
 */
export async function getCollectives(
  field: GroupField,
  period: 'week' | 'all' = 'week',
): Promise<GroupRanking[]> {
  try {
    const res = await fetch(`/api/leaderboard/collectives?field=${field}&period=${period}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.groups) ? (data.groups as GroupRanking[]) : [];
  } catch (err) {
    console.error('[Leaderboard] getCollectives error:', err);
    return [];
  }
}
