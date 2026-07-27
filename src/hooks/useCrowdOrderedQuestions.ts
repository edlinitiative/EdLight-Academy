import { useMemo, useRef } from 'react';
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
 *  2. **Frozen on first non-empty input.** The order is decided ONCE — the first
 *     render where `questions` is non-empty (handles pools that load async) —
 *     from stats already cached synchronously, and never changes again, so it
 *     can't reshuffle a quiz mid-session. A background fetch warms the cache so
 *     ordering applies from the next open. Worst case = the original order.
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

  // Decide the order exactly once — the first time we have real questions.
  const frozen = useRef<T[] | null>(null);
  return useMemo(() => {
    if (frozen.current) return frozen.current; // already decided → never reshuffle
    if (questions.length === 0) return questions; // wait for the pool to load
    let out = questions;
    if (crowdDifficultyActive() && ids.length > 0) {
      const stats = qc.getQueryData<Record<string, { seen: number; correct: number }>>([
        'questionStats',
        ids,
      ]);
      if (stats) {
        const withId = questions.map((q) => ({ ...q, questionId: questionIdFromStem(canonicalStemOf(q)) }));
        const withDiff = attachCrowdDifficulty(withId, stats); // sets difficulty from crowd
        // ability 0 → easiest-first scaffolding (warm up, then ramp). A per-learner
        // band ordering can replace this once quiz-level ability is wired. The casts
        // bridge the unconstrained generic T to the selector's {difficulty} contract;
        // the items themselves are the original questions, only reordered.
        out = selectAdaptiveItems(
          withDiff as unknown as Array<{ difficulty?: number }>,
          { ability: 0 },
        ) as unknown as T[];
      }
    }
    frozen.current = out;
    return out;
  }, [questions, ids, qc, canonicalStemOf]);
}
