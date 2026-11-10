import katex from 'katex';
import { katexSource } from '../../shared/display/mathRouting';
import { mathToRuns } from '../../shared/display/mathText';
import { hasTable, splitTables } from '../../shared/display/tables';
import { proseSegments, stripProseMarks } from '../../shared/display/proseMarks';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Exam/quiz text → HTML, the same way the phone draws it (shared/display):
 * tables as grids, drawn structures in a monospace box, formulas repaired and
 * typeset by KaTeX (`katexSource`), everything else as text with real
 * <sup>/<sub> (`mathToRuns`). `scripts/audit_exam_display.ts --web` runs this
 * over every exam.
 */
export function examTextHtml(src: string): string {
  if (!hasTable(src)) return textHtml(src);
  return splitTables(src).map((b) => {
    if (b.kind === 'code') return `<pre class="exam-code">${escapeHtml(b.text)}</pre>`;
    if (b.kind === 'text') return `<span class="exam-text-block">${textHtml(b.text)}</span>`;
    const row = (cells: string[], tag: 'th' | 'td') => `<tr>${cells.map((c) => `<${tag}>${runsHtml(c.replace(/\*\*([^*]+)\*\*/g, '$1'))}</${tag}>`).join('')}</tr>`;
    return `<span class="exam-table-wrap"><table class="exam-table">${b.header ? `<thead>${row(b.header, 'th')}</thead>` : ''}<tbody>${b.rows.map((r) => row(r, 'td')).join('')}</tbody></table></span>`;
  }).join('');
}

// Inline \frac is set at ~70%: unreadable at phone size. \dfrac keeps fractions
// at text size (the phone's WebView uses the same macro).
const KATEX_OPTS = { throwOnError: false, strict: 'ignore' as const, output: 'htmlAndMathml' as const, macros: { '\\frac': '\\dfrac' } };

function textHtml(raw: string): string {
  const prose = (s: string) => proseSegments(s).map((seg) => (seg.bold ? `<strong>${runsHtml(seg.text)}</strong>` : runsHtml(seg.text))).join('');
  const src = katexSource(stripProseMarks(raw));
  if (src == null) return prose(raw);
  // katexSource returns delimited formulas and already-converted prose.
  const mathRe = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g;
  let out = '';
  let last = 0;
  for (let m = mathRe.exec(src); m; m = mathRe.exec(src)) {
    out += escapeHtml(src.slice(last, m.index).replace(/＄/g, '$'));
    const display = m[1] != null || m[2] != null;
    const expr = m[1] ?? m[2] ?? m[3] ?? m[4] ?? '';
    try {
      // throwOnError here, so a fragment KaTeX can't parse (a formula cut by a
      // blank: "$10^{$ ____ $}$") falls back to text instead of a red error.
      out += katex.renderToString(expr, { ...(display ? { ...KATEX_OPTS, displayMode: true } : KATEX_OPTS), throwOnError: true });
    } catch {
      out += runsHtml(expr);
    }
    last = m.index + m[0].length;
  }
  return out + escapeHtml(src.slice(last).replace(/＄/g, '$'));
}

/** Plain text with LaTeX-ish markup: runs, exponents/indices as <sup>/<sub>. */
function runsHtml(text: string): string {
  return mathToRuns(text).map((r) => (r.script ? `<${r.script}>${escapeHtml(r.text)}</${r.script}>` : escapeHtml(r.text))).join('');
}

/** An option's key as shown: "a" → "A", a two-part key "a_1" → "A1". */
export function optionKeyLabel(key: unknown): string {
  return String(key ?? '').replace(/_/g, '').toUpperCase();
}
