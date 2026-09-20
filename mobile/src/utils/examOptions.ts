/**
 * examOptions — the shapes `options` actually ships in, normalised.
 *
 * Lifted out of `ExamTakeScreen` so it can be tested without dragging Firebase
 * into a unit test, which is what happened the first time this needed a
 * regression test. It is a pure mapping and it decides what a student is
 * GRADED on, so it earns its own file.
 */

/**
 * Real exam data ships `options` in several shapes:
 *   - an object keyed by letter: { a: "both", b: "either", … }  (most common)
 *   - an array of strings
 *   - null / missing
 * Normalize everything to [{ key, label, value }] where `value` is what gets
 * stored as the answer (the letter key for object options — matching the
 * grader, which compares against `question.correct` like "c" — and the label
 * text for legacy array options).
 */
export function normalizeOptions(raw: any): { key: string; label: string; value: string }[] {
  const letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  if (Array.isArray(raw)) {
    return raw
      .filter((opt) => opt != null)
      .map((opt, i) => {
        // The label goes to `MathText`, which typesets delimited LaTeX and
        // falls back to `mathToText` for the undelimited kind. Pre-transforming
        // here stripped the delimiters and made the KaTeX path unreachable —
        // the same double transform as the question text above. Grading still
        // uses the raw value, untouched.
        const raw = typeof opt === 'string' ? opt : String(opt?.text ?? opt?.label ?? opt);
        return { key: letters[i] ?? String(i + 1), label: raw, value: raw };
      });
  }
  if (raw && typeof raw === 'object') {
    return Object.entries(raw)
      .filter(([, v]) => v != null)
      .map(([k, v]) => {
        const label = typeof v === 'string' ? v : String(v);
        return { key: String(k), label, value: String(k) };
      });
  }
  return [];
}