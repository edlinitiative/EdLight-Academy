/**
 * offlinePacks (phone) — downloaded exam and practice packs.
 * ─────────────────────────────────────────────────────────────────────────
 * Storage decision (larger product additions item 4, OTA constraint):
 *   • `expo-file-system` is a dependency of `expo` itself in SDK 54
 *     (node_modules/expo/package.json), is listed in mobile/package.json since
 *     the SDK 54 upgrade (June 2026, before every shipped build), and
 *     `expo-modules-autolinking resolve` links its pod/AAR. So the native
 *     module is in the binary, and this adds no native dependency.
 *   • It is still PROBED at runtime, never assumed: the legacy entry point
 *     resolves its native module with `requireOptionalNativeModule`, and a
 *     missing module leaves `documentDirectory` null. Then packs fall back to
 *     chunked AsyncStorage with a much smaller budget (Android keeps all of
 *     AsyncStorage in one SQLite file capped near 6 MB, which the outbox and
 *     caches share; packs must never crowd those out).
 *
 * Packs are public content shared by every account on the phone. Nothing is
 * removed except by the student; a pack that does not fit is refused.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  buildPracticePacks,
  canDownloadNow,
  chunkedPackBlobStore,
  createPackLibrary,
  PackError,
  parsePackManifest,
  type PackBlobStore,
  type PackEntry,
  type PackManifest,
  type StoredPack,
} from '../../../shared/offlinePacks';
import { fetchWithTimeout } from '../../../shared/fetchWithTimeout';
import { trackEvent } from './telemetry';

export const PACKS_BASE_URL = 'https://academy.edlight.org/packs';
/** File system: comfortable for every level of one student, small for a shared phone. */
export const FS_PACK_BUDGET_BYTES = 40 * 1024 * 1024;
/** AsyncStorage fallback: two or three packs at most (see header). */
export const ASYNC_PACK_BUDGET_BYTES = Math.round(2.5 * 1024 * 1024);
/** Leave the phone this much free space after a download. */
const MIN_FREE_DISK_BYTES = 150 * 1024 * 1024;
const MANIFEST_CACHE_KEY = 'edlight:offlinePacks:manifest:v1';
const WIFI_ONLY_KEY = 'edlight:offlinePacks:wifiOnly';
const PACK_DOWNLOAD_TIMEOUT_MS = 90_000;

type LegacyFs = {
  documentDirectory: string | null;
  getInfoAsync(uri: string): Promise<{ exists: boolean }>;
  readAsStringAsync(uri: string): Promise<string>;
  writeAsStringAsync(uri: string, text: string): Promise<void>;
  deleteAsync(uri: string, opts?: { idempotent?: boolean }): Promise<void>;
  makeDirectoryAsync(uri: string, opts?: { intermediates?: boolean }): Promise<void>;
  moveAsync(opts: { from: string; to: string }): Promise<void>;
  getFreeDiskStorageAsync(): Promise<number>;
};

/** The file system, only when its native module is really in this binary. */
export function probeFileSystem(): LegacyFs | null {
  try {
    const fs = require('expo-file-system/legacy') as LegacyFs;
    return fs && typeof fs.documentDirectory === 'string' && fs.documentDirectory.length > 0 ? fs : null;
  } catch {
    return null;
  }
}

export function fileSystemBlobStore(fs: LegacyFs): PackBlobStore {
  const dir = `${fs.documentDirectory}offline-packs/`;
  const uriFor = (id: string) => `${dir}${id.replace(/[^A-Za-z0-9_.-]/g, '_')}.json`;
  let dirReady: Promise<void> | null = null;
  const ensureDir = () => {
    if (!dirReady) {
      dirReady = fs.makeDirectoryAsync(dir, { intermediates: true }).catch(async () => {
        const info = await fs.getInfoAsync(dir);
        if (!info.exists) { dirReady = null; throw new Error('no pack directory'); }
      });
    }
    return dirReady;
  };
  return {
    name: 'fs',
    async read(id) {
      const uri = uriFor(id);
      const info = await fs.getInfoAsync(uri);
      return info.exists ? fs.readAsStringAsync(uri) : null;
    },
    async write(id, text) {
      await ensureDir();
      // Write beside, then move: a kill mid-write leaves a .part file, never a
      // half pack under the real name.
      const tmp = `${uriFor(id)}.part`;
      await fs.writeAsStringAsync(tmp, text);
      await fs.deleteAsync(uriFor(id), { idempotent: true });
      await fs.moveAsync({ from: tmp, to: uriFor(id) });
    },
    async remove(id) {
      await fs.deleteAsync(uriFor(id), { idempotent: true });
    },
  };
}

const fs = probeFileSystem();
export const packStorageKind: 'fs' | 'async-storage' = fs ? 'fs' : 'async-storage';
export const PACK_BUDGET_BYTES = fs ? FS_PACK_BUDGET_BYTES : ASYNC_PACK_BUDGET_BYTES;

export const packLibrary = createPackLibrary({
  blobs: fs ? fileSystemBlobStore(fs) : chunkedPackBlobStore(AsyncStorage as any, { name: 'async-storage', chunkChars: 256 * 1024 }),
  index: AsyncStorage as any,
  budgetBytes: PACK_BUDGET_BYTES,
});

// ── Manifest ───────────────────────────────────────────────────────────────

export async function loadPackManifest(): Promise<{ manifest: PackManifest | null; fromCache: boolean }> {
  try {
    const res = await fetchWithTimeout(`${PACKS_BASE_URL}/manifest.json`);
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.includes('json')) {
      const text = await res.text();
      const manifest = parsePackManifest(text);
      if (manifest) {
        AsyncStorage.setItem(MANIFEST_CACHE_KEY, text).catch(() => {});
        return { manifest, fromCache: false };
      }
    }
  } catch { /* offline */ }
  let cached: string | null = null;
  try { cached = await AsyncStorage.getItem(MANIFEST_CACHE_KEY); } catch { /* ignore */ }
  return { manifest: cached ? parsePackManifest(cached) : null, fromCache: true };
}

// ── Preferences ────────────────────────────────────────────────────────────

export async function getWifiOnly(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(WIFI_ONLY_KEY)) === '1'; } catch { return false; }
}

export async function setWifiOnly(on: boolean): Promise<void> {
  try { await AsyncStorage.setItem(WIFI_ONLY_KEY, on ? '1' : '0'); } catch { /* ignore */ }
}

async function connection() {
  try {
    // Required lazily: the screens that read packs must not need NetInfo to load.
    const NetInfo = require('@react-native-community/netinfo').default;
    const s = await NetInfo.fetch();
    return { isConnected: s.isConnected, isInternetReachable: s.isInternetReachable, type: s.type };
  } catch {
    return { isConnected: null, isInternetReachable: null, type: 'unknown' };
  }
}

// ── Actions ────────────────────────────────────────────────────────────────

async function gate(entry: PackEntry) {
  const allowed = canDownloadNow({ wifiOnly: await getWifiOnly(), connection: await connection() });
  if (allowed !== 'ok') throw new PackError(allowed);
  if (fs) {
    try {
      const free = await fs.getFreeDiskStorageAsync();
      if (Number.isFinite(free) && free > 0 && free - entry.sizeBytes < MIN_FREE_DISK_BYTES) throw new PackError('storage', 'phone full');
    } catch (err) {
      if (err instanceof PackError) throw err;
    }
  }
}

function report(entry: PackEntry, outcome: string, extra: Record<string, unknown> = {}) {
  trackEvent('offline_pack_downloaded', {
    kind: entry.kind, level: entry.level || null, pack: entry.id, sizeKb: Math.round(entry.sizeBytes / 1024),
    outcome, source: packStorageKind, ...extra,
  });
}

/** Download (or update) an exam pack listed in the manifest. */
export async function downloadExamPack(entry: PackEntry): Promise<StoredPack> {
  if (entry.kind !== 'exam' || !entry.file) throw new PackError('invalid');
  const started = Date.now();
  const had = (await packLibrary.list()).some((p) => p.id === entry.id);
  try {
    await gate(entry);
    const stored = await packLibrary.download(entry, async () => {
      const res = await fetchWithTimeout(`${PACKS_BASE_URL}/${entry.file}`, {}, PACK_DOWNLOAD_TIMEOUT_MS);
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || !ct.includes('json')) throw new PackError('network', `HTTP ${res.status}`);
      return res.text();
    });
    report(entry, 'ok', { action: had ? 'update' : 'download', durationMs: Date.now() - started });
    return stored;
  } catch (err) {
    report(entry, err instanceof PackError ? err.code : 'network');
    throw err instanceof PackError ? err : new PackError('network');
  }
}

/**
 * Practice packs, built from the question bank this phone already holds (or
 * fetches once). Their size is exact because the pack text is built here.
 */
export async function listPracticePacks(): Promise<{ entry: PackEntry; text: string }[]> {
  const { loadQuizBankRows, practicePackLabel } = require('./dataService') as typeof import('./dataService');
  const rows = await loadQuizBankRows();
  return buildPracticePacks(rows, practicePackLabel);
}

export async function savePracticePack(pack: { entry: PackEntry; text: string }): Promise<StoredPack> {
  const { entry, text } = pack;
  const had = (await packLibrary.list()).some((p) => p.id === entry.id);
  try {
    // No network needed: the text is already on the phone. Wi-Fi-only does not apply.
    const stored = await packLibrary.install(entry, text);
    report(entry, 'ok', { action: had ? 'update' : 'download' });
    return stored;
  } catch (err) {
    report(entry, err instanceof PackError ? err.code : 'storage');
    throw err instanceof PackError ? err : new PackError('storage');
  }
}

export async function removePack(id: string): Promise<void> {
  const meta = (await packLibrary.list()).find((p) => p.id === id);
  await packLibrary.remove(id);
  trackEvent('offline_pack_removed', { kind: meta?.kind ?? null, pack: id, count: 1 });
}

export async function removeAllPacks(): Promise<number> {
  const n = await packLibrary.removeAll();
  trackEvent('offline_pack_removed', { action: 'all', count: n });
  return n;
}

/** An exam from a downloaded pack, or null (fetchSingleExam reads this first). */
export async function findPackedExam(examId: string): Promise<any | null> {
  try {
    const hit = await packLibrary.findExam(examId);
    if (!hit) return null;
    const net = await connection();
    trackEvent('offline_pack_opened', { kind: 'exam', pack: hit.packId, offline: net.isConnected === false || net.isInternetReachable === false });
    return hit.exam;
  } catch {
    return null;
  }
}

/** Is this exam held in a downloaded pack? (cheap: reads the list only) */
export async function hasPackedExam(examId: string): Promise<boolean> {
  try {
    return (await packLibrary.list()).some((p) => p.kind === 'exam' && !!p.examIds?.includes(String(examId)));
  } catch {
    return false;
  }
}

/** Question rows from downloaded practice packs (practice's offline fallback). */
export async function practiceRowsFromPacks(): Promise<any[]> {
  try {
    const rows = await packLibrary.practiceRows();
    if (rows.length) trackEvent('offline_pack_opened', { kind: 'practice', count: rows.length, offline: true });
    return rows;
  } catch {
    return [];
  }
}
