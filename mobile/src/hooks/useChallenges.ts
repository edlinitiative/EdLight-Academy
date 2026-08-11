import { useQuery } from '@tanstack/react-query';
import { getChallenge } from '../services/challengeService';

/**
 * useChallenge — fetch a duel by its share code (challenges/{code}).
 *
 * Scope note: there is deliberately no useIncomingChallenges. Duels are
 * link-addressed (whoever opens the link is the opponent), so the data model
 * has no addressee field to query on — an "inbox" would require a recipient
 * index written at share time, which doesn't exist yet.
 */
export function useChallenge(code: string | null | undefined) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['challenge', code?.toUpperCase() ?? ''],
    queryFn: () => getChallenge(code as string),
    enabled: !!code,
    staleTime: 60 * 1000,
  });

  return {
    challenge: data ?? null,
    isLoading: !!code && isPending,
    isError,
    refetch,
  };
}
