/* EdLight Academy — Service Worker
 * ---------------------------------------------------------------------------
 * Goal: make the app usable on slow / intermittent Haitian mobile networks.
 *   • Instant repeat loads (app shell + hashed bundles served from cache)
 *   • Offline access to the SPA shell and any exam/course already opened
 *   • Never caches auth or any cross-origin (Firebase/Google) traffic
 *
 * Hand-written (no build tooling) so it stays simple and reviewable.
 * Bump CACHE_VERSION to force-refresh all caches after a structural change.
 */
const CACHE_VERSION = 'v12';
const SHELL_CACHE = `edlight-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `edlight-assets-${CACHE_VERSION}`;
const DATA_CACHE = `edlight-data-${CACHE_VERSION}`;

// Minimal app shell precached on install so the SPA boots offline.
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/assets/logo.png',
  '/assets/student-hero.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // addAll is atomic; use individual puts so one missing file can't abort install.
      .then((cache) => Promise.all(
        SHELL_ASSETS.map((url) =>
          cache.add(url).catch(() => {/* tolerate a missing optional asset */})
        )
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL_CACHE, ASSET_CACHE, DATA_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Messages from the page:
//   • SKIP_WAITING — activate a freshly-installed worker immediately.
//   • SHOW_NOTIFICATION — display an OS notification on the page's behalf so it
//     shows even when the tab is backgrounded and routes clicks through the SW.
self.addEventListener('message', (event) => {
  const data = event.data;
  if (data === 'SKIP_WAITING' || (data && data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
    return;
  }
  if (data && data.type === 'SHOW_NOTIFICATION' && data.payload) {
    const { title, ...options } = data.payload;
    event.waitUntil(
      self.registration.showNotification(title || 'EdLight Academy', options)
    );
  }
});

// ---------------------------------------------------------------------------
// Push notifications
// ---------------------------------------------------------------------------
// Handles Web Push messages (study reminders, achievements, announcements).
// Today notifications are also raised locally from the page via the message
// handler above; this `push` listener makes the app ready for a server-side
// sender (Web Push / FCM) without any further client changes.
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'EdLight Academy', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'EdLight Academy';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/icon-192.png',
    lang: 'fr',
    tag: payload.tag,
    renotify: !!payload.tag,
    requireInteraction: !!payload.requireInteraction,
    actions: Array.isArray(payload.actions) ? payload.actions : [],
    data: { url: payload.url || '/', ...(payload.data || {}) },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Focus an existing window for the target URL if one is open, otherwise open a
// new one. Keeps a single tab instead of spawning duplicates.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = data.url || '/';
  const targetPath = new URL(targetUrl, self.location.origin).pathname;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (new URL(client.url).pathname === targetPath && 'focus' in client) {
            return client.focus();
          }
        }
        // No exact match — reuse any open window, else open a fresh one.
        const open = clients[0];
        if (open) {
          const focused = open.focus();
          if ('navigate' in open) open.navigate(targetUrl).catch(() => {});
          return focused;
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});

/** Cache-first: serve from cache, fetch+store on miss. For immutable assets. */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && res.ok) cache.put(request, res.clone());
  return res;
}

/** Stale-while-revalidate: serve cache immediately, refresh in background.
 *  The revalidation fetch uses `cache: 'no-cache'` so it ALWAYS validates with
 *  the origin (via ETag/Last-Modified) instead of being satisfied by the
 *  browser's own HTTP cache (exam/data files ship `max-age=86400`). Without
 *  this, a deployed data fix could stay invisible for up to a day because the
 *  background refresh kept re-storing the stale HTTP-cached copy. */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const network = fetch(request, { cache: 'no-cache' })
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return hit || (await network) || fetch(request);
}

/** Network-first for navigations: fresh HTML when online, cached shell offline. */
async function navigationHandler(request) {
  try {
    const res = await fetch(request);
    // Keep the latest shell for offline fallback.
    const cache = await caches.open(SHELL_CACHE);
    cache.put('/index.html', res.clone());
    return res;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    return (
      (await cache.match('/index.html')) ||
      (await cache.match('/')) ||
      (await cache.match('/offline.html')) ||
      Response.error()
    );
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle our own origin, GET only. Everything else (Firebase, Google
  // auth, APIs, POST/PUT) goes straight to the network, uncached.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Never cache API routes.
  if (url.pathname.startsWith('/api/')) return;

  // SPA navigations -> network-first with offline shell fallback.
  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(request));
    return;
  }

  // Content-hashed bundles & static assets -> cache-first (immutable).
  if (
    url.pathname.startsWith('/js/') ||
    url.pathname.startsWith('/css/') ||
    url.pathname.startsWith('/assets/') ||
    /\.(?:png|jpe?g|webp|svg|gif|ico|woff2?)$/.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  // Exam files, catalog index, and CSV data -> stale-while-revalidate so a
  // viewed exam/course works offline while staying fresh when online.
  if (
    url.pathname.startsWith('/exams/') ||
    url.pathname.startsWith('/data/') ||
    url.pathname === '/exam_catalog_index.json' ||
    url.pathname.endsWith('.json')
  ) {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
    return;
  }
});
