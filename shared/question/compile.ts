import type { Block, CompiledQuestion, Widget } from './schema';

/**
 * Compile a raw catalog question into the IR.
 *
 * This is the whole reason we are building our own rather than adopting
 * Perseus: our 9,426 questions are already authored, in eight loosely-typed
 * fields, and they must land in the new model WITHOUT anyone re-writing them.
 * Everything here is derived from measurements of the real corpus — see
 * docs/design/exam-question-design.md.
 *
 * Facts this encodes:
 *  - 82.8% of questions keep their grading key in `answer_parts`, not `correct`,
 *    so the ladder is the primary source of widgets.
 *  - 61% of typed answers are ≤24 chars: fields, not textareas.
 *  - 1,796 questions carry blanks; 619 sit mid-sentence, so the prompt has to
 *    be a document with holes rather than text plus inputs.
 *  - Only 15.4% carry alternatives, so fuzzy matching is gated by subject: on
 *    for languages and humanities, off for maths where one character matters.
 */

/** Authored blanks: runs of 4+ underscores or dots. Matches the PWA. */
const BLANK_RE = /_{4,}|\.{4,}/g;

/**
 * Keys that are not answers: a note to a human that the source paper was
 * incomplete, or a pointer to where the answer really lives.
 *
 * Matched exactly, never by pattern. "Dominance incomplète/codominance" and
 * "Voir ne suffit pas pour savoir" are real authored answers, and a regex for
 * "incomplète" or "voir" marks them unanswerable. Exactness is the safeguard.
 *
 * These are almost always harmless — the question also carries answer_parts,
 * which we prefer. They only matter when the placeholder is the ONLY key, and
 * then the honest outcome is review, not marking the student wrong.
 */
const PLACEHOLDER_KEYS = new Set([
  'no text provided', 'texte manquant', 'texte 1 manquant', 'texte 2 manquant',
  'texte incomplet', 'tableau incomplet', 'question manquante', 'question incomplète',
  'information manquante', 'information non fournie', 'incomplete information',
  'incomplete question', 'pregunta incompleta', 'mots manquants',
  'démonstration incomplète', 'n/a',
  'voir les answer_parts', 'voir tableau ci-dessus', 'voir réponse détaillée',
  'voir les réponses a, b, c', 'voir la liste des nationalités',
  'voir définitions ci-dessus',
]);

export function isPlaceholderKey(raw: unknown): boolean {
  const t = String(raw ?? '').trim().toLowerCase().replace(/\.$/, '');
  return t === '' || PLACEHOLDER_KEYS.has(t);
}

const MATH_SUBJECTS = new Set(['Mathématiques', 'Physique', 'Chimie', 'SVT', 'Informatique']);

const str = (v: unknown) => String(v ?? '').trim();

/** Accent- and case-insensitive form, for comparing two authored answers. */
const fold = (v: unknown) =>
  String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Numbers hide in `correct` as "12", "3,14 cm". Null when it is not one. */
function asNumber(raw: string): number | null {
  const t = raw.replace(',', '.');
  const m = /^(-?\d+(?:\.\d+)?)\s*[a-zA-Zµ°%/²³·]*$/.exec(t);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function unitOf(raw: string): string | undefined {
  const m = /^-?\d+(?:[.,]\d+)?\s*([a-zA-Zµ°%/²³·]+)$/.exec(raw.trim());
  return m?.[1];
}

/** Options arrive as an array OR an object keyed by letter. */
function optionList(raw: unknown): string[] | null {
  if (Array.isArray(raw)) return raw.map(str).filter(Boolean);
  if (raw && typeof raw === 'object') {
    const vals = Object.values(raw as Record<string, unknown>).map(str).filter(Boolean);
    return vals.length ? vals : null;
  }
  return null;
}

/**
 * One authored answer → the tightest widget that can grade it.
 * A number becomes numeric (tolerance + units); everything else is text.
 */
function widgetForAnswer(
  id: string,
  answer: string,
  opts: { alternatives?: string[]; label?: string; fuzzy: boolean },
): Widget {
  const n = asNumber(answer);
  if (n !== null) {
    return { kind: 'numeric', id, answer: n, unit: unitOf(answer), label: opts.label };
  }
  return {
    kind: 'text',
    id,
    answer,
    alternatives: opts.alternatives?.length ? opts.alternatives : undefined,
    fuzzy: opts.fuzzy,
    label: opts.label,
  };
}

export function compileQuestion(raw: any, ctx: { subject?: string; id?: string } = {}): CompiledQuestion {
  const type = String(raw?.type ?? '').toLowerCase();
  const subject = ctx.subject ?? str(raw?.subject);
  // One character decides a maths answer; a language answer has synonyms.
  const fuzzy = !MATH_SUBJECTS.has(subject);
  const widgets: Record<string, Widget> = {};
  const steps: string[] = [];

  const text = str(raw?.question) || str(raw?.text);
  const prompt: Block[] = [];

  // ── The prompt, as a document with holes ────────────────────────────────
  const parts = text.split(BLANK_RE);
  const blankCount = parts.length - 1;
  const partAnswers: string[] = (raw?.answer_parts ?? [])
    .map((p: any) => str(p?.answer))
    .filter(Boolean);

  // Split the authored key across the blanks. The key may not divide: 49
  // questions write ONE answer for a sentence with two blanks ("le méthane
  // ($CH_4$)"), and answer_parts may not line up either.
  const blankKeys = blankCount > 0
    ? (splitKey(str(raw?.correct), blankCount)
        ?? (partAnswers.length === blankCount ? partAnswers : null))
    : null;

  /**
   * When a blanked sentence also carries answer_parts, one per blank, they are
   * the SAME answers — 695 questions do this, and in 636 of them the two are
   * character-identical. The rest write the part longer: "homeless" in the key,
   * "They are homeless" in the part.
   *
   * Compiling both sets made every one of those questions two answers too many.
   * Marks divide across widgets, so a student who filled both blanks correctly
   * scored 50% against two step widgets they were never shown. The longer form
   * is an accepted alternative, not another question.
   */
  const partsAreTheBlanks = blankCount > 0 && blankKeys !== null
    && partAnswers.length === blankCount;

  /**
   * The same duplication, one shape along: MORE parts than blanks, where the
   * leading parts are the blanks' own answers.
   *
   *   "Charles forgets to dot his i's ........ he writes fast."
   *   correct: "because"
   *   parts:   [Conjonction correcte: "because", Raison: "he writes fast"]
   *
   * Compiling both gave the student the blank in the sentence AND a field
   * below asking the same thing again, with the marks divided three ways for
   * two real answers. 167 questions are shaped like this — including the ones
   * that key the blank by letter ("c") against a part that spells it out
   * ("c) flew"), which is why a leading match counts, not just an exact one.
   *
   * The ladder is the fuller set, so it wins and the blanks are not compiled.
   * The sentence still reads with its authored underscores; the answers are
   * asked once each, under the labels the paper gave them.
   */
  const blanksRepeatLeadingParts = blankCount > 0 && blankKeys !== null
    && partAnswers.length > blankCount
    && blankKeys.every((key, i) => {
      const part = fold(partAnswers[i] ?? '');
      const blank = fold(key);
      return blank !== '' && part !== '' && (part === blank || part.startsWith(blank));
    });

  if (blankCount > 0 && blankKeys && !blanksRepeatLeadingParts) {
    const authored: any[] = Array.isArray(raw?.answer_parts) ? raw.answer_parts : [];
    parts.forEach((segment, i) => {
      if (segment) prompt.push({ type: 'text', content: segment });
      if (i < blankCount) {
        const id = `blank${i + 1}`;
        const alternatives = partsAreTheBlanks
          ? [partAnswers[i], ...(authored[i]?.alternatives ?? []).map(str)]
            .filter((a) => a && a !== blankKeys[i])
          : [];
        widgets[id] = widgetForAnswer(id, blankKeys[i], { alternatives, fuzzy });
        prompt.push({ type: 'widget', id });
      }
    });
  } else if (text) {
    prompt.push({ type: 'text', content: text });
  }

  if (raw?.has_figure && str(raw?.figure_description)) {
    prompt.push({ type: 'figure', description: str(raw.figure_description) });
  }

  // ── Choice questions ────────────────────────────────────────────────────
  const options = optionList(raw?.options);
  if (options && ['multiple_choice', 'mcq', 'qcm', 'true_false'].includes(type)) {
    const key = str(raw?.correct);
    // The key is a letter ("b") as often as the option text itself.
    const byLetter = /^[a-z]$/i.test(key) ? key.toLowerCase().charCodeAt(0) - 97 : -1;
    const byText = options.findIndex((o) => o.toLowerCase() === key.toLowerCase());
    const id = 'choice';
    widgets[id] = { kind: 'choice', id, options, answer: byLetter >= 0 ? byLetter : Math.max(byText, 0) };
    steps.push(id);
  }

  // ── The step ladder — the grading key for 82.8% of the corpus ──────────
  const authoredParts: any[] = partsAreTheBlanks || !Array.isArray(raw?.answer_parts)
    ? []
    : raw.answer_parts;
  authoredParts.forEach((p, i) => {
    const answer = str(p?.answer);
    if (!answer) return;
    const id = `step${i + 1}`;
    const partOptions = optionList(p?.options);
    if (partOptions && partOptions.length > 1) {
      const idx = partOptions.findIndex((o) => o.toLowerCase() === answer.toLowerCase());
      widgets[id] = { kind: 'choice', id, options: partOptions, answer: Math.max(idx, 0), label: str(p?.label) };
    } else {
      widgets[id] = widgetForAnswer(id, answer, {
        alternatives: (p?.alternatives ?? []).map(str).filter(Boolean),
        label: str(p?.label) || undefined,
        fuzzy,
      });
    }
    steps.push(id);
  });

  // ── Otherwise: one answer for the whole question ────────────────────────
  if (Object.keys(widgets).length === 0) {
    const id = 'answer';
    // `final_answer` carries the key for 48 questions that have no other, and
    // the live grader has always read it. A placeholder is not a key, and a
    // question with no key at all is for review — never an input the student
    // is marked wrong against.
    const key = [str(raw?.correct), str(raw?.final_answer)].find((k) => !isPlaceholderKey(k));
    if (type === 'essay' || type === 'matching' || !key) {
      widgets[id] = { kind: 'essay', id, modelAnswer: str(raw?.model_answer) || undefined };
    } else {
      widgets[id] = widgetForAnswer(id, key, { fuzzy });
    }
    steps.push(id);
  }

  return {
    id: ctx.id ?? str(raw?.number) ?? 'q',
    prompt,
    widgets,
    steps,
    points: Number(raw?.points) > 0 ? Number(raw.points) : 1,
    hints: (Array.isArray(raw?.hints) ? raw.hints : []).map(str).filter(Boolean),
    explanation: str(raw?.explanation) || undefined,
    modelAnswer: str(raw?.model_answer) || undefined,
    approaches: (Array.isArray(raw?.approaches) ? raw.approaches : []).map(str).filter(Boolean),
    source: { type, subject: subject || undefined },
  };
}

/**
 * Separators the corpus actually uses, in order of how unambiguous they are.
 *
 * A comma is only a separator when it does NOT sit between digits: chemistry
 * writes "2,4-Dinitrophénylhydrazine" and French writes "3,14", and splitting
 * those produced one part too many, so the key was dropped entirely.
 *
 * "et" / "and" are real separators here ("propanal et propanone") but only as
 * whole words with space either side, so "complet" is never cut in half.
 */
const KEY_SEPARATORS = [/\|/, /;/, /,(?!\d)/, /\s+\/\s+/, /\s+et\s+/i, /\s+and\s+/i, /\s+&\s+/];

/**
 * Split an authored key across N blanks, or null when it does not divide
 * cleanly. Null is a real answer, not a failure: 49 questions write a single
 * answer for a two-blank sentence, and inventing two empty keys for them made
 * the question impossible to get right.
 *
 * A separator only counts when it yields exactly one part per blank, because
 * single-blank keys legitimately contain commas ("Port-au-Prince, Haïti").
 */
export function splitKey(correct: string, blanks: number): string[] | null {
  const t = str(correct);
  if (!t || blanks < 2) return blanks === 1 && t ? [t] : null;
  for (const re of KEY_SEPARATORS) {
    const p = t.split(re).map((x) => x.trim()).filter(Boolean);
    if (p.length === blanks) return p;
  }
  const words = t.split(/\s+/).filter(Boolean);
  return words.length === blanks ? words : null;
}
