import type {
  CompiledQuestion, QuestionScore, Response, Validity, Widget, WidgetScore,
} from './schema';

/**
 * Scoring for the question IR. Pure, framework-free, shared by web and mobile.
 *
 * Two rules the old grader broke:
 *
 *  1. VALIDATION IS NOT SCORING. `checkAnswer` returned `false` for empty,
 *     malformed and wrong alike, so a student who typed "douze" into a numeric
 *     field was told they were wrong rather than told to enter a number.
 *  2. PARTIAL CREDIT IS NATIVE. Marks divide across a question's widgets, so
 *     getting two steps of three right earns two thirds — which is both fairer
 *     and the difference between feeling stuck and feeling close.
 */

const strip = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Capped Levenshtein — we only ever ask "within N edits?". */
function within(a: string, b: string, max: number): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

/** Edits forgiven, by length. Short words stay strict: "mer" is not "fer". */
const budget = (w: string) => (w.length <= 4 ? 0 : w.length <= 8 ? 1 : 2);

/** Accepts "3,14", "3.14 m", "3.14m". Returns null when it is not a number. */
export function parseNumeric(raw: string): { value: number; unit: string } | null {
  const t = String(raw ?? '').trim().replace(',', '.');
  const m = /^(-?\d+(?:\.\d+)?)\s*([a-zA-Zµ°%/²³·]*)$/.exec(t);
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  return { value, unit: m[2] ?? '' };
}

export function validate(widget: Widget, raw: Response[string]): Validity {
  const isBlank = raw == null
    || (typeof raw === 'string' && raw.trim() === '')
    || (Array.isArray(raw) && raw.length === 0);
  if (isBlank) return { state: 'empty' };

  if (widget.kind === 'numeric') {
    return parseNumeric(String(raw)) ? { state: 'ok' } : { state: 'invalid', reason: 'not-a-number' };
  }
  if (widget.kind === 'order') {
    const given = Array.isArray(raw) ? raw : [];
    return given.length === widget.items.length
      ? { state: 'ok' }
      : { state: 'invalid', reason: 'incomplete' };
  }
  return { state: 'ok' };
}

/** Null means "cannot be auto-scored" (essay), never "wrong". */
export function isCorrect(widget: Widget, raw: Response[string]): boolean | null {
  switch (widget.kind) {
    case 'essay':
      return null;

    case 'choice': {
      const i = typeof raw === 'number' ? raw : Number(raw);
      return Number.isInteger(i) && i === widget.answer;
    }

    case 'order': {
      const given = Array.isArray(raw) ? raw : [];
      return given.length === widget.answer.length
        && given.every((v, i) => v === widget.answer[i]);
    }

    case 'numeric': {
      const parsed = parseNumeric(String(raw));
      if (!parsed) return false;
      // Absolute tolerance when authored, else 1% relative with a small floor,
      // so 0 and very small answers stay sane.
      const tol = widget.tolerance ?? Math.max(Math.abs(widget.answer) * 0.01, 0.01);
      if (Math.abs(parsed.value - widget.answer) > tol) return false;
      if (widget.unitRequired && strip(parsed.unit) !== strip(widget.unit ?? '')) return false;
      // A wrong unit is wrong even when it was not required to be typed.
      if (parsed.unit && widget.unit && strip(parsed.unit) !== strip(widget.unit)) return false;
      return true;
    }

    case 'text': {
      const given = strip(String(raw));
      const accepted = [widget.answer, ...(widget.alternatives ?? [])]
        .map((a) => strip(String(a ?? '')))
        .filter(Boolean);
      if (accepted.some((a) => a === given)) return true;
      if (!widget.fuzzy) return false;
      return accepted.some((a) => within(given, a, budget(a.length >= given.length ? a : given)));
    }

    default:
      return null;
  }
}

export function gradeQuestion(q: CompiledQuestion, response: Response): QuestionScore {
  const ids = Object.keys(q.widgets);
  // Marks split evenly: no answer_parts entry in the corpus carries its own
  // points (0% of 19,041), so even division is the only honest rule.
  const per = ids.length > 0 ? q.points / ids.length : 0;

  const widgets: WidgetScore[] = ids.map((id) => {
    const w = q.widgets[id];
    const raw = response[id] ?? null;
    const validity = validate(w, raw);
    const correct = validity.state === 'ok' ? isCorrect(w, raw) : (w.kind === 'essay' ? null : false);
    return {
      id,
      validity,
      correct,
      earned: correct === true ? per : 0,
      possible: per,
    };
  });

  const scorable = widgets.filter((w) => w.correct !== null);
  return {
    widgets,
    earned: Math.round(widgets.reduce((n, w) => n + w.earned, 0) * 100) / 100,
    possible: q.points,
    allCorrect: scorable.length > 0 && scorable.every((w) => w.correct === true),
    needsReview: scorable.length === 0,
  };
}
