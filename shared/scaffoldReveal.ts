/**
 * Does a question's scaffold text print the answer its blanks ask for?
 *
 * A scaffold is the authored solution with holes ("Figi estil : {{0}}"). In
 * 477 of the 2,063 non-math scaffolds the surrounding text ALSO states the
 * answer ("Figi estil ki itilize nan fraz la se metonimi. Figi estil : {{0}}"),
 * so showing it hands the student the answer. Both apps use this to decide:
 * a scaffold that reveals its answer is not shown; the question keeps its
 * plain input instead.
 *
 * Only answers of 3+ characters count (a "a"/"2" appears everywhere), and the
 * comparison ignores case and accents.
 */
const norm = (s: unknown) => String(s ?? '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

export function scaffoldRevealsAnswer(q: any): boolean {
  const text = typeof q?.scaffold_text === 'string' ? q.scaffold_text : '';
  const blanks = Array.isArray(q?.scaffold_blanks) ? q.scaffold_blanks : [];
  if (!text || !blanks.length) return false;
  const visible = norm(text.replace(/\{\{\d+\}\}/g, ' '));
  for (const b of blanks) {
    if (!b || typeof b !== 'object') continue;
    for (const a of [b.answer, ...(Array.isArray(b.alternatives) ? b.alternatives : [])]) {
      const n = norm(a);
      if (n.length >= 3 && visible.includes(n)) return true;
    }
  }
  return false;
}
