import React from 'react';

/**
 * A drop-in replacement for `React.lazy` that survives stale deployments.
 *
 * Each production build emits content-hashed chunk filenames (e.g.
 * `js/Courses.abc123.js`). When a new version ships, the old hashed files are
 * removed from the server. A browser still running the previous build — or one
 * served a stale app shell by the service worker on a flaky connection — then
 * fails to import the route chunk with a "ChunkLoadError" / "Failed to fetch
 * dynamically imported module". The page appears broken even though the data
 * and the new deploy are fine.
 *
 * This wrapper:
 *   1. retries the import once (handles a transient network blip), then
 *   2. if it still fails, forces a single hard reload so the browser fetches
 *      the current HTML + chunk hashes. A short-lived sessionStorage timestamp
 *      guards against reload loops (at most one reload per 10s).
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  const RELOAD_KEY = 'edlight:chunk-reload-ts';

  return React.lazy(async () => {
    try {
      const mod = await factory();
      // Successful load — clear any prior reload guard.
      try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* noop */ }
      return mod;
    } catch (err) {
      // One quick retry covers a transient fetch failure.
      try {
        return await factory();
      } catch (err2) {
        // Persistent failure → almost certainly a stale build referencing a
        // chunk that no longer exists. Reload once to pull the fresh shell.
        try {
          const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
          if (!last || Date.now() - last > 10_000) {
            sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
            window.location.reload();
            // Keep Suspense waiting while the page reloads.
            return await new Promise<{ default: T }>(() => {});
          }
        } catch { /* sessionStorage unavailable — fall through */ }
        throw err2;
      }
    }
  });
}
