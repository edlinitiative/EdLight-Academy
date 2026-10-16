const ROMAN = ['I', 'II', 'III', 'IV'];

/**
 * Course documents are named "Économie NS1"; the catalogue labels the same
 * course "Économie NS I". One name for one course: show the roman form
 * everywhere the student reads it.
 */
export function displayCourseName(name?: string | null): string {
  return String(name || '').replace(/\bNS\s?([1-4])\b/g, (_, d) => `NS ${ROMAN[Number(d) - 1]}`);
}
