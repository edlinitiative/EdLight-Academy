/**
 * React Query defaults for the web app (roadmap §4: "no indefinite spinners").
 *
 * With the library default `networkMode: 'online'`, a query started while the
 * browser is offline is PAUSED: it stays `isPending` (skeleton/spinner) until
 * the connection returns, even though Firestore's persistent cache or the
 * service worker could have answered. Exam hub, history, study plan and the
 * streak/leaderboard hooks all gate on `isPending`, so offline they spun with
 * no message.
 *
 * `offlineFirst` runs the query function once regardless; and retrying is
 * pointless (and keeps the query pending) while offline, so the first failure
 * goes straight to the screen's error state, whose offline copy and Réessayer
 * already exist (ErrorState). `refetchOnReconnect` (default true) then
 * refreshes every visible query when the connection comes back.
 */
export const MAX_QUERY_RETRIES = 3;

export function shouldRetryQuery(failureCount: number, _error?: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  return failureCount < MAX_QUERY_RETRIES;
}

export const webQueryDefaults = {
  queries: {
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    networkMode: 'offlineFirst' as const,
    retry: shouldRetryQuery,
    refetchOnReconnect: true,
  },
};
