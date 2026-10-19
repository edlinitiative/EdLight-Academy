/**
 * offlinePacks — downloadable revision packs (exams and practice, no video).
 * ─────────────────────────────────────────────────────────────────────────
 * Larger product additions, item 4. A pack is one level + subject bundle the
 * student chooses to keep on the device so exams and practice open without a
 * connection. This module holds everything both platforms share:
 *
 *   • the wire shapes: the build-time manifest (`/packs/manifest.json`), one
 *     pack body per file, and what a device remembers about a pack it holds;
 *   • integrity: every pack is checked against the manifest's size and FNV-1a
 *     hash before it replaces anything (a truncated download, or the hosting
 *     fallback answering with index.html, is refused);
 *   • storage management: a library over an injected blob store (file system
 *     or AsyncStorage on the phone, Cache Storage on the web) with a hard byte
 *     budget. The budget REFUSES a download that does not fit; nothing is ever
 *     evicted to make room, and nothing is removed without the student asking.
 *
 * Packs hold public content only, so they are shared by every account on the
 * device. Results never live here: an exam taken from a pack is submitted
 * through the per-account outbox (shared/outbox.ts, shared/offlineExamSync.ts).
 */

export type PackKind = 'exam' | 'practice';

/** One downloadable pack, as listed in the manifest (or built on the device for practice). */
export interface PackEntry {
  id: string;
  kind: PackKind;
  level: string;
  subject: string;
  title: string;
  /** 1-based part number when a subject is split to keep each file small. */
  volume?: number;
  volumes?: number;
  /** Oldest and newest exam year in the pack, when known. */
  years?: [number | null, number | null];
  /** Exams (exam pack) or questions (practice pack). */
  items: number;
  questionCount: number;
  /** UTF-8 bytes of the pack file: what it occupies once stored. */
  sizeBytes: number;
  /** Compressed transfer size, when the build measured it. */
  downloadBytes?: number;
  /** FNV-1a (32-bit, 8 hex) of the exact pack file text. Doubles as its version. */
  hash: string;
  /** Path of the pack file relative to the packs base URL (exam packs). */
  file?: string;
  createdAt: number;
}

export interface PackManifest {
  schema: 1;
  createdAt: number;
  packs: PackEntry[];
}

export interface PackBody {
  schema: 1;
  id: string;
  kind: PackKind;
  level: string;
  subject: string;
  exams?: any[];
  questions?: any[];
}

/** What the device remembers about a pack it holds (the storage list). */
export interface StoredPack {
  id: string;
  kind: PackKind;
  level: string;
  subject: string;
  title: string;
  volume?: number;
  volumes?: number;
  years?: [number | null, number | null];
  hash: string;
  sizeBytes: number;
  items: number;
  questionCount: number;
  downloadedAt: number;
  /** Exam ids inside an exam pack, so a lookup never has to read every pack. */
  examIds?: string[];
  /** Subject codes inside a practice pack. */
  subjectCodes?: string[];
}

export interface PackBlobStore {
  /** Short name for diagnostics ("fs", "async-storage", "cache-storage", "memory"). */
  name: string;
  read(id: string): Promise<string | null>;
  write(id: string, text: string): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface PackIndexStorage {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

export type PackErrorCode = 'integrity' | 'budget' | 'too_large' | 'storage' | 'invalid' | 'network' | 'offline' | 'wifi_required';

export class PackError extends Error {
  code: PackErrorCode;
  constructor(code: PackErrorCode, message?: string) {
    super(message || code);
    this.name = 'PackError';
    this.code = code;
  }
}

export const PACK_ID_RE = /^[a-z0-9][a-z0-9_.-]{0,119}$/;
const HASH_RE = /^[0-9a-f]{8}$/;

// ── Integrity ──────────────────────────────────────────────────────────────

/**
 * FNV-1a over UTF-16 code units, 32-bit, as 8 lowercase hex digits. The build
 * script (scripts/offline_packs_core.mjs) implements the same function; a
 * test pins them together.
 */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** UTF-8 byte length without TextEncoder (not guaranteed on every RN engine). */
export function utf8Bytes(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const d = text.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) { n += 4; i += 1; } else n += 3;
    } else n += 3;
  }
  return n;
}

// ── Display ────────────────────────────────────────────────────────────────

/** "≈ 1,2 Mo", "≈ 350 Ko". French decimal comma; the same units read in Kreyòl. */
export function formatPackSize(bytes: number): string {
  const b = Math.max(0, Number(bytes) || 0);
  if (b < 1024 * 1024) {
    const kb = Math.max(1, Math.round(b / 1024));
    return `≈ ${kb} Ko`;
  }
  const mb = b / (1024 * 1024);
  const text = mb >= 10 ? String(Math.round(mb)) : mb.toFixed(1).replace('.', ',');
  return `≈ ${text} Mo`;
}

/** "2019 à 2024" / "2019 rive 2024", or one year, or '' when unknown. */
export function packYearsLabel(years: PackEntry['years'], lang: 'fr' | 'ht'): string {
  if (!years) return '';
  const [a, b] = years;
  if (a && b && a !== b) return lang === 'ht' ? `${a} rive ${b}` : `${a} à ${b}`;
  return a || b ? String(a || b) : '';
}

// ── Manifest ───────────────────────────────────────────────────────────────

function isEntry(e: any): e is PackEntry {
  return !!e && typeof e === 'object'
    && typeof e.id === 'string' && PACK_ID_RE.test(e.id)
    && (e.kind === 'exam' || e.kind === 'practice')
    && typeof e.level === 'string' && typeof e.subject === 'string'
    && typeof e.title === 'string'
    && Number.isFinite(e.sizeBytes) && e.sizeBytes > 0
    && Number.isFinite(e.items) && e.items > 0
    && typeof e.hash === 'string' && HASH_RE.test(e.hash)
    && (e.file === undefined || (typeof e.file === 'string' && /^[a-z0-9][a-z0-9_.-]{0,160}\.json$/.test(e.file)));
}

/** Parse a manifest; drops malformed entries, never throws. */
export function parsePackManifest(raw: unknown): PackManifest | null {
  let data: any = raw;
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw); } catch { return null; }
  }
  if (!data || typeof data !== 'object' || data.schema !== 1 || !Array.isArray(data.packs)) return null;
  const seen = new Set<string>();
  const packs = (data.packs as any[]).filter((e) => {
    if (!isEntry(e) || seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
  return { schema: 1, createdAt: Number(data.createdAt) || 0, packs };
}

/** Entries for one level (exam landing) or all of them. */
export function packsForLevel(manifest: PackManifest | null, level?: string | null): PackEntry[] {
  if (!manifest) return [];
  return manifest.packs.filter((p) => !level || p.level === level);
}

// ── Practice packs (assembled on the device from the question bank) ─────────

function slug(s: string): string {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'x';
}

export function practicePackId(subjectCode: string): string {
  return `practice-${slug(subjectCode)}`;
}

/** Only the fields practice needs, in a stable key order (stable hash). */
function practiceRow(row: any): Record<string, unknown> {
  const keep = ['id', 'question', 'options', 'choices', 'correct_answer', 'good_response', 'answer',
    'hint', 'hint1', 'explanation', 'subject_code', 'unit', 'unit_no', 'Chapter_Number', 'video_title',
    'course_id', 'lesson_id', 'difficulty', 'type'];
  const out: Record<string, unknown> = {};
  for (const k of keep) if (row?.[k] !== undefined && row?.[k] !== null && row?.[k] !== '') out[k] = row[k];
  return out;
}

/**
 * Practice packs for every subject code in the bank: the pack text is built
 * here so its size is exact before the student decides.
 */
export function buildPracticePacks(
  rows: any[],
  labelFor: (subjectCode: string) => { title: string; level: string; subject: string },
  now = Date.now(),
): Array<{ entry: PackEntry; text: string }> {
  const groups = new Map<string, any[]>();
  for (const row of Array.isArray(rows) ? rows : []) {
    const code = String(row?.subject_code ?? '').trim();
    if (!code || !String(row?.question ?? '').trim()) continue;
    const list = groups.get(code) || [];
    list.push(practiceRow(row));
    groups.set(code, list);
  }
  const out: Array<{ entry: PackEntry; text: string }> = [];
  for (const [code, list] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (list.length < 3) continue;
    list.sort((a, b) => String(a.id ?? '').localeCompare(String(b.id ?? '')));
    const { title, level, subject } = labelFor(code);
    const id = practicePackId(code);
    const body: PackBody = { schema: 1, id, kind: 'practice', level, subject, questions: list };
    const text = JSON.stringify(body);
    out.push({
      text,
      entry: {
        id, kind: 'practice', level, subject, title,
        items: list.length, questionCount: list.length,
        sizeBytes: utf8Bytes(text), hash: fnv1a(text), createdAt: now,
      },
    });
  }
  return out;
}

// ── Connection rule ────────────────────────────────────────────────────────

export interface ConnectionInfo {
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
  /** NetInfo type, or the web's effectiveType family ("wifi", "cellular", "unknown"…). */
  type?: string | null;
}

/** May a pack be downloaded right now? Wi-Fi-only blocks cellular, never "unknown" on the web. */
export function canDownloadNow(opts: { wifiOnly: boolean; connection: ConnectionInfo }): 'ok' | 'offline' | 'wifi_required' {
  const c = opts.connection || {};
  if (c.isConnected === false || c.isInternetReachable === false) return 'offline';
  if (opts.wifiOnly && c.type === 'cellular') return 'wifi_required';
  return 'ok';
}

// ── The library ────────────────────────────────────────────────────────────

export interface PackLibraryOptions {
  blobs: PackBlobStore;
  index: PackIndexStorage;
  /** Hard ceiling on the bytes all packs may occupy together. */
  budgetBytes: number;
  indexKey?: string;
  now?: () => number;
  /** Told about every change to the stored list (for screens). */
  onChange?: (packs: StoredPack[]) => void;
}

export type PackStatus = 'absent' | 'current' | 'update' | 'retired';

export interface PackUsage { usedBytes: number; budgetBytes: number; count: number }

function isStored(p: any): p is StoredPack {
  return !!p && typeof p === 'object' && typeof p.id === 'string' && PACK_ID_RE.test(p.id)
    && (p.kind === 'exam' || p.kind === 'practice') && typeof p.hash === 'string'
    && Number.isFinite(p.sizeBytes) && p.sizeBytes >= 0;
}

export function createPackLibrary(opts: PackLibraryOptions) {
  const indexKey = opts.indexKey || 'edlight:offlinePacks:index:v1';
  const now = opts.now || (() => Date.now());
  const listeners = new Set<(packs: StoredPack[]) => void>();
  if (opts.onChange) listeners.add(opts.onChange);
  const bodyMemo = new Map<string, { hash: string; body: PackBody }>();
  const blobKey = (p: { id: string; hash: string }) => `${p.id}.${p.hash}`;
  let chain: Promise<unknown> = Promise.resolve();

  function locked<T>(fn: () => Promise<T>): Promise<T> {
    const next = chain.then(fn, fn);
    chain = next.catch(() => undefined);
    return next;
  }

  async function readIndex(): Promise<StoredPack[]> {
    let raw: string | null = null;
    try { raw = await opts.index.getItem(indexKey); } catch { return []; }
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isStored) : [];
    } catch {
      return [];
    }
  }

  async function writeIndex(packs: StoredPack[]): Promise<void> {
    try {
      if (packs.length) await opts.index.setItem(indexKey, JSON.stringify(packs));
      else await opts.index.removeItem(indexKey);
    } catch {
      throw new PackError('storage', 'index write failed');
    }
    listeners.forEach((fn) => { try { fn(packs); } catch { /* a screen's problem */ } });
  }

  async function list(): Promise<StoredPack[]> {
    return readIndex();
  }

  async function usage(): Promise<PackUsage> {
    const packs = await readIndex();
    return { usedBytes: packs.reduce((s, p) => s + p.sizeBytes, 0), budgetBytes: opts.budgetBytes, count: packs.length };
  }

  /** Would this pack fit? A pack being replaced frees its own bytes first. */
  async function fits(entry: Pick<PackEntry, 'id' | 'sizeBytes'>): Promise<{ ok: true } | { ok: false; reason: 'budget' | 'too_large'; freeBytes: number }> {
    const packs = await readIndex();
    const others = packs.filter((p) => p.id !== entry.id).reduce((s, p) => s + p.sizeBytes, 0);
    const free = Math.max(0, opts.budgetBytes - others);
    if (entry.sizeBytes > opts.budgetBytes) return { ok: false, reason: 'too_large', freeBytes: free };
    if (entry.sizeBytes > free) return { ok: false, reason: 'budget', freeBytes: free };
    return { ok: true };
  }

  function statusOf(entry: PackEntry, stored: StoredPack[]): PackStatus {
    const have = stored.find((p) => p.id === entry.id);
    if (!have) return 'absent';
    return have.hash === entry.hash ? 'current' : 'update';
  }

  /** Stored packs the manifest no longer lists: kept until the student removes them. */
  function retired(manifest: PackManifest | null, stored: StoredPack[], kind: PackKind = 'exam'): StoredPack[] {
    if (!manifest) return [];
    const ids = new Set(manifest.packs.map((p) => p.id));
    return stored.filter((p) => p.kind === kind && !ids.has(p.id));
  }

  /**
   * Verify and store a pack's text. The old copy (an update) is replaced only
   * after the new one is written; a failure leaves the previous copy intact.
   */
  async function install(entry: PackEntry, text: string): Promise<StoredPack> {
    if (!isEntry(entry)) throw new PackError('invalid', 'bad entry');
    if (typeof text !== 'string' || utf8Bytes(text) !== entry.sizeBytes || fnv1a(text) !== entry.hash) {
      throw new PackError('integrity', 'size or hash mismatch');
    }
    let body: PackBody;
    try { body = JSON.parse(text); } catch { throw new PackError('integrity', 'not json'); }
    if (!body || body.schema !== 1 || body.id !== entry.id || body.kind !== entry.kind) {
      throw new PackError('invalid', 'body does not match entry');
    }
    const examIds = entry.kind === 'exam'
      ? (Array.isArray(body.exams) ? body.exams : []).map((e) => String(e?.exam_id ?? '')).filter(Boolean)
      : undefined;
    if (entry.kind === 'exam' && !examIds?.length) throw new PackError('invalid', 'no exams');
    const subjectCodes = entry.kind === 'practice'
      ? [...new Set((Array.isArray(body.questions) ? body.questions : []).map((q) => String(q?.subject_code ?? '')).filter(Boolean))]
      : undefined;

    return locked(async () => {
      const room = await fits(entry);
      if ('reason' in room) throw new PackError(room.reason, 'over budget');
      const previous = (await readIndex()).find((p) => p.id === entry.id);
      // A new version is written under its own key, so the copy it replaces
      // stays readable until the list points at the new one.
      try {
        await opts.blobs.write(blobKey(entry), text);
      } catch {
        try { await opts.blobs.remove(blobKey(entry)); } catch { /* ignore */ }
        throw new PackError('storage', 'blob write failed');
      }
      const stored: StoredPack = {
        id: entry.id, kind: entry.kind, level: entry.level, subject: entry.subject, title: entry.title,
        volume: entry.volume, volumes: entry.volumes, years: entry.years,
        hash: entry.hash, sizeBytes: entry.sizeBytes, items: entry.items, questionCount: entry.questionCount,
        downloadedAt: now(), examIds, subjectCodes,
      };
      const packs = (await readIndex()).filter((p) => p.id !== entry.id);
      try {
        await writeIndex([...packs, stored]);
      } catch (err) {
        if (!previous || previous.hash !== entry.hash) {
          try { await opts.blobs.remove(blobKey(entry)); } catch { /* ignore */ }
        }
        throw err;
      }
      if (previous && previous.hash !== entry.hash) {
        try { await opts.blobs.remove(blobKey(previous)); } catch { /* orphan, harmless */ }
      }
      bodyMemo.set(entry.id, { hash: entry.hash, body });
      return stored;
    });
  }

  /**
   * The whole download: budget first (no data spent on a pack that cannot be
   * kept), then fetch, then verify and store.
   */
  async function download(entry: PackEntry, fetchText: () => Promise<string>): Promise<StoredPack> {
    const room = await fits(entry);
    if ('reason' in room) throw new PackError(room.reason, 'over budget');
    let text: string;
    try {
      text = await fetchText();
    } catch (err) {
      if (err instanceof PackError) throw err;
      throw new PackError('network', 'download failed');
    }
    return install(entry, text);
  }

  async function remove(id: string): Promise<void> {
    await locked(async () => {
      const packs = await readIndex();
      const meta = packs.find((p) => p.id === id);
      // Index first: a pack is "gone" for the app the moment the list says so,
      // even if deleting the blob then fails (it is retried on the next remove).
      if (packs.some((p) => p.id === id)) await writeIndex(packs.filter((p) => p.id !== id));
      bodyMemo.delete(id);
      if (meta) {
        try { await opts.blobs.remove(blobKey(meta)); } catch { /* orphan blob, harmless */ }
      }
    });
  }

  async function removeAll(): Promise<number> {
    return locked(async () => {
      const packs = await readIndex();
      await writeIndex([]);
      bodyMemo.clear();
      for (const p of packs) {
        try { await opts.blobs.remove(blobKey(p)); } catch { /* ignore */ }
      }
      return packs.length;
    });
  }

  async function readBody(id: string): Promise<PackBody | null> {
    const packs = await readIndex();
    const meta = packs.find((p) => p.id === id);
    if (!meta) return null;
    const memo = bodyMemo.get(id);
    if (memo && memo.hash === meta.hash) return memo.body;
    let text: string | null = null;
    try { text = await opts.blobs.read(blobKey(meta)); } catch { return null; }
    // A blob that does not match its record is not trusted (partial write).
    if (!text || fnv1a(text) !== meta.hash) return null;
    try {
      const body = JSON.parse(text) as PackBody;
      bodyMemo.set(id, { hash: meta.hash, body });
      return body;
    } catch {
      return null;
    }
  }

  /** An exam held in any downloaded pack, or null. */
  async function findExam(examId: string): Promise<{ exam: any; packId: string } | null> {
    const id = String(examId || '');
    if (!id) return null;
    const packs = await readIndex();
    for (const p of packs) {
      if (p.kind !== 'exam' || !p.examIds?.includes(id)) continue;
      const body = await readBody(p.id);
      const exam = body?.exams?.find((e) => String(e?.exam_id ?? '') === id);
      if (exam) return { exam, packId: p.id };
    }
    return null;
  }

  /** Every question row held in downloaded practice packs. */
  async function practiceRows(): Promise<any[]> {
    const packs = (await readIndex()).filter((p) => p.kind === 'practice');
    const rows: any[] = [];
    for (const p of packs) {
      const body = await readBody(p.id);
      if (Array.isArray(body?.questions)) rows.push(...body!.questions);
    }
    return rows;
  }

  function subscribe(fn: (packs: StoredPack[]) => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }

  return { list, usage, fits, statusOf, retired, install, download, remove, removeAll, readBody, findExam, practiceRows, subscribe };
}

export type PackLibrary = ReturnType<typeof createPackLibrary>;

/** In-memory blob store, for tests and as a last-resort fallback. */
export function memoryPackBlobStore(): PackBlobStore & { size(): number } {
  const m = new Map<string, string>();
  return {
    name: 'memory',
    read: async (id) => (m.has(id) ? (m.get(id) as string) : null),
    write: async (id, text) => { m.set(id, text); },
    remove: async (id) => { m.delete(id); },
    size: () => m.size,
  };
}

/**
 * Blob store over a key/value storage with a per-value ceiling (AsyncStorage:
 * Android's CursorWindow reads fail on rows near 2 MB). Text is split into
 * chunks; the chunk count is written last, so a half-written pack reads as
 * absent and the record's hash check rejects anything inconsistent.
 */
export function chunkedPackBlobStore(storage: PackIndexStorage, opts: { prefix?: string; chunkChars?: number; name?: string } = {}): PackBlobStore {
  const prefix = opts.prefix || 'edlight:offlinePack';
  const chunk = Math.max(1024, opts.chunkChars || 256 * 1024);
  const countKey = (id: string) => `${prefix}:${id}:n`;
  const partKey = (id: string, i: number) => `${prefix}:${id}:${i}`;
  async function removeParts(id: string, from: number, to: number) {
    for (let i = from; i < to; i += 1) {
      try { await storage.removeItem(partKey(id, i)); } catch { /* ignore */ }
    }
  }
  return {
    name: opts.name || 'chunked',
    async read(id) {
      const n = Number(await storage.getItem(countKey(id)));
      if (!Number.isInteger(n) || n <= 0) return null;
      const parts: string[] = [];
      for (let i = 0; i < n; i += 1) {
        const part = await storage.getItem(partKey(id, i));
        if (part == null) return null;
        parts.push(part);
      }
      return parts.join('');
    },
    async write(id, text) {
      const old = Number(await storage.getItem(countKey(id))) || 0;
      const n = Math.max(1, Math.ceil(text.length / chunk));
      try {
        await storage.removeItem(countKey(id));
        for (let i = 0; i < n; i += 1) await storage.setItem(partKey(id, i), text.slice(i * chunk, (i + 1) * chunk));
        await storage.setItem(countKey(id), String(n));
      } catch (err) {
        await removeParts(id, 0, Math.max(n, old));
        throw err;
      }
      if (old > n) await removeParts(id, n, old);
    },
    async remove(id) {
      const n = Number(await storage.getItem(countKey(id))) || 0;
      try { await storage.removeItem(countKey(id)); } catch { /* ignore */ }
      await removeParts(id, 0, n);
    },
  };
}
