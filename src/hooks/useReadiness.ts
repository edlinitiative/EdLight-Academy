/**
 * useReadiness — assembles the Exam Readiness Score
 * ─────────────────────────────────────────────────
 * Blends two grounded signals into one coefficient-weighted score:
 *   1. Mock-exam results (joined to canonical subjects via the slim catalog index)
 *   2. Study-plan subject mastery (SRS practice history)
 *
 * Returns the full `computeReadiness` summary plus loading state.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import useStore from '../contexts/store';
import { TRACK_COEFFICIENTS } from '../config/trackConfig';
import { normalizeSubject } from '../utils/examUtils';
import { normalizeExamCatalog } from '../utils/examCatalog';
import { listRecentExamResults } from '../services/userActivity';
import { useStudyPlan } from './useStudyPlan';
import {
  computeReadiness,
  aggregateExamResultsBySubject,
  masteryToSubjectStats,
  mergeSubjectStats,
} from '../services/readinessService';

export function useReadiness() {
  const { user, track } = useStore();
  const uid = user?.uid ?? null;
  const coefficients = useMemo(() => TRACK_COEFFICIENTS[track] || {}, [track]);

  // exam_id → canonical subject (shared, cached forever — it's a static asset).
  const { data: subjectByExamId, isLoading: indexLoading } = useQuery({
    queryKey: ['exam-subject-index'],
    queryFn: async () => {
      const res = await fetch('/exam_catalog_index.json');
      if (!res.ok) throw new Error('Failed to load exam catalog index');
      const data = normalizeExamCatalog(await res.json());
      const map = {};
      for (const e of data) {
        const id = e.exam_id || e.id;
        if (id) map[id] = normalizeSubject(e.subject);
      }
      return map;
    },
    staleTime: Infinity,
  });

  const { data: examResults, isLoading: resultsLoading } = useQuery({
    queryKey: ['exam-results-by-subject', uid],
    queryFn: () => listRecentExamResults(uid, 300),
    enabled: !!uid,
    staleTime: 5 * 60 * 1000,
  });

  const { mastery, hasPlan } = useStudyPlan();

  const readiness = useMemo(() => {
    const examAgg = aggregateExamResultsBySubject(examResults || [], subjectByExamId || {});
    const masteryAgg = masteryToSubjectStats(mastery || {});
    const subjectStats = mergeSubjectStats(examAgg, masteryAgg);
    return computeReadiness({ subjectStats, coefficients });
  }, [examResults, subjectByExamId, mastery, coefficients]);

  return {
    ...readiness,
    track,
    hasPlan,
    isLoading: indexLoading || (!!uid && resultsLoading),
  };
}
