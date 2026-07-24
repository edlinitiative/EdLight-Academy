/**
 * Exam catalog helpers — mobile version.
 * Exam data is fetched from the EdLight web app (same Firebase project).
 *
 * The monolithic exam_catalog.json (29 MB) is NOT deployed anymore. Like the
 * PWA, we use the slim exam_catalog_index.json (~280 KB of metadata) for
 * browse lists, and tiny per-exam files (/exams/<exam_id>.json, a few KB) when
 * actually taking an exam. The index is cached in AsyncStorage so the browser
 * renders instantly on repeat visits.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = 'https://edlight-academy.web.app';
const INDEX_CACHE_KEY = 'edlight:examIndex:v1';
const INDEX_CACHE_TTL = 24 * 60 * 60 * 1000; // 1 day

export function normalizeExamCatalog(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  if (data.exams && Array.isArray(data.exams)) return data.exams;
  const vals = Object.values(data);
  if (vals.length > 0 && Array.isArray(vals[0])) return (vals[0] as any[]);
  return vals.flat() as any[];
}

export function isNumericId(id: any): boolean {
  return /^\d+$/.test(String(id ?? ''));
}

/**
 * Fetch the slim catalog index (metadata for every exam, no questions).
 * This is what browse/list screens should render from.
 */
let inflightIndexRefresh: Promise<any[]> | null = null;

function refreshCatalogIndex(): Promise<any[]> {
  if (!inflightIndexRefresh) {
    inflightIndexRefresh = (async () => {
      const res = await fetch(`${BASE_URL}/exam_catalog_index.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = normalizeExamCatalog(await res.json());
      if (data.length > 0) {
        AsyncStorage.setItem(INDEX_CACHE_KEY, JSON.stringify({ t: Date.now(), data })).catch(() => {});
      }
      return data;
    })().finally(() => { inflightIndexRefresh = null; });
  }
  return inflightIndexRefresh;
}

export async function fetchCatalogIndex(): Promise<any[]> {
  // Serve from cache first (fresh OR stale) so lists render instantly; an
  // expired copy triggers a background refresh for the next read.
  let cached: { t: number; data: any[] } | null = null;
  try {
    const raw = await AsyncStorage.getItem(INDEX_CACHE_KEY);
    if (raw) cached = JSON.parse(raw);
  } catch { /* ignore */ }

  if (cached?.data?.length) {
    if (Date.now() - (cached.t || 0) >= INDEX_CACHE_TTL) refreshCatalogIndex().catch(() => {});
    return cached.data;
  }

  try {
    return await refreshCatalogIndex();
  } catch (err) {
    console.warn('[examCatalog] Could not fetch catalog index:', err);
    return [];
  }
}

/**
 * Back-compat alias: browse screens only need metadata, so the "full catalog"
 * is now the slim index. Questions are loaded per exam via fetchSingleExam.
 */
export async function fetchFullCatalog(): Promise<any[]> {
  return fetchCatalogIndex();
}

// Exam content is static — memoize per session so e.g. the results screen
// doesn't re-download the exam the take screen just fetched.
const examMemo = new Map<string, any>();

/** Fetch a single exam (with questions) by ID. */
export async function fetchSingleExam(examIdParam: string | number): Promise<any | null> {
  let id = String(examIdParam ?? '').trim();
  if (!id) return null;

  // Legacy numeric route → resolve to a stable exam_id via the index.
  // The index has no numeric key, so a number can only map by position; but the
  // raw index order is server-controlled and shifts when exams are added or
  // re-sorted, which silently opened the WRONG exam over time. Sort by the
  // stable exam_id first so a given legacy number always resolves to the same
  // exam, and bounds-check.
  if (isNumericId(id)) {
    const index = await fetchCatalogIndex();
    const n = parseInt(id, 10);
    const sorted = [...index].sort((a, b) =>
      String(a?.exam_id ?? a?.id ?? '').localeCompare(String(b?.exam_id ?? b?.id ?? '')));
    id = (n >= 0 && n < sorted.length ? sorted[n]?.exam_id : '') ?? '';
    if (!id) return null;
  }

  if (examMemo.has(id)) return examMemo.get(id);

  try {
    const res = await fetch(`${BASE_URL}/exams/${encodeURIComponent(id)}.json`);
    if (res.ok) {
      // Firebase Hosting SPA redirect returns HTML with status 200 when the
      // file doesn't exist — check content-type before attempting JSON parse.
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('json')) {
        const exam = await res.json();
        examMemo.set(id, exam);
        return exam;
      }
    }
    // Last resort: the slim index entry (metadata only, no questions).
    const catalog = await fetchCatalogIndex();
    return catalog.find((e) => String(e.exam_id ?? e.id) === id) ?? null;
  } catch (err) {
    console.warn('[examCatalog] fetchSingleExam error:', err);
    return null;
  }
}
