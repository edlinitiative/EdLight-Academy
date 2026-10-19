/**
 * offlinePacks (web / PWA) — downloaded revision packs in their own cache.
 * ─────────────────────────────────────────────────────────────────────────
 * Storage: Cache Storage under `edlight-offline-packs-v1`, written and read
 * only by the page. The service worker (pwa/sw.js) never touches it: its
 * activate step keeps every `edlight-offline-packs*` cache across deploys, and
 * `/packs/*` requests bypass it entirely. The three bundle-poisoning guards
 * (SPA fallback excludes js/css/assets/fonts, cacheFirst refuses HTML, the
 * per-build tag) are untouched; packs are JSON only, and a pack is accepted
 * only when its exact size and FNV-1a hash match the manifest, so the hosting
 * fallback's index.html can never be stored as a pack.
 *
 * The small list of what is stored lives in localStorage. Nothing is evicted
 * to make room: a pack that does not fit the budget is refused with a message.
 * `navigator.storage.persist()` is requested on the first download so the
 * browser does not clear the packs under storage pressure either.
 */

import {
  canDownloadNow,
  createPackLibrary,
  memoryPackBlobStore,
  PackError,
  parsePackManifest,
  type PackBlobStore,
  type PackEntry,
  type PackIndexStorage,
  type PackManifest,
  type StoredPack,
} from '../../shared/offlinePacks';
import { trackEvent } from '../utils/telemetry';

export const PACK_CACHE_NAME = 'edlight-offline-packs-v1';
/** All packs together; the largest single pack is about 1.2 MB. */
export const WEB_PACK_BUDGET_BYTES = 30 * 1024 * 1024;
const MANIFEST_URL = '/packs/manifest.json';
const MANIFEST_CACHE_KEY = 'edlight-offline-packs-manifest-v1';
const WIFI_ONLY_KEY = 'edlight-offline-packs-wifi-only';

function localStore(): PackIndexStorage {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const ls = window.localStorage;
      return { getItem: (k) => ls.getItem(k), setItem: (k, v) => ls.setItem(k, v), removeItem: (k) => ls.removeItem(k) };
    }
  } catch { /* blocked storage */ }
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } };
}

/** Pack text in Cache Storage, keyed by a synthetic same-origin URL nothing fetches. */
export function cacheStorageBlobStore(cacheName = PACK_CACHE_NAME): PackBlobStore {
  const keyFor = (id: string) => `/__offline-packs/${encodeURIComponent(id)}.json`;
  return {
    name: 'cache-storage',
    async read(id) {
      const cache = await caches.open(cacheName);
      const hit = await cache.match(keyFor(id));
      return hit ? hit.text() : null;
    },
    async write(id, text) {
      const cache = await caches.open(cacheName);
      await cache.put(keyFor(id), new Response(text, { headers: { 'Content-Type': 'application/json' } }));
    },
    async remove(id) {
      const cache = await caches.open(cacheName);
      await cache.delete(keyFor(id));
    },
  };
}

const hasCaches = typeof caches !== 'undefined' && typeof Response !== 'undefined';
export const packsSupported = hasCaches;

export const packLibrary = createPackLibrary({
  blobs: hasCaches ? cacheStorageBlobStore() : memoryPackBlobStore(),
  index: localStore(),
  budgetBytes: WEB_PACK_BUDGET_BYTES,
  indexKey: 'edlight-offline-packs-index-v1',
});

// ── Manifest ───────────────────────────────────────────────────────────────

/** The live manifest, or the last one seen (so the list still renders offline). */
export async function loadPackManifest(): Promise<{ manifest: PackManifest | null; fromCache: boolean }> {
  const store = localStore();
  try {
    const res = await fetch(MANIFEST_URL, { cache: 'no-cache' });
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.includes('json')) {
      const text = await res.text();
      const manifest = parsePackManifest(text);
      if (manifest) {
        try { store.setItem(MANIFEST_CACHE_KEY, text); } catch { /* quota */ }
        return { manifest, fromCache: false };
      }
    }
  } catch { /* offline */ }
  let cached: string | null = null;
  try { cached = await store.getItem(MANIFEST_CACHE_KEY); } catch { /* ignore */ }
  return { manifest: cached ? parsePackManifest(cached) : null, fromCache: true };
}

// ── Preferences and connection ─────────────────────────────────────────────

export function getWifiOnly(): boolean {
  try { return localStorage.getItem(WIFI_ONLY_KEY) === '1'; } catch { return false; }
}

export function setWifiOnly(on: boolean): void {
  try { localStorage.setItem(WIFI_ONLY_KEY, on ? '1' : '0'); } catch { /* ignore */ }
}

/** Browsers expose the link type only sometimes (Chrome on Android); unknown is allowed. */
export function webConnection() {
  const nav: any = typeof navigator !== 'undefined' ? navigator : {};
  const type = nav.connection?.type;
  return {
    isConnected: nav.onLine !== false,
    type: type === 'cellular' ? 'cellular' : type === 'wifi' || type === 'ethernet' ? 'wifi' : 'unknown',
  };
}

// ── Actions ────────────────────────────────────────────────────────────────

let persistAsked = false;

export async function downloadPack(entry: PackEntry): Promise<StoredPack> {
  const gate = canDownloadNow({ wifiOnly: getWifiOnly(), connection: webConnection() });
  if (gate !== 'ok') throw new PackError(gate);
  if (!entry.file) throw new PackError('invalid', 'no file');
  const started = Date.now();
  const previous = (await packLibrary.list()).find((p) => p.id === entry.id);
  try {
    const stored = await packLibrary.download(entry, async () => {
      const res = await fetch(`/packs/${entry.file}`, { cache: 'no-cache' });
      // A missing pack must never be stored as one (the SPA fallback is HTML).
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || !ct.includes('json')) throw new PackError('network', `HTTP ${res.status}`);
      return res.text();
    });
    if (!persistAsked) {
      persistAsked = true;
      try { void (navigator as any).storage?.persist?.(); } catch { /* optional */ }
    }
    trackEvent('offline_pack_downloaded', {
      kind: entry.kind, level: entry.level, action: previous ? 'update' : 'download',
      pack: entry.id, sizeKb: Math.round(entry.sizeBytes / 1024), durationMs: Date.now() - started, outcome: 'ok', surface: 'web',
    });
    return stored;
  } catch (err) {
    const code = err instanceof PackError ? err.code : 'network';
    trackEvent('offline_pack_downloaded', { kind: entry.kind, level: entry.level, pack: entry.id, outcome: code, surface: 'web' });
    throw err instanceof PackError ? err : new PackError('network');
  }
}

export async function removePack(id: string): Promise<void> {
  const meta = (await packLibrary.list()).find((p) => p.id === id);
  await packLibrary.remove(id);
  trackEvent('offline_pack_removed', { kind: meta?.kind ?? 'exam', pack: id, count: 1, surface: 'web' });
}

export async function removeAllPacks(): Promise<void> {
  const n = await packLibrary.removeAll();
  trackEvent('offline_pack_removed', { action: 'all', count: n, surface: 'web' });
}

/** An exam held in a downloaded pack (the exam loader's offline fallback). */
export async function findPackedExam(examId: string): Promise<any | null> {
  try {
    const hit = await packLibrary.findExam(examId);
    if (!hit) return null;
    trackEvent('offline_pack_opened', { kind: 'exam', pack: hit.packId, surface: 'web', offline: typeof navigator !== 'undefined' && navigator.onLine === false });
    return hit.exam;
  } catch {
    return null;
  }
}
