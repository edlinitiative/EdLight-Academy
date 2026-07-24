/**
 * useTrivia — gamification state for the Trivia experience
 * ────────────────────────────────────────────────────────
 * Loads the user's XP/level/daily-challenge profile and exposes a `recordResult`
 * mutation that persists a finished round (and surfaces the XP reward so the UI
 * can celebrate it). Guests get a local, non-persisted XP preview.
 */

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import useStore from '../contexts/store';
import { getFirstName } from '../utils/shared';
import {
  loadTriviaProfile,
  recordTriviaResult,
  defaultTriviaProfile,
  levelInfo,
  getDailyChallengeState,
  computeXpEarned,
  setLeaderboardOptIn as svcSetLeaderboardOptIn,
  recordGameResult as svcRecordGameResult,
  computeGameXp,
} from '../services/triviaService';
import { success } from '../utils/haptics';

const triviaKey = (uid: string | null) => ['trivia-profile', uid];

export function useTrivia() {
  const user = useStore((s) => s.user);
  const uid = user?.uid ?? null;
  const qc = useQueryClient();
  const [lastReward, setLastReward] = useState<any>(null);

  const { data: profile, isLoading } = useQuery({
    queryKey: triviaKey(uid),
    queryFn: () => loadTriviaProfile(uid),
    enabled: !!uid,
    staleTime: 60 * 1000,
  });

  const safe = profile || defaultTriviaProfile();
  const level = levelInfo(safe.xp || 0);
  const daily = getDailyChallengeState(safe);

  const recordResult = useCallback(
    async ({ category, score, total, isDaily }: { category: any; score: number; total: number; isDaily?: boolean }) => {
      if (!uid) {
        // Guest: show what they *would* have earned, but don't persist.
        const reward = {
          xpEarned: computeXpEarned({ score, total, isDaily }),
          leveledUp: false,
          prevLevel: 1,
          newLevel: 1,
          guest: true,
        };
        setLastReward(reward);
        return reward;
      }
      const res = await recordTriviaResult(uid, { category, score, total, isDaily, defaultName: getFirstName(user) });
      qc.setQueryData(triviaKey(uid), res.profile);
      // Leveling up is a milestone — punctuate it with a success haptic.
      if (res?.leveledUp) success();
      setLastReward(res);
      return res;
    },
    [uid, qc, user],
  );

  // Arcade (non-trivia) games — same reward contract as recordResult.
  const recordGameResult = useCallback(
    async ({ gameId, score, maxScore }: { gameId: string; score: number; maxScore: number }) => {
      if (!uid) {
        const reward = {
          xpEarned: computeGameXp({ score, maxScore }),
          leveledUp: false,
          prevLevel: 1,
          newLevel: 1,
          guest: true,
        };
        setLastReward(reward);
        return reward;
      }
      const res = await svcRecordGameResult(uid, { gameId, score, maxScore });
      qc.setQueryData(triviaKey(uid), res.profile);
      setLastReward(res);
      return res;
    },
    [uid, qc],
  );

  const setLeaderboardOptIn = useCallback(
    async (opts: any) => {
      if (!uid) return;
      const updated = await svcSetLeaderboardOptIn(uid, opts);
      if (updated) qc.setQueryData(triviaKey(uid), updated);
      else qc.invalidateQueries({ queryKey: triviaKey(uid) });
    },
    [uid, qc],
  );

  return {
    profile: safe,
    isLoading: !!uid && isLoading,
    level,
    daily,
    isAuthed: !!uid,
    recordResult,
    recordGameResult,
    lastReward,
    clearReward: () => setLastReward(null),
    setLeaderboardOptIn,
  };
}
