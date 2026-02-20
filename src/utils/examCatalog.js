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
