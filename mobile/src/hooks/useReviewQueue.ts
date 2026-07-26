import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import useStore from '../contexts/store';
import { TRACK_COEFFICIENTS } from '../config/trackConfig';
import { loadDueReviews } from '../services/reviewService';
import type { ReviewItem } from '../services/adaptiveEngine';

/**
 * Reviews due today, priority-sorted (Adaptive Engine, Slice 2). Coefficient-
 * weighted by the student's track when known, so a high-coefficient subject
 * surfaces above a minor one at equal overdueness. Empty when signed out or
 * nothing is due — the Home card simply renders nothing.
 */
export function useReviewQueue(): { reviewQueue: ReviewItem[]; isLoading: boolean } {
  const user = useStore((s) => s.user);
  const track = useStore((s) => s.track);
  const uid = user?.uid ?? null;

  const coefficients = useMemo(
    () => (track ? (TRACK_COEFFICIENTS as Record<string, any>)[track] : null) || {},
    [track],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['review-queue', uid],
    queryFn: () => loadDueReviews(uid as string, coefficients),
    enabled: !!uid,
    staleTime: 5 * 60 * 1000,
    // Overdueness is computed against `now` at fetch time; refetch on focus so a
    // review that comes due while the app is backgrounded appears on return.
    refetchOnWindowFocus: true,
  });

  return { reviewQueue: data ?? [], isLoading };
}
