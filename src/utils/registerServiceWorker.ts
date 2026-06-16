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

  // Avoid SW caching during local development.
  if (process.env.NODE_ENV !== 'production') {
    navigator.serviceWorker.getRegistrations?.().then((regs) => regs.forEach((r) => r.unregister()));
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // When a new SW is found and finishes installing, activate it promptly
        // so users get fresh code on their next navigation.
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              installing.postMessage?.('SKIP_WAITING');
            }
          });
        });
      })
      .catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
  });
}
