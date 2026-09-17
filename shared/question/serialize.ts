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

/** Widget ids that make up a step ladder, in the order they were authored. */
function stepIds(q: CompiledQuestion): string[] {
  return Object.keys(q.widgets)
    .filter((id) => /^step\d+$/.test(id))
    .sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)));
}

/**
 * A ladder is stored as {"scaffold":[…]}, the shape the grader already reads
 * for scaffolded maths, with one entry per authored part in order. Reusing it
 * means these answers are graded per part — with partial credit — by code that
 * already exists, rather than a second format nobody else understands.
 */
const SCAFFOLD_KEY = 'scaffold';

function isLadder(q: CompiledQuestion): boolean {
  const ids = Object.keys(q.widgets);
  return ids.length > 1 && stepIds(q).length === ids.length;
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
  // One answer is stored verbatim, so nothing can collide with the separator,
  // and it is graded against `correct` exactly as it always has been.
  if (ids.length === 1) return true;
  if (isLadder(q)) return true;
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

  if (isLadder(q)) {
    // Positional, NOT dense. A part authored with an empty answer gets no
    // widget, so the ids can read step1, step3 — and the grader matches
    // scaffold[i] to answer_parts[i]. Packing them tightly would mark step3's
    // answer against part 2 and cost the student marks they had earned.
    const values: string[] = [];
    for (const id of stepIds(q)) values[Number(id.slice(4)) - 1] = one(id);
    for (let i = 0; i < values.length; i += 1) if (values[i] == null) values[i] = '';
    return values.some((v) => v !== '')
      ? JSON.stringify({ [SCAFFOLD_KEY]: values })
      : '';
  }

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

  if (isLadder(q)) {
    const steps = stepIds(q);
    let values: unknown[] | null = null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed[SCAFFOLD_KEY])) values = parsed[SCAFFOLD_KEY];
    } catch { /* not a ladder payload */ }

    const response: Response = {};
    if (values) {
      for (const id of steps) response[id] = String(values[Number(id.slice(4)) - 1] ?? '');
      return response;
    }
    // A draft saved before this question had fields per part: one block of
    // text, typed into the single box it used to show. Dropping it would wipe
    // an exam a student is part-way through, so it reappears in the first
    // field for them to split up.
    for (const id of steps) response[id] = '';
    if (raw.trim()) response[steps[0]] = raw;
    return response;
  }

  const blanks = blankIds(q);
  const parts = raw.split('|');
  const response: Response = {};
  blanks.forEach((id, i) => { response[id] = parts[i] ?? ''; });
  return response;
}
