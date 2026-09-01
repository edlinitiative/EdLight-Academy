/**
 * useExamAttempts — `examId -> { percentage, attempted, submittedAtMs }`
 * merged from two sources, keeping the best score seen:
 *   1. Firestore result summaries (signed-in users, cross-device)
 *   2. sessionStorage `exam-result-*` (works for everyone in this session)
 *
 * Extracted from ExamBrowser so the exam overview + history subpages share
 * the exact same "already done / best score" truth.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import useStore from '../contexts/store';
import { loadAllExamResultSummaries } from '../services/examResults';

export interface ExamAttemptInfo {
  percentage: number | null;
  attempted: boolean;
  submittedAtMs: number | null;
}

export function useExamAttempts(): Record<string, ExamAttemptInfo> {
  const userId = useStore((s) => s.user?.uid);

  const { data: remote } = useQuery({
    queryKey: ['exam-attempts', userId],
    queryFn: () => loadAllExamResultSummaries(userId),
    enabled: !!userId,
    staleTime: 60_000,
  });

  return useMemo(() => {
    const map: Record<string, ExamAttemptInfo> = {};
    const add = (id: unknown, percentage: unknown, ms?: number | null) => {
      if (id == null) return;
      const key = String(id);
      const pct = typeof percentage === 'number' ? percentage : null;
      const prev = map[key];
      if (!prev || (pct != null && (prev.percentage == null || pct > prev.percentage))) {
        map[key] = { percentage: pct, attempted: true, submittedAtMs: ms ?? prev?.submittedAtMs ?? null };
      }
    };

    if (remote) {
      for (const [id, info] of Object.entries(remote) as [string, any][]) {
        add(id, info?.percentage, info?.submittedAtMs);
      }
    }

    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (!k || !k.startsWith('exam-result-')) continue;
        const raw = sessionStorage.getItem(k);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        add(parsed.examId ?? k.slice('exam-result-'.length), parsed.result?.summary?.percentage, parsed.timestamp);
      }
    } catch { /* sessionStorage may be unavailable */ }

    return map;
  }, [remote]);
}

export default useExamAttempts;
