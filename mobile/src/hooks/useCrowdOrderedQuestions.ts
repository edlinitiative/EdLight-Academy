import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { loadQuestionStats } from '../services/answerEventsService';
import {
  questionIdFromStem,
  attachCrowdDifficulty,
  selectAdaptiveItems,
  crowdDifficultyActive,
} from '../services/adaptiveEngine';

/**
 * Order a question set by crowd difficulty once the pipeline has enough data
 * (Adaptive Engine, Slice 3b — the auto-launching consumer).
 *
 * Two guarantees make this safe to ship today, dark until it matters:
 *  1. **Auto-gated.** Does nothing until crowdDifficultyActive() (the ~3-month
 *     date backstop) AND, per question, the MIN_QUESTION_EXPOSURES floor inside
 *     crowdDifficulty — so a question only reorders once enough people answered
 *     it. Until then it's a pure pass-through (authored order).
 *  2. **Frozen at mount.** The order is computed ONCE, from stats already cached
 *     synchronously — it never reshuffles mid-quiz. A background fetch warms the
 *     cache so ordering applies from the next open. Worst case = current order.
 *
 * `canonicalStemOf` must return the stable FR stem so IDs match the crowd log.
 */
export function useCrowdOrderedQuestions<T>(
  questions: T[],
  canonicalStemOf: (q: T) => string,
): T[] {
  const qc = useQueryClient();

  const ids = useMemo(
    () => questions.map((q) => questionIdFromStem(canonicalStemOf(q))).filter(Boolean),
    [questions, canonicalStemOf],
  );

  // Warm the cache (this open may still use authored order; next open benefits).
  useQuery({
    queryKey: ['questionStats', ids],
    queryFn: () => loadQuestionStats(ids),
    enabled: ids.length > 0 && crowdDifficultyActive(),
    staleTime: 60 * 60 * 1000, // difficulty drifts slowly
  });

  // Freeze the order once, from synchronously-cached stats — no mid-quiz reshuffle.
  const [ordered] = useState<T[]>(() => {
    if (!crowdDifficultyActive() || ids.length === 0) return questions;
    const stats = qc.getQueryData<Record<string, { seen: number; correct: number }>>([
      'questionStats',
      ids,
    ]);
    if (!stats) return questions; // not cached yet → authored order this session
    const withId = questions.map((q) => ({ ...q, questionId: questionIdFromStem(canonicalStemOf(q)) }));
    const withDiff = attachCrowdDifficulty(withId, stats); // sets difficulty from crowd
    // ability 0 → easiest-first scaffolding (warm up, then ramp). A per-learner
    // band ordering can replace this once quiz-level ability is wired. The casts
    // bridge the unconstrained generic T to the selector's {difficulty} contract;
    // the items themselves are the original questions, only reordered.
    const ordered = selectAdaptiveItems(
      withDiff as unknown as Array<{ difficulty?: number }>,
      { ability: 0 },
    );
    return ordered as unknown as T[];
  });

  return ordered;
}
