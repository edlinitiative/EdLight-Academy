import type { CompiledQuestion, Response } from './schema';

/**
 * Bridge between the IR's per-widget `Response` and the single string an
 * attempt has always been stored as.
 *
 * The engine knows a question is several answers; everything downstream —
 * drafts, autosave, the results screen, the review scheduler, and the grader
 * itself — has only ever seen one string per question. Rewriting that storage
 * would invalidate every exam in progress and every attempt already saved, so
 * the IR renders and validates while the stored shape stays exactly as it is.
 *
 * Two shapes, both of which the existing grader already reads:
 *  - several blanks in one sentence → pipe-joined, "simple|double"
 *  - one answer → the raw string
 *
 * Questions with a step ladder are deliberately not handled here: those go to
 * the scaffold input, which has its own {scaffold:[…]} format.
 */

/** Widget ids that make up a multi-blank answer, in reading order. */
function blankIds(q: CompiledQuestion): string[] {
  return Object.keys(q.widgets)
    .filter((id) => /^blank\d+$/.test(id))
    .sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)));
}

/**
 * True when this question's answers can round-trip through a stored string
 * without losing which answer went where. The caller renders anything else
 * with the input it already used.
 */
export function isSerializable(q: CompiledQuestion): boolean {
  const ids = Object.keys(q.widgets);
  if (ids.length === 0) return false;
  // A choice answer is an index and an ordering is a list; neither is the plain
  // string an attempt is stored as, and each already has an input of its own.
  // Saying so here rather than relying on the caller to check the question type
  // is the whole point of moving that decision into the compiled question.
  if (ids.some((id) => q.widgets[id].kind === 'choice' || q.widgets[id].kind === 'order')) {
    return false;
  }
  // One answer is stored verbatim, so nothing can collide with the separator.
  if (ids.length === 1) return true;
  if (blankIds(q).length !== ids.length) return false;
  // One chemistry answer is "||" — the salt bridge in a cell notation,
  // Zn|Zn²⁺||Cu²⁺|Cu. Pipe-joining it loses which blank it belongs to, so a
  // student typing the right answer would be marked wrong. Rare enough to hand
  // back to the single-field input rather than change how attempts are stored.
  return ids.every((id) => {
    const w = q.widgets[id];
    return !('answer' in w) || !String(w.answer ?? '').includes('|');
  });
}

export function responseToStored(q: CompiledQuestion, response: Response): string {
  const ids = Object.keys(q.widgets);
  const one = (id: string) => String(response[id] ?? '').trim();

  if (ids.length === 1) return one(ids[0]);

  const blanks = blankIds(q);
  const values = blanks.map(one);
  // All blanks empty is NOT an answer. Returning "||" would count the question
  // as answered, inflating the progress strip and the "X unanswered" warning
  // on submit — the student would be told they had finished a question they
  // had not touched.
  return values.some((v) => v !== '') ? values.join('|') : '';
}

export function storedToResponse(q: CompiledQuestion, stored: unknown): Response {
  const ids = Object.keys(q.widgets);
  const raw = typeof stored === 'string' ? stored : Array.isArray(stored) ? stored.join('|') : '';

  if (ids.length === 1) return { [ids[0]]: raw };

  const blanks = blankIds(q);
  const parts = raw.split('|');
  const response: Response = {};
  blanks.forEach((id, i) => { response[id] = parts[i] ?? ''; });
  return response;
}
