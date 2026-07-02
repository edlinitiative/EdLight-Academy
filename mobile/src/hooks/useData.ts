import { useQuery } from '@tanstack/react-query';
import { loadAppData, loadCoursesData, loadPracticeQuizzes } from '../services/dataService';

export function useAppData() {
  return useQuery({
    queryKey: ['appData'],
    queryFn: loadAppData,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
  });
}

/** Grouped practice quizzes only — much lighter than useAppData. */
export function usePracticeQuizzes() {
  return useQuery({
    queryKey: ['practiceQuizzes'],
    queryFn: loadPracticeQuizzes,
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 2,
  });
}

export function useCourses() {
  return useQuery({
    queryKey: ['coursesData'],
    queryFn: loadCoursesData,
    // loadCoursesData is cache-first (AsyncStorage, 1h TTL); refetching on
    // every mount re-read ~3300 Firestore docs and made screens feel slow.
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 2,
  });
}
