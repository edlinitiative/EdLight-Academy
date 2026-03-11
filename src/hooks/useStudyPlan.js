/**
 * useStudyPlan — React hook for study plan state management
 * ──────────────────────────────────────────────────────────
 * Wraps studyPlanService with TanStack Query for cache/invalidation
 * and provides helpers for the StudyPlan page.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import useStore from '../contexts/store';
import { getCurrentUser } from '../services/firebase';
import {
  loadActiveStudyPlan,
  createStudyPlan,
  updateStudyPlan,
  deleteStudyPlan,
  recordTaskResult,
  getTodayTasks,
  getUpcomingTasks,
  computeSubjectMastery,
  buildTasksFromExams,
  buildPracticeTasksFromQuizBank,
  buildVideoTasks,
  sortTasksByPriority,
} from '../services/studyPlanService';
import { listRecentExamResults } from '../services/userActivity';
import { TRACK_COEFFICIENTS } from '../config/trackConfig';

const PLAN_KEY = 'study-plan-active';

/**
 * Primary hook — loads the active plan, provides mutations.
 */
export function useStudyPlan() {
  const queryClient = useQueryClient();
  const { user, track } = useStore();

  const uid = user?.uid;

  // ── Query: active plan ─────────────────────────────────────────────
  const {
    data: plan,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [PLAN_KEY, uid],
    queryFn: () => loadActiveStudyPlan(uid),
    enabled: !!uid,
    staleTime: 5 * 60 * 1000, // 5 min
    retry: 1,
  });

  // ── Derived data ──────────────────────────────────────────────────
  const todayTasks = useMemo(() => getTodayTasks(plan), [plan]);
  const upcomingTasks = useMemo(() => getUpcomingTasks(plan, 7), [plan]);
  const mastery = useMemo(() => computeSubjectMastery(plan), [plan]);

  const totalTasks = plan?.tasks?.length || 0;
  const masteredCount = plan?.tasks?.filter((t) => t.status === 'mastered').length || 0;
  const progressPct = totalTasks > 0 ? Math.round((masteredCount / totalTasks) * 100) : 0;

  // ── Mutations ─────────────────────────────────────────────────────
  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: [PLAN_KEY, uid] }),
    [queryClient, uid],
  );

  const generateMutation = useMutation({
    mutationFn: async ({ exams, coefficients, existingResults, aiPlan, quizBankIndex, courses }) => {
      if (!uid) throw new Error('Not authenticated');

      // Build tasks from exams, seeded with prior results & SRS
      const coeff = coefficients || TRACK_COEFFICIENTS[track] || {};
      let tasks = buildTasksFromExams(exams, coeff, existingResults || {});

      // Build practice tasks from quiz bank (curriculum quizzes)
      const trackSubjects = Object.keys(coeff);
      if (quizBankIndex?.bySubject) {
        const practiceTasks = buildPracticeTasksFromQuizBank(
          quizBankIndex, coeff, trackSubjects, 3,
        );
        tasks = tasks.concat(practiceTasks);
      }

      // Build video-watching tasks from courses
      if (courses?.length) {
        const videoTasks = buildVideoTasks(courses, trackSubjects, 2);
        tasks = tasks.concat(videoTasks);
      }

      // If AI returned a schedule, reorder/annotate tasks to match
      if (aiPlan?.schedule?.length) {
        const scheduleMap = new Map();
        for (const entry of aiPlan.schedule) {
          const key = `${entry.subject}|${entry.examDifficulty || 3}`;
          if (!scheduleMap.has(key)) scheduleMap.set(key, []);
          scheduleMap.get(key).push(entry);
        }

        // Annotate tasks with AI rationale where subjects match
        for (const task of tasks) {
          const key = `${task.subject}|${task.difficulty}`;
          const matches = scheduleMap.get(key);
          if (matches?.length) {
            const entry = matches.shift();
            task.aiRationale = entry.rationale || '';
            task.aiFocusArea = entry.focusArea || '';
            task.scheduledWeek = entry.week;
            task.scheduledDay = entry.day;
          }
        }
      }

      tasks = sortTasksByPriority(tasks);

      const planData = {
        track: track || 'SVT',
        title: aiPlan?.title || `Plan d'étude — ${track || 'SVT'}`,
        description: aiPlan?.description || '',
        tips: aiPlan?.tips || [],
        dailyTargetMinutes: aiPlan?.dailyTargetMinutes || 90,
        weeklyGoals: aiPlan?.weeklyGoals || 8,
        tasks,
        taskCount: tasks.length,
        masteredCount: tasks.filter((t) => t.status === 'mastered').length,
      };

      return createStudyPlan(uid, planData);
    },
    onSuccess: invalidate,
  });

  const recordResultMutation = useMutation({
    mutationFn: async ({ taskId, scorePct }) => {
      if (!uid || !plan?.id) throw new Error('No active plan');
      return recordTaskResult(uid, plan.id, taskId, {
        scorePct,
        answeredAt: Date.now(),
      });
    },
    onSuccess: invalidate,
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      if (!uid || !plan?.id) return;
      return updateStudyPlan(uid, plan.id, { status: 'archived' });
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!uid || !plan?.id) return;
      return deleteStudyPlan(uid, plan.id);
    },
    onSuccess: invalidate,
  });

  return {
    // State
    plan,
    isLoading,
    error,
    hasPlan: !!plan,
    refetch,

    // Derived
    todayTasks,
    upcomingTasks,
    mastery,
    totalTasks,
    masteredCount,
    progressPct,

    // Mutations
    generatePlan: generateMutation.mutateAsync,
    isGenerating: generateMutation.isPending,
    recordResult: recordResultMutation.mutateAsync,
    archivePlan: archiveMutation.mutateAsync,
    deletePlan: deleteMutation.mutateAsync,
  };
}

/**
 * Hook to fetch exam results for plan generation seeding.
 */
export function useExamResultsForPlan() {
  const { user } = useStore();
  const uid = user?.uid;

  return useQuery({
    queryKey: ['exam-results-for-plan', uid],
    queryFn: async () => {
      if (!uid) return {};
      const results = await listRecentExamResults(uid, 200);
      const map = {};
      for (const r of results) {
        // Use the latest result per exam
        if (!map[r.id] || (r.submitted_at_ms || 0) > (map[r.id].answeredAt || 0)) {
          map[r.id] = {
            scorePct: r.percentage ?? r.scorePct ?? 0,
            answeredAt: r.submitted_at_ms || Date.now(),
          };
        }
      }
      return map;
    },
    enabled: !!uid,
    staleTime: 10 * 60 * 1000,
  });
}
