/**
 * Web / PWA side of the offline revision packs: the service worker keeps the
 * pack cache across deploys and never caches /packs/ itself (the three
 * bundle-poisoning guards stay), the hosting config never answers a missing
 * pack with index.html, and the exam loader opens a downloaded pack offline.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { buildExamPacks } from '../../../scripts/offline_packs_core.mjs';

const ROOT = path.resolve(__dirname, '../../..');

// ── A tiny service-worker harness ─────────────────────────────────────────
function loadServiceWorker(existingCaches: string[]) {
  const listeners: Record<string, (e: any) => void> = {};
  const store = new Map<string, Map<string, any>>(existingCaches.map((n) => [n, new Map()]));
  const caches = {
    keys: async () => [...store.keys()],
    delete: async (n: string) => store.delete(n),
    open: async (n: string) => {
      if (!store.has(n)) store.set(n, new Map());
      const m = store.get(n)!;
      return { match: async (k: any) => m.get(String(k.url ?? k)), put: async (k: any, v: any) => { m.set(String(k.url ?? k), v); }, delete: async (k: any) => m.delete(String(k.url ?? k)), add: async () => undefined };
    },
  };
  const self = {
    location: { origin: 'https://academy.edlight.org' },
    addEventListener: (type: string, fn: (e: any) => void) => { listeners[type] = fn; },
    skipWaiting: () => undefined,
    clients: { claim: async () => undefined, matchAll: async () => [] },
    registration: { showNotification: async () => undefined },
  };
  const src = fs.readFileSync(path.join(ROOT, 'pwa/sw.js'), 'utf8');
  vm.runInNewContext(src, { self, caches, fetch: async () => ({ ok: true, headers: { get: () => 'application/json' }, clone() { return this; } }), URL, setTimeout, clearTimeout, Promise, Response: class {} });
  return { listeners, store, src };
}

describe('service worker and offline packs', () => {
  it('activation drops old versioned caches but keeps the student’s packs', async () => {
    const { listeners, store } = loadServiceWorker(['edlight-shell-v1', 'edlight-data-v1', 'edlight-offline-packs-v1', 'edlight-offline-packs-v2']);
    let wait: Promise<unknown> = Promise.resolve();
    listeners.activate({ waitUntil: (p: Promise<unknown>) => { wait = p; } });
    await wait;
    expect([...store.keys()].sort()).toEqual(['edlight-offline-packs-v1', 'edlight-offline-packs-v2']);
  });

  it('/packs/ requests bypass the worker; bundles and exam files are still handled as before', () => {
    const { listeners } = loadServiceWorker([]);
    const fetchEvent = (pathname: string, mode = 'cors') => {
      const respondWith = jest.fn();
      listeners.fetch({ request: { method: 'GET', url: `https://academy.edlight.org${pathname}`, mode }, respondWith, waitUntil: () => undefined });
      return respondWith;
    };
    expect(fetchEvent('/packs/manifest.json')).not.toHaveBeenCalled();
    expect(fetchEvent('/packs/exam-bac-svt-1.0a1b2c3d.json')).not.toHaveBeenCalled();
    expect(fetchEvent('/js/main.abc.js')).toHaveBeenCalled();
    expect(fetchEvent('/exams/ex_1.json')).toHaveBeenCalled();
    expect(fetchEvent('/api/catalog')).not.toHaveBeenCalled();
  });

  it('the three bundle-poisoning guards are still in place', () => {
    const sw = fs.readFileSync(path.join(ROOT, 'pwa/sw.js'), 'utf8');
    // cacheFirst refuses and evicts HTML, then retries past the HTTP cache.
    expect(sw).toMatch(/if \(hit && !isHtml\(hit\)\) return hit;/);
    expect(sw).toMatch(/cache: 'reload'/);
    expect(sw).toMatch(/if \(res && res\.ok && !isHtml\(res\)\) cache\.put/);
    // The per-build tag still drives the versioned caches.
    expect(sw).toMatch(/const CACHE_VERSION = /);
    expect(sw).toMatch(/edlight-assets-\$\{CACHE_VERSION\}/);
    // The pack cache name is NOT tied to the build version.
    expect(sw).toMatch(/const PACK_CACHE_PREFIX = 'edlight-offline-packs';/);
    expect(sw).not.toMatch(/PACK_CACHE_PREFIX = `[^`]*CACHE_VERSION/);
    const prerender = fs.readFileSync(path.join(ROOT, 'scripts/prerender_routes.mjs'), 'utf8');
    expect(prerender).toMatch(/CACHE_VERSION/);
  });

  it('the SPA fallback never answers a missing pack (or bundle) with index.html', () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    const catchAll = vercel.rewrites.find((r: any) => r.destination === '/index.html' && r.source.startsWith('/((?!'));
    expect(catchAll.source).toContain('packs/');
    for (const guard of ['js/', 'css/', 'assets/', 'fonts/']) expect(catchAll.source).toContain(guard);
  });

  it('the page’s pack cache name is the one the worker preserves', async () => {
    const mod = await import('../offlinePacks');
    expect(mod.PACK_CACHE_NAME.startsWith('edlight-offline-packs')).toBe(true);
  });
});

describe('Cache Storage blob store', () => {
  it('stores pack text as JSON responses in its own cache and reads it back', async () => {
    const store = new Map<string, Map<string, any>>();
    (globalThis as any).caches = {
      open: async (n: string) => {
        if (!store.has(n)) store.set(n, new Map());
        const m = store.get(n)!;
        return { match: async (k: string) => m.get(k), put: async (k: string, v: any) => { m.set(k, v); }, delete: async (k: string) => m.delete(k) };
      },
    };
    const RealResponse = (globalThis as any).Response;
    (globalThis as any).Response = class { body: string; headers: any; constructor(b: string, init: any) { this.body = b; this.headers = init.headers; } async text() { return this.body; } };
    try {
      const { cacheStorageBlobStore, PACK_CACHE_NAME } = await import('../offlinePacks');
      const blobs = cacheStorageBlobStore();
      await blobs.write('exam-bac-svt.abcd1234', '{"a":1}');
      expect([...store.keys()]).toEqual([PACK_CACHE_NAME]);
      expect(store.get(PACK_CACHE_NAME)!.get('/__offline-packs/exam-bac-svt.abcd1234.json').headers['Content-Type']).toBe('application/json');
      expect(await blobs.read('exam-bac-svt.abcd1234')).toBe('{"a":1}');
      await blobs.remove('exam-bac-svt.abcd1234');
      expect(await blobs.read('exam-bac-svt.abcd1234')).toBeNull();
    } finally {
      delete (globalThis as any).caches;
      (globalThis as any).Response = RealResponse;
    }
  });
});

describe('offline exam take on the web', () => {
  it('fetchSingleExam opens the paper from a downloaded pack when the network fails', async () => {
    const { packLibrary } = await import('../offlinePacks');
    const { fetchSingleExam } = await import('../../utils/examCatalog');
    const [pack] = buildExamPacks([{
      exam_id: 'ex_offline', level: 'baccalaureat', subject: 'SVT', year: '2024',
      sections: [{ questions: [{ type: 'multiple_choice', question: 'Q', options: ['a', 'b'], correct: 'a' }] }],
    }], { now: 1 });
    await packLibrary.install(pack.entry, pack.text);
    const realFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = jest.fn(async () => { throw new TypeError('Failed to fetch'); });
    try {
      const exam = await fetchSingleExam('ex_offline');
      expect(exam?.exam_id).toBe('ex_offline');
      // Not in any pack: the network error still surfaces (error state + retry).
      await expect(fetchSingleExam('ex_missing')).rejects.toThrow('Failed to fetch');
      // The hosting fallback (HTML, 200) is never parsed as an exam.
      (globalThis as any).fetch = jest.fn(async () => ({ ok: true, headers: { get: () => 'text/html' }, json: async () => { throw new Error('html'); } }));
      expect((await fetchSingleExam('ex_offline'))?.exam_id).toBe('ex_offline');
      expect(await fetchSingleExam('ex_missing')).toBeNull();
    } finally {
      (globalThis as any).fetch = realFetch;
      await packLibrary.removeAll();
    }
  });
});
