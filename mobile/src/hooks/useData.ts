import { useQuery } from '@tanstack/react-query';
import { loadAppData, loadCoursesData, getCachedCourses } from '../services/dataService';

export function useAppData() {
  return useQuery({
    queryKey: ['appData'],
    queryFn: loadAppData,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
  });
}

export function useCourses() {
  return useQuery({
    queryKey: ['coursesData'],
    queryFn: loadCoursesData,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
    refetchOnMount: 'always',
  });
}
