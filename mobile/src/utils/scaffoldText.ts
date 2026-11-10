/**
 * The scaffold's authored text with its blank markers shown as ①②③. Pure, so
 * the exam display audit runs the same code the screen does.
 */

/** ① ② ③ … (falls back to (n) past ⑳). */
export function circled(i: number): string {
  return i >= 0 && i < 20 ? String.fromCodePoint(0x2460 + i) : `(${i + 1})`;
}

const MARKER_RE = /(\\?\{\{\d+\}\}|\[\[\d+\]\])/;

/** Circled number for a single marker token, or null if not a marker. */
function markerToCircle(token: string): string | null {
  let m = /^\\?\{\{(\d+)\}\}$/.exec(token);
  if (m) return circled(Number(m[1])); // {{n}} is 0-indexed in real data
  m = /^\[\[(\d+)\]\]$/.exec(token);
  if (m) return circled(Number(m[1]) - 1); // [[n]] is 1-indexed
  return null;
}

/**
 * Replace blank markers in the authored scaffold text with circled numbers.
 * Real data uses `{{n}}` (0-indexed), sometimes *inside* `$…$` segments — a
 * marker inside a formula becomes \text{①}, so the formula stays whole. `[[n]]` (1-indexed)
 * and `___` runs are handled defensively.
 */
export function markScaffoldText(text: string): string {
  const src = recordToLines(String(text ?? ''));
  const hasMarkers = MARKER_RE.test(src);
  let seq = 0; // sequential counter for bare ___ blanks

  const out = src
    .split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g)
    .map((seg) => {
      const isMath = /^\$[\s\S]*\$$/.test(seg);
      if (isMath) {
        if (!MARKER_RE.test(seg)) return seg;
        // The blank stays INSIDE its formula, as text: splitting the formula
        // at the marker cut "\frac{ {{1}} }{4}" into halves KaTeX rejects (118
        // red parse errors across the catalog).
        return seg.replace(new RegExp(MARKER_RE.source, 'g'), (m) => `\\text{${markerToCircle(m) ?? m}}`);
      }
      // Plain prose: swap markers in place; treat ___ runs as sequential
      // blanks only when the text has no explicit markers.
      let plain = seg
        .replace(/\\?\{\{(\d+)\}\}/g, (_, n) => circled(Number(n)))
        .replace(/\[\[(\d+)\]\]/g, (_, n) => circled(Number(n) - 1));
      if (!hasMarkers) plain = plain.replace(/_{3,}/g, () => circled(seq++));
      return plain;
    })
    .join('');

  return out;
}

/**
 * A few scaffolds (matching questions) were authored as a JSON or Python
 * record: '{ "Architecture": "{{0}}", "Sculpture": "{{1}}" }'. Shown as is,
 * the student reads quotes and braces. One "Key : value" line per entry instead.
 */
export function recordToLines(text: string): string {
  const t = text.trim();
  if (!/^\{[\s\S]*\}$/.test(t) || !/["']\s*:/.test(t)) return text;
  const attempts = [t, t.replace(/'/g, '"')];
  for (const a of attempts) {
    try {
      const rec = JSON.parse(a);
      if (rec && typeof rec === 'object' && !Array.isArray(rec)) {
        return Object.entries(rec)
          .map(([k, v]) => `${k} : ${Array.isArray(v) ? v.join(', ') : String(v)}`)
          .join('\n');
      }
    } catch { /* not a record */ }
  }
  return text;
}

/**
 * The worked part of a scaffold: its text before the first blank, as the web
 * shows it. Empty when there is none, or when it only restates the question
 * (most fill-in scaffolds open by copying the question's sentence).
 */
export function workedPart(scaffold: string, question: string): string {
  const at = scaffold.search(/\\?\{\{\d+\}\}|\[\[\d+\]\]/);
  // Whole lines only: a blank inside a formula or a table row would leave half
  // of it behind ("\frac{1}{" with no end). A table cut before its first data
  // row is dropped with it.
  const lines = (at > 0 ? scaffold.slice(0, scaffold.lastIndexOf('\n', at - 1) + 1) : '').split('\n');
  while (lines.length && (!lines[lines.length - 1].trim() || /^\s*\|/.test(lines[lines.length - 1]) || /^\s*:?-{2,}/.test(lines[lines.length - 1]) || /\[Table:|```/.test(lines[lines.length - 1]))) lines.pop();
  let before = lines.join('\n').trim();
  // An algorithm whose code block runs past the blank: close the block here.
  if ((before.match(/```/g) ?? []).length % 2 === 1) before += '\n```';
  if (before.replace(/[\s•*\-–:.,;]/g, '').length < 12) return '';
  const words = (x: string) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]{3,}/g) ?? [];
  const q = new Set(words(question));
  const w = words(before);
  const shared = w.filter((x) => q.has(x)).length;
  return w.length && shared / w.length >= 0.7 ? '' : before;
}
