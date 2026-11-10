/**
 * mathRouting — decide how a string of mixed prose + math should be rendered.
 *
 * KaTeX's auto-render walks text nodes and typesets only the segments wrapped
 * in $…$, \(…\) or \[…\]. Exam and quiz content, however, frequently ships
 * UNDELIMITED LaTeX ("36\sqrt{\frac{2}{7}}", "\alpha^2 = 3"). Those strings
 * still *look* mathy, so they used to be handed to the KaTeX WebView, where
 * auto-render found no delimiters and left the raw source on screen.
 *
 * Splitting the decision out of the component keeps it testable: `katexSource`
 * returns exactly what KaTeX should typeset (or null for the plain path), and
 * the exam display audit runs it over every exam.
 */
import { isMoneyPair, isPriceText, mathToText, repairLatex } from './mathText';

/** Paired math delimiters — the only thing KaTeX auto-render will typeset. */
export const HAS_DELIMITED_MATH = /\$[^$\n]+\$|\\\(|\\\[/;

export function needsKatex(text: string | null | undefined): boolean {
  const s = String(text ?? '');
  if (!HAS_DELIMITED_MATH.test(s) || isPriceText(s)) return false;
  // Money ("$5 and $10") pairs like maths but is not.
  return /\\\(|\\\[/.test(s) || (s.match(/\$[^$\n]+\$/g) ?? []).some((m) => !isMoneyPair(m.slice(1, -1)));
}

const PAIR = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g;

/** Function names a formula may spell out without being prose. */
const MATH_WORDS = /^(?:sin|cos|tan|cot|sec|csc|exp|log|lim|max|min|sup|inf|det|arg|deg|dim|ker|gcd|lcm|mod|sinh|cosh|tanh|arcsin|arccos|arctan|ln|frac|sqrt|cdot|times|left|right|infty|alpha|beta|gamma|delta|theta|lambda|sigma|omega|pi|mathbb|mathcal|text|mathrm|overline|vec|bar|hat|sum|prod|int|to|leq|geq|neq|approx|in|notin|cup|cap|setminus|emptyset|binom|dfrac|tfrac|pm|div|Delta|Omega|Sigma|varepsilon|epsilon|rightarrow|Rightarrow|Leftrightarrow|begin|end|pmatrix|bmatrix|vmatrix|matrix|cases|ldots|dots|cdots|quad|overrightarrow|widehat|mathbf|operatorname|displaystyle|forall|exists|subset|equiv|partial|nabla|varphi|sqrt)$/;

/**
 * True when a string with no delimiters is a formula and nothing else
 * ("36\sqrt{\frac{2}{7}}", "\alpha^2 = 3"): it has LaTeX in it and no word a
 * reader would call prose (four letters or more, or any accented letter).
 */
export function isBareFormula(text: string): boolean {
  const s = String(text ?? '').trim();
  if (!s || s.length > 220 || /\$|\\\(|\\\[|\n/.test(s)) return false;
  if (!/\\[a-zA-Z]+|[\^_]\{/.test(s)) return false;
  const noText = s.replace(/\\text\{[^}]*\}/g, ' ');
  if (/[À-ÿ]/.test(noText)) return false;
  const words = noText.replace(/\\([a-zA-Z]+)/g, (_, w) => (MATH_WORDS.test(w) ? ' ' : ` ${w} `)).match(/[A-Za-z]{4,}/g) ?? [];
  return words.every((w) => MATH_WORDS.test(w));
}

/**
 * Inside a formula, prose is set in maths italics with its spaces eaten:
 * "n^{ème}" slants, "diamètre\ du\ fil" runs together. A word carrying an
 * accent (and the words joined to it by spaces) goes into \text{}.
 */
export function proseInFormula(f: string): string {
  return repairFormula(f)
    .split(/(\\text\s*\{[^}]*\}|\\[a-zA-Z]+)/)
    .map((part, i) => (i % 2 === 1
      ? part
      : part.replace(/[A-Za-zÀ-ÿ'’]*[À-ÿ][A-Za-zÀ-ÿ'’]*(?:(?:\\ |\s)+[A-Za-zÀ-ÿ'’]{2,})*/g, (w) => `\\text{${w.replace(/\\ /g, ' ')}}`)))
    .join('');
}

/**
 * What KaTeX rejects but the author clearly meant:
 *   - chemistry's index after a charge, "CO_3^{2-}_{(aq)}" (a double
 *     subscript): give the second script an empty base, "…^{2-}{}_{(aq)}";
 *   - `\C` (not a KaTeX command) for a plain C;
 *   - a command inside \text{…} ("\text{ T\cdot m/A}"): \mathrm takes it;
 *   - a word-long index typed without braces, "I_eff" (KaTeX would lower only
 *     the "e"): "I_{eff}".
 */
function repairFormula(f: string): string {
  let s = f.replace(/(?<![\\A-Za-z])([A-Za-z0-9)'])([_^])([A-Za-z]{2,10})(?![A-Za-z{(])/g, (m, base, k, w) => `${base}${k}{${w}}`);
  // A chain of scripts on one base ("_3^{2-}_{(aq)}"): KaTeX takes one of each
  // kind, so a repeated kind starts again on an empty base.
  s = s.replace(/(?:[_^](?:\{[^{}]*\}|\\[A-Za-z]+|[A-Za-z0-9+\-])){2,}/g, (chain) => {
    const seen = new Set<string>();
    return (chain.match(/[_^](?:\{[^{}]*\}|\\[A-Za-z]+|[A-Za-z0-9+\-])/g) ?? []).map((tok) => {
      const kind = tok[0];
      const restart = seen.has(kind);
      if (restart) seen.clear();
      seen.add(kind);
      return restart ? `{}${tok}` : tok;
    }).join('');
  });
  s = s.replace(/\\([Ce])(?![a-zA-Z])/g, '$1');
  s = s.replace(/\\text\s*\{([^{}]*\\[a-zA-Z][^{}]*)\}/g, '\\mathrm{$1}');
  return s;
}

/** LaTeX left in the prose between formulas: KaTeX only reads delimited text. */
function prose(p: string): string {
  if (!p) return p;
  const blanks = p.replace(/(?:\\(?:ldots|dots|cdots)\s*)+/g, (m) => ((m.match(/\\/g) ?? []).length > 1 ? '……' : '…'));
  // A symbol with an index or exponent written in the prose ("I_{eff}",
  // "x_G", "e^{2x}") becomes a formula of its own, so KaTeX draws the script.
  const ascii = blanks.replace(/([A-Za-z0-9)])\^\(([^()]*)\)/g, '$1^{$2}');
  const scripted = ascii.replace(/(?<![\\\w$])((?:[A-Za-zα-ωΑ-Ω][A-Za-z]{0,3}(?:[_^](?:\{[^{}\n]*\}|\d+(?:[.,]\d+)?|[A-Za-z+\-](?![A-Za-z0-9])|[A-Za-z]{2,10}(?![A-Za-z0-9])))+)+)(?![\w$])/g, (tok) => `$${tok.replace(/([_^])(\d+(?:[.,]\d+)?|[A-Za-z]{2,10}(?![A-Za-z0-9]))/g, (m0, k, v) => (v.length > 1 ? `${k}{${v}}` : m0))}$`);
  return scripted.split(/(\$[^$]+\$)/).map((part) => (part.startsWith('$') || !/[\\^{}$]|(?<!_)_(?!_)/.test(part) ? part : mathToText(part))).join('');
}

/**
 * The string to hand KaTeX, or null when the plain-text path should draw it.
 *   - A bare formula gets its `$…$`.
 *   - A money pair ("$7501 millions de dollars$") stays prose.
 *   - Prose words inside a formula become \text{…}.
 *   - LaTeX in the prose between formulas (the `\ldots` blank of a sentence, a
 *     stray "\%", an orphaned `$`) is converted to text.
 */
export function katexSource(text: string | null | undefined): string | null {
  let raw = repairLatex(String(text ?? ''));
  if (!raw.trim() || isPriceText(raw)) return null;
  // A line with an odd number of `$` holds a formula whose closing `$` was
  // lost: close it at the end of that line.
  if (!/\$\$/.test(raw)) {
    raw = raw.split('\n').map((line) => {
      const dollars = line.replace(/\\\$/g, '').match(/\$/g)?.length ?? 0;
      const lastAt = line.lastIndexOf('$');
      const opens = lastAt >= 0 && !/\d\s?$/.test(line.slice(0, lastAt)) && /[\\^_=+\-\]\[(){}<>∪∩∞∈]/.test(line.slice(lastAt + 1));
      return dollars % 2 === 1 && opens ? line.replace(/(\s*[.;:!?]?\s*)$/, '$$$1') : line;
    }).join('\n');
  }
  if (isBareFormula(raw)) return `$${proseInFormula(raw.trim())}$`;
  let any = false;
  let out = '';
  let last = 0;
  PAIR.lastIndex = 0;
  for (let m = PAIR.exec(raw); m; m = PAIR.exec(raw)) {
    const inner = m[1] ?? m[2] ?? m[3] ?? m[4] ?? '';
    out += prose(raw.slice(last, m.index));
    if (m[4] != null && isMoneyPair(inner)) {
      out += m[0].replace(/\$/g, '＄');
    } else {
      any = true;
      const [open, close] = m[1] != null ? ['$$', '$$'] : m[2] != null ? ['\\[', '\\]'] : m[3] != null ? ['\\(', '\\)'] : ['$', '$'];
      out += `${open}${proseInFormula(inner)}${close}`;
    }
    last = m.index + m[0].length;
  }
  out += prose(raw.slice(last));
  return any ? out : null;
}
