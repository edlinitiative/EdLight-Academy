/**
 * Exam catalog helpers — mobile version.
 * Exam catalog JSON is fetched from the EdLight web app (same Firebase project).
 */

const BASE_URL = 'https://edlight-academy.web.app';

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

/** Fetch and normalize the exam catalog from the hosted web app. */
export async function fetchFullCatalog(): Promise<any[]> {
  try {
    const res = await fetch(`${BASE_URL}/exam_catalog.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return normalizeExamCatalog(data);
  } catch (err) {
    console.warn('[examCatalog] Could not fetch catalog:', err);
    return [];
  }
}

/** Fetch a single exam by ID. */
export async function fetchSingleExam(examIdParam: string | number): Promise<any | null> {
  const id = String(examIdParam ?? '').trim();
  if (!id) return null;
  try {
    const res = await fetch(`${BASE_URL}/exams/${encodeURIComponent(id)}.json`);
    if (res.ok) return await res.json();
    // Try fetching from catalog index fallback
    const catalog = await fetchFullCatalog();
    return catalog.find((e) => String(e.id) === id || String(e.exam_id) === id) ?? null;
  } catch (err) {
    console.warn('[examCatalog] fetchSingleExam error:', err);
    return null;
  }
}
