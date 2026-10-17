import { QueryClient } from '@tanstack/react-query';

/**
 * The app's single QueryClient. Lives in its own module (not App.tsx) so the
 * account-isolation and lifecycle code can clear or drive it without a
 * circular import through the root component.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
    },
  },
});
