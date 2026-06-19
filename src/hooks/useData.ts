import { useQuery } from '@tanstack/react-query';
import { loadAppData, loadCoursesData, getCachedCourses } from '../services/dataService';

export function useAppData() {
  return useQuery({
    queryKey: ['appData'],
    queryFn: loadAppData,
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    cacheTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
    retry: 2,
    onError: (error) => {
      console.error('Failed to load application data:', error);
    },
  });
}

/**
 * Lightweight course-catalog query.
 *
 * Used by the /courses listing and the dashboard, which only need the course
 * catalog — not the full videos/quizzes collections or the quiz-bank index
 * that `useAppData()` loads. It fetches a single small Firestore collection
 * and hydrates instantly from a localStorage cache (revalidating in the
 * background), so returning visitors see the catalog with no spinner.
 */
export function useCourses() {
  const cached = getCachedCourses();
  return useQuery({
    queryKey: ['coursesData'],
    queryFn: loadCoursesData,
    staleTime: 5 * 60 * 1000,
    cacheTime: 30 * 60 * 1000,
    retry: 2,
    // Paint instantly from the last-known catalog, then ALWAYS revalidate in
    // the background so a stale or partial cache self-heals on the next visit.
    initialData: cached ? cached.data : undefined,
    initialDataUpdatedAt: cached ? cached.updatedAt : undefined,
    refetchOnMount: 'always',
    onError: (error) => {
      console.error('Failed to load course catalog:', error);
    },
  });
}

export function useProgress() {
  // Add progress tracking hooks here
}

export function useQuizzes() {
  // Add quiz management hooks here
}