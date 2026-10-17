/**
 * Where "Retour au catalogue" goes (PRD LJ-03: returning keeps the filters).
 *
 * The catalogue keeps its filters in the URL (?matiere=&niveau=&mes=&vue=&q=).
 * When the page that opened the course hands that URL over as router state
 * (`navigate(`/courses/${id}`, { state: { from: pathname + search } })`), the
 * way back is exactly that URL. Without it we do not invent filters: the
 * plain catalogue — except for a course that no longer exists, where the
 * student's class (read off the id) is the one useful thing we can keep.
 */
const ROMAN = ['', 'I', 'II', 'III', 'IV'];

/** "math-ns1" → "NSI", the catalogue's `niveau` value; null when unreadable. */
export function levelFromCourseId(courseId: string | null | undefined): string | null {
  const m = String(courseId || '').match(/-ns([1-4])$/i);
  return m ? `NS${ROMAN[Number(m[1])]}` : null;
}

export function catalogFrom(state: unknown): string | null {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === 'string' && /^\/courses(\?|$)/.test(from) ? from : null;
}

export function catalogReturnPath(state: unknown, fallbackLevel?: string | null): string {
  const from = catalogFrom(state);
  if (from) return from;
  return fallbackLevel ? `/courses?niveau=${encodeURIComponent(fallbackLevel)}` : '/courses';
}
