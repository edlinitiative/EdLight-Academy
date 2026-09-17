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

const MATH_SUBJECTS = new Set(['Mathématiques', 'Physique', 'Chimie', 'SVT', 'Informatique']);

const str = (v: unknown) => String(v ?? '').trim();

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

  if (blankCount > 0) {
    // Split the authored key across the blanks the same way the grader does.
    const keys = splitKey(str(raw?.correct), blankCount) ?? [];
    parts.forEach((segment, i) => {
      if (segment) prompt.push({ type: 'text', content: segment });
      if (i < blankCount) {
        const id = `blank${i + 1}`;
        widgets[id] = widgetForAnswer(id, keys[i] ?? partAnswers[i] ?? '', { fuzzy });
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
  const authoredParts: any[] = Array.isArray(raw?.answer_parts) ? raw.answer_parts : [];
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
    if (type === 'essay' || type === 'matching') {
      widgets[id] = { kind: 'essay', id, modelAnswer: str(raw?.model_answer) || undefined };
    } else {
      widgets[id] = widgetForAnswer(id, str(raw?.correct), { fuzzy });
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
 * Split an authored key across N blanks. The corpus separates with a comma
 * (702), semicolon (97), slash (20), pipe (2) or spaces (51) — and single-blank
 * keys legitimately contain commas, so a separator only counts when it yields
 * exactly one part per blank.
 */
export function splitKey(correct: string, blanks: number): string[] | null {
  const t = str(correct);
  if (!t || blanks < 2) return blanks === 1 && t ? [t] : null;
  for (const sep of ['|', ';', ',', '/']) {
    if (!t.includes(sep)) continue;
    const p = t.split(sep).map((x) => x.trim()).filter(Boolean);
    if (p.length === blanks) return p;
  }
  const words = t.split(/\s+/).filter(Boolean);
  return words.length === blanks ? words : null;
}
