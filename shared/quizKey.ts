/**
 * Quiz-bank answer keys — ONE resolver for web and mobile.
 *
 * Live quiz docs store `options` as a JSON string (sometimes a real array)
 * and the key as the option TEXT, a letter, or a 1-based number. The mobile
 * app resolved it text-first with a bounds check; the web checked letter and
 * number FIRST, so a text key "1" among ["0","1","2","3"] graded "0" as
 * correct, the d-orbital key "d" became option D, and an out-of-range "5"
 * produced an MCQ nobody could get right (P0 validation, 2026-10-19).
 */

/** Case/whitespace/edge-punctuation-insensitive; accents stay significant (FR). */
export function normKey(s: unknown): string {
  return String(s ?? '')
    .toLowerCase().replace(/\s+/g, ' ').trim()
    .replace(/^[\s.,;:!?'"()[\]]+|[\s.,;:!?'"()[\]]+$/g, '');
}

/**
 * Resolve the correct option, or -1 when the key matches nothing.
 *
 * Order matters: the answer TEXT wins first, because live keys are mostly the
 * option text, and a one-character text answer ("d" for the d orbital) would
 * otherwise be misread as the letter D. Then a letter, then a 1-based number.
 * There is no "first option" fallback: an unresolvable key means the question
 * cannot be auto-graded, which is said as such rather than guessed.
 */
export function resolveCorrectIndex(raw: unknown, options: string[]): number {
  const val = String(raw ?? '').trim();
  if (!val || !Array.isArray(options) || options.length === 0) return -1;
  const target = normKey(val);
  const byText = options.findIndex((o) => normKey(o) === target);
  if (byText >= 0) return byText;
  if (/^[A-Za-z]$/.test(val)) {
    const i = val.toUpperCase().charCodeAt(0) - 65;
    if (i >= 0 && i < options.length) return i;
  }
  if (/^\d+$/.test(val)) {
    const i = parseInt(val, 10) - 1;
    if (i >= 0 && i < options.length) return i;
  }
  return -1;
}
