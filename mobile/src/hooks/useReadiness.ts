import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import useStore from '../contexts/store';
import { TRACK_COEFFICIENTS } from '../config/trackConfig';
import { normalizeSubject } from '../utils/examUtils';
import { fetchCatalogIndex } from '../utils/examCatalog';
import { listRecentExamResults } from '../services/userActivity';
import {
  computeReadiness,
  aggregateExamResultsBySubject,
  mergeSubjectStats,
} from '../services/readinessService';

export function useReadiness() {
  const { user, track } = useStore();
  const uid = user?.uid ?? null;
  const coefficients = useMemo(() => (track ? (TRACK_COEFFICIENTS as Record<string, any>)[track] : null) || {}, [track]);

  const { data: subjectByExamId, isLoading: indexLoading } = useQuery({
    queryKey: ['exam-subject-index'],
    queryFn: async () => {
      // Cache-first (AsyncStorage) with background refresh — the raw fetch
      // here used to re-download the ~280 KB index on every cold start.
      const data = await fetchCatalogIndex();
      if (!data.length) throw new Error('Failed to load exam catalog index');
      const map: Record<string, string> = {};
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
    queryFn: () => listRecentExamResults(uid as string, 300),
    enabled: !!uid,
    staleTime: 5 * 60 * 1000,
  });

  const readiness = useMemo(() => {
    const examAgg = aggregateExamResultsBySubject(examResults || [], subjectByExamId || {});
    const subjectStats = mergeSubjectStats(examAgg, {});
    return computeReadiness({ subjectStats, coefficients });
  }, [examResults, subjectByExamId, coefficients]);

  return {
    ...readiness,
    track,
    hasPlan: false,
    isLoading: indexLoading || (!!uid && resultsLoading),
  };
}
