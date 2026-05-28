import { useQuery } from '@tanstack/react-query';
import { loadAppData } from '../services/dataService';

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

export function useProgress() {
  // Add progress tracking hooks here
}

export function useQuizzes() {
  // Add quiz management hooks here
}