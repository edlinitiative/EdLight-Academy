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
import { success } from '../utils/haptics';
import { queryKeys } from '../lifecycle/queryKeys';

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

  const [newMilestones, setNewMilestones] = useState<any[]>([]);

  const { data: streak, isLoading } = useQuery({
    // Per-student key: a shared key served one student's streak to the next.
    queryKey: queryKeys.streak(uid),
    queryFn: () => loadStreak(uid),
    enabled: !!uid,
    staleTime: 5 * 60_000, // 5 min
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
    qc.setQueryData(queryKeys.streak(uid), updated);

    if (milestones.length > 0) {
      // Reaching a streak milestone is a genuine win — celebrate it with a
      // success haptic (the visual celebration is surfaced by the UI).
      success();
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
