/**
 * Service worker registration.
 *
 * Registered only in production and only after `window.load`, so it never
 * competes with first paint or interferes with the dev server's HMR.
 *
 * The service worker (see /sw.js) provides instant repeat loads and offline
 * access to the app shell + any exam/course already viewed — important for the
 * intermittent mobile connections common to EdLight's Haitian audience.
 */
export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  // Avoid SW caching during local development. If a production service worker
  // was ever registered on this origin (e.g. the Codespace-forwarded port), it
  // can keep serving a stale shell on the dev server too — so actively
  // unregister every worker, drop its caches, and reload once if one had
  // control of this page.
  if (process.env.NODE_ENV !== 'production') {
    navigator.serviceWorker.getRegistrations?.().then(async (regs) => {
      const hadControl = !!navigator.serviceWorker.controller || regs.length > 0;
      await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
      try {
        if (typeof caches !== 'undefined') {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch {
        /* caches API unavailable */
      }
      if (hadControl) {
        try {
          const KEY = 'edlight:dev-sw-clean';
          if (!sessionStorage.getItem(KEY)) {
            sessionStorage.setItem(KEY, '1');
            window.location.reload();
          }
        } catch {
          /* sessionStorage unavailable */
        }
      }
    });
    return;
  }

  // When a new worker takes control (via skipWaiting + clients.claim in sw.js),
  // reload this tab ONCE so it runs the fresh build instead of stale code that
  // may reference chunk hashes the new deploy has already deleted. Without this,
  // an updated worker activates but the open tab keeps running the old bundle —
  // exactly the "pages won't load after a deploy" symptom. A flag plus a short
  // sessionStorage stamp guard against any reload loop.
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    try {
      const KEY = 'edlight:sw-reload-ts';
      const last = Number(sessionStorage.getItem(KEY) || 0);
      if (last && Date.now() - last < 10_000) return;
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
      /* sessionStorage unavailable — rely on the in-memory flag */
    }
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // Proactively check for a newer worker on every load.
        try { registration.update(); } catch { /* ignore */ }

        // Ask a freshly-installed worker to activate immediately so users get
        // new code without having to close every tab first.
        const promote = (worker: ServiceWorker | null) => {
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              worker.postMessage('SKIP_WAITING');
            }
          });
        };

        // A worker may already be waiting from a previous visit — promote it now.
        if (registration.waiting && navigator.serviceWorker.controller) {
          registration.waiting.postMessage('SKIP_WAITING');
        }
        registration.addEventListener('updatefound', () => promote(registration.installing));
      })
      .catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
  });
}
