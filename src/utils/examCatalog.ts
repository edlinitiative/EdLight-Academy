/**
 * Exam catalog helpers.
 * The exam catalog is shipped as a static asset (public/exam_catalog.json).
 * In practice it is expected to be a flat array, but we keep this normalizer
 * to be resilient to legacy/object-shaped catalogs.
 */

export function normalizeExamCatalog(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  return Object.values(data).flat();
}

export function isNumericId(value) {
  return typeof value === 'string' && /^\d+$/.test(value);
}

/**
 * Resolve a route param (either legacy numeric index or exam_id) into
 * { exam, idx, examId }.
 */
export function resolveExamFromCatalog(catalogArray, examIdParam) {
  const exams = Array.isArray(catalogArray) ? catalogArray : [];

  if (isNumericId(examIdParam)) {
    const idx = parseInt(examIdParam, 10);
    const exam = Number.isFinite(idx) ? exams[idx] : undefined;
    const examId = exam?.exam_id || null;
    return { exam, idx: Number.isFinite(idx) ? idx : null, examId };
  }

  const exam = exams.find((e) => e?.exam_id === examIdParam);
  const idx = exam ? exams.indexOf(exam) : null;
  return { exam, idx, examId: exam?.exam_id || null };
}

/**
 * Fetch a SINGLE exam by its route param without downloading the full catalog.
 *
 * Strategy (fast path first):
 *   1. Resolve a stable `exam_id` — for legacy numeric routes, map the index to
 *      an `exam_id` using the slim 277 KB browse index.
 *   2. Fetch the tiny per-exam file `public/exams/<exam_id>.json` (a few KB).
 *
 * The full 27 MB `exam_catalog.json` is no longer shipped to users, so this
 * never falls back to it.
 */
export async function fetchSingleExam(examIdParam) {
  let id = examIdParam;

  // Legacy numeric route -> resolve to a stable exam_id via the slim index.
  if (isNumericId(examIdParam)) {
    id = null;
    try {
      const res = await fetch('/exam_catalog_index.json');
      if (res.ok) {
        const index = normalizeExamCatalog(await res.json());
        id = index[parseInt(examIdParam, 10)]?.exam_id || null;
      }
    } catch {
      /* ignore — handled below */
    }
  }

  if (!id) return null;

  const res = await fetch(`/exams/${encodeURIComponent(id)}.json`);
  if (!res.ok) return null;
  return res.json();
}

/** Run an array of async tasks with a bounded concurrency limit. */
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Reconstruct the FULL catalog (all exams incl. `sections`) on demand.
 *
 * Used only by admin tooling (AnswerVerification). Regular users never call
 * this. We rebuild from the slim index + per-exam files so the 27 MB
 * `exam_catalog.json` no longer has to be deployed. A fast path tries the
 * static file first (handy in local dev where it is still served).
 *
 * @param onProgress optional (loaded, total) callback for a progress UI.
 */
export async function fetchFullCatalog(onProgress?: (loaded: number, total: number) => void) {
  // Fast path: the monolithic file if it happens to be served (dev).
  try {
    const direct = await fetch('/exam_catalog.json');
    if (direct.ok) return normalizeExamCatalog(await direct.json());
  } catch {
    /* not served in production — reconstruct below */
  }

  // Reconstruct from the index + per-exam files.
  const idxRes = await fetch('/exam_catalog_index.json');
  if (!idxRes.ok) throw new Error('Failed to load exam catalog index');
  const index = normalizeExamCatalog(await idxRes.json());

  let loaded = 0;
  const exams = await mapWithConcurrency(index, 24, async (entry) => {
    const id = entry?.exam_id;
    let full = null;
    if (id) {
      try {
        const r = await fetch(`/exams/${encodeURIComponent(id)}.json`);
        if (r.ok) full = await r.json();
      } catch {
        /* keep slim entry as fallback */
      }
    }
    loaded += 1;
    if (onProgress) onProgress(loaded, index.length);
    // Fall back to the slim index entry if a per-exam file is missing.
    return full || entry;
  });

  return exams;
}
