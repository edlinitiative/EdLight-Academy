/**
 * useTriviaProfile — the signed-in learner's trivia profile, read-only.
 *
 * The same query (same key, same loader) useTrivia runs, for components that
 * only read the profile. The service is imported on demand, so a page that
 * needs nothing more (the landing page's school race reads the learner's
 * school) does not wait for the Firebase SDK before it can paint.
 */

import { useQuery } from '@tanstack/react-query';
import useStore from '../contexts/store';

export const triviaKey = (uid) => ['trivia-profile', uid];

export function useTriviaProfile() {
  const uid = useStore((s) => s.user?.uid ?? null);
  const { data } = useQuery({
    queryKey: triviaKey(uid),
    queryFn: () => import('../services/triviaService').then((m) => m.loadTriviaProfile(uid)),
    enabled: !!uid,
    staleTime: 60 * 1000,
  });
  return data ?? null;
}
