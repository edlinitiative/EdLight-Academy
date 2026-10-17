/**
 * Lightweight react-query cache persistence (AsyncStorage).
 * ─────────────────────────────────────────────────────────
 * The official @tanstack persisters aren't installed, so this follows the
 * house dataService pattern instead: on app start the query cache is seeded
 * from AsyncStorage (so cold starts render instantly from the last-known
 * data), and successful queries are written back, debounced, whenever the
 * cache changes. react-query's own staleTime then drives background refetch.
 *
 * Only SMALL user-state queries are persisted here. The heavy content
 * queries (courses, practice quizzes, exam catalog) already have their own
 * AsyncStorage cache-first loaders in dataService/examCatalog — duplicating
 * their payloads would waste AsyncStorage quota.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryClient } from '@tanstack/react-query';
import useStore, { waitForStoreHydration } from '../contexts/store';
import { keyBelongsTo } from '../lifecycle/queryKeys';

const CACHE_KEY = 'edlight:queryCache:v1';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // don't resurrect data older than a day
const SAVE_DEBOUNCE_MS = 1000;

/** First query-key segments that are safe & cheap to persist. */
const PERSISTED_KEYS = new Set([
  'global-streak',
  'trivia-profile',
  'leaderboard-weekly',
  'exam-subject-index',
  'exam-results-by-subject',
]);

type PersistedEntry = { key: unknown[]; data: unknown; updatedAt: number };

function currentUid(): string | null {
  return useStore.getState().user?.uid ?? null;
}

/**
 * Whitelisted AND owned by the current student. Student-private keys carry
 * their uid (lifecycle/queryKeys), so an entry for another account — or for
 * nobody, after sign-out — is never written to disk nor read back from it.
 */
export function shouldPersist(queryKey: readonly unknown[], uid: string | null): boolean {
  return PERSISTED_KEYS.has(String(queryKey?.[0])) && keyBelongsTo(queryKey, uid);
}

/**
 * Forget everything on disk. Called on sign-out, account deletion and an
 * account switch (lifecycle/accountIsolation), together with clearing the
 * in-memory QueryClient.
 */
export async function clearPersistedQueryCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEY);
  } catch {
    /* best-effort */
  }
}

/**
 * Seed the query cache from AsyncStorage. Queries hydrated here mount as
 * `success` with their original dataUpdatedAt, so screens render immediately
 * and react-query refetches in the background once the data is stale.
 */
export async function hydrateQueryCache(queryClient: QueryClient): Promise<void> {
  try {
    // Ownership is judged against the persisted store user, so wait for it.
    await waitForStoreHydration();
    const uid = currentUid();
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const entries = JSON.parse(raw) as PersistedEntry[];
    if (!Array.isArray(entries)) return;
    const now = Date.now();
    for (const e of entries) {
      if (!e || !Array.isArray(e.key) || !shouldPersist(e.key, uid)) continue;
      if (now - (e.updatedAt || 0) > MAX_AGE_MS) continue;
      queryClient.setQueryData(e.key, e.data, { updatedAt: e.updatedAt });
    }
  } catch {
    /* corrupt cache — start fresh */
  }
}

/**
 * Persist whitelisted successful queries whenever the cache changes
 * (debounced). Returns the unsubscribe function.
 */
export function persistQueryCacheOnChange(queryClient: QueryClient): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const save = () => {
    const uid = currentUid();
    const entries: PersistedEntry[] = queryClient
      .getQueryCache()
      .getAll()
      .filter((q) => q.state.status === 'success' && shouldPersist(q.queryKey, uid))
      .map((q) => ({
        key: q.queryKey as unknown[],
        data: q.state.data,
        updatedAt: q.state.dataUpdatedAt,
      }));
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(entries)).catch(() => {});
  };

  const unsubscribe = queryClient.getQueryCache().subscribe(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, SAVE_DEBOUNCE_MS);
  });

  return () => {
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}
