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
export async function fetchCatalogIndex(): Promise<any[]> {
  // Serve from cache first so lists render instantly.
  let cached: { t: number; data: any[] } | null = null;
  try {
    const raw = await AsyncStorage.getItem(INDEX_CACHE_KEY);
    if (raw) cached = JSON.parse(raw);
  } catch { /* ignore */ }

  if (cached?.data?.length && Date.now() - (cached.t || 0) < INDEX_CACHE_TTL) {
    return cached.data;
  }

  try {
    const res = await fetch(`${BASE_URL}/exam_catalog_index.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = normalizeExamCatalog(await res.json());
    if (data.length > 0) {
      AsyncStorage.setItem(INDEX_CACHE_KEY, JSON.stringify({ t: Date.now(), data })).catch(() => {});
    }
    return data;
  } catch (err) {
    console.warn('[examCatalog] Could not fetch catalog index:', err);
    // Stale cache beats an empty screen.
    return cached?.data ?? [];
  }
}

/**
 * Back-compat alias: browse screens only need metadata, so the "full catalog"
 * is now the slim index. Questions are loaded per exam via fetchSingleExam.
 */
export async function fetchFullCatalog(): Promise<any[]> {
  return fetchCatalogIndex();
}

/** Fetch a single exam (with questions) by ID. */
export async function fetchSingleExam(examIdParam: string | number): Promise<any | null> {
  let id = String(examIdParam ?? '').trim();
  if (!id) return null;

  // Legacy numeric route → resolve to a stable exam_id via the index.
  if (isNumericId(id)) {
    const index = await fetchCatalogIndex();
    id = index[parseInt(id, 10)]?.exam_id ?? '';
    if (!id) return null;
  }

  try {
    const res = await fetch(`${BASE_URL}/exams/${encodeURIComponent(id)}.json`);
    if (res.ok) {
      // Firebase Hosting SPA redirect returns HTML with status 200 when the
      // file doesn't exist — check content-type before attempting JSON parse.
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('json')) return await res.json();
    }
    // Last resort: the slim index entry (metadata only, no questions).
    const catalog = await fetchCatalogIndex();
    return catalog.find((e) => String(e.exam_id ?? e.id) === id) ?? null;
  } catch (err) {
    console.warn('[examCatalog] fetchSingleExam error:', err);
    return null;
  }
}
