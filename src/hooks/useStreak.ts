/**
 * useStreak Hook
 * ──────────────
 * TanStack-Query–powered hook that loads & caches the global streak,
 * provides a `recordActivity` mutation, and surfaces milestone events.
 */

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import useStore from '../contexts/store';
import {
  loadStreak,
  recordActivity as recordStreakActivity,
  getNextMilestone,
  buildHeatmapData,
} from '../services/streakService';

const STREAK_KEY = ['global-streak'];

/**
 * Primary hook consumed by StreakBadge, StreakWidget, etc.
 *
 * @returns {{
 *   streak: object,
 *   isLoading: boolean,
 *   heatmap: Array,
 *   nextMilestone: object | null,
 *   recordActivity: () => Promise<object[]>,
 *   newMilestones: object[],
 *   dismissMilestones: () => void,
 * }}
 */
export function useStreak() {
  const user = useStore((s) => s.user);
  const uid = user?.uid ?? null;
  const qc = useQueryClient();

  const [newMilestones, setNewMilestones] = useState([]);

  const { data: streak, isPending: isLoading } = useQuery({
    queryKey: STREAK_KEY,
    queryFn: () => loadStreak(uid),
    enabled: !!uid,
    staleTime: 5 * 60_000, // 5 min
    refetchOnWindowFocus: true,
  });

  const safeStreak = streak ?? {
    currentStreak: 0,
    longestStreak: 0,
    activeDays: [],
    frozenDays: [],
    milestones: [],
    lastActivityDate: null,
    totalActiveDays: 0,
    streakFreezes: 0,
  };

  const heatmap = buildHeatmapData(safeStreak.activeDays, 12, safeStreak.frozenDays || []);

  const nextMilestone = getNextMilestone(
    safeStreak.currentStreak,
    safeStreak.milestones,
  );

  /**
   * Record a study activity for today.
   * Returns the array of newly-unlocked milestones (may be empty).
   */
  const recordActivity = useCallback(async () => {
    if (!uid) return [];
    const { streak: updated, newMilestones: milestones } =
      await recordStreakActivity(uid);

    // Optimistically update cache
    qc.setQueryData(STREAK_KEY, updated);

    if (milestones.length > 0) {
      setNewMilestones(milestones);
    }

    return milestones;
  }, [uid, qc]);

  /** Dismiss the milestone celebration overlay */
  const dismissMilestones = useCallback(() => setNewMilestones([]), []);

  return {
    streak: safeStreak,
    isLoading,
    heatmap,
    nextMilestone,
    recordActivity,
    newMilestones,
    dismissMilestones,
  };
}
