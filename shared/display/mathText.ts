/**
 * mathText — LaTeX to readable text for the surfaces that cannot typeset.
 *
 * Exam content arrives as LaTeX in every shape: delimited ("$\frac{1}{4}$"),
 * undelimited ("36\sqrt{\frac{2}{7}}"), bare ASCII ("1/2*m*v^2", "Fe^{2+}",
 * "x_G") and broken (a `$` orphaned by a blank, "ln\ x"). Wherever a KaTeX
 * WebView cannot go (words flowing around an input, labels, buttons) this turns
 * all of it into proper text.
 *
 * Two outputs from ONE pipeline:
 *   - `mathToRuns` keeps raised/lowered text as separate runs, so a component
 *     can draw a real exponent or index (`MathRunsText`) when Unicode has no
 *     character for it: there is no subscript G, so "x_G" can only be drawn.
 *   - `mathToText` flattens those runs to a string (Unicode scripts where they
 *     exist, `^(…)`/`_(…)` otherwise) for accessibility labels and tests.
 *
 * The exam display audit (scripts/audit_exam_display.ts) runs every string of
 * every exam through this file; it is the regression net for any change here.
 */

const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶',
  '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  n: 'ⁿ', i: 'ⁱ', '′': '′',
};
const SUB: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆',
  '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎',
  n: 'ₙ', i: 'ᵢ',
};
const SYMBOLS: Record<string, string> = {
  times: '×', div: '÷', cdot: '·', pm: '±', mp: '∓', leq: '≤', le: '≤', leqslant: '≤',
  geq: '≥', ge: '≥', geqslant: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡', infty: '∞',
  pi: 'π', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', epsilon: 'ε', varepsilon: 'ε',
  zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν',
  xi: 'ξ', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  rightarrow: '→', Rightarrow: '⇒', longrightarrow: '⟶', Longrightarrow: '⟹', implies: '⇒',
  leftarrow: '←', Leftarrow: '⇐', leftrightarrow: '↔', Leftrightarrow: '⇔', iff: '⇔', mapsto: '↦',
  rightleftharpoons: '⇌', uparrow: '↑', downarrow: '↓', to: '→', gets: '←',
  in: '∈', notin: '∉', ni: '∋', forall: '∀', exists: '∃', cup: '∪', cap: '∩', setminus: '∖',
  emptyset: '∅', varnothing: '∅', subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇',
  sum: '∑', prod: '∏', int: '∫', oint: '∮', partial: '∂', nabla: '∇', angle: '∠', deg: '°',
  circ: '°', ldots: '…', dots: '…', cdots: '⋯', vdots: '⋮', ddots: '⋱', prime: '′',
  propto: '∝', sim: '∼', simeq: '≃', cong: '≅', perp: '⊥', parallel: '∥', mid: '|',
  langle: '⟨', rangle: '⟩', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉', vert: '|', Vert: '‖',
  ell: 'ℓ', hbar: 'ℏ', ast: '∗', star: '⋆', bullet: '•', wedge: '∧', vee: '∨', neg: '¬', lnot: '¬',
  oplus: '⊕', otimes: '⊗', degree: '°', quad: ' ', qquad: ' ', '%': '%',
  triangle: '△', nearrow: '↗', searrow: '↘', nwarrow: '↖', swarrow: '↙', land: '∧', lor: '∨', ll: '≪', gg: '≫',
  nleftrightarrow: '↮', hline: '', atop: ' / ', square: '□', checkmark: '✓', varpi: 'ϖ', aleph: 'ℵ', flat: '♭', sharp: '♯', natural: '♮',
};
/** Commands that are sizing or spacing noise in running text. */
const NOISE = /\\(?:left|right|big|Big|bigg|Bigg|displaystyle|textstyle|scriptstyle|limits|nolimits|middle)(?![a-zA-Z])\s*/g;

/** French ordinals as French typography writes them: 50ᵉ, 1ᵉʳ, 1ʳᵉ. */
const ORDINAL: Record<string, string> = { 'ème': 'ᵉ', eme: 'ᵉ', e: 'ᵉ', 'è': 'ᵉ', er: 'ᵉʳ', 'ère': 'ʳᵉ', ere: 'ʳᵉ', re: 'ʳᵉ', nd: 'ᵈ', nde: 'ᵈᵉ' };
const BLACKBOARD: Record<string, string> = { N: 'ℕ', Z: 'ℤ', Q: 'ℚ', R: 'ℝ', C: 'ℂ', P: 'ℙ', K: '𝕂', D: '𝔻' };
const SCRIPT: Record<string, string> = {
  A: '𝒜', B: 'ℬ', C: '𝒞', D: '𝒟', E: 'ℰ', F: 'ℱ', G: '𝒢', H: 'ℋ', I: 'ℐ', J: '𝒥', K: '𝒦', L: 'ℒ', M: 'ℳ',
  N: '𝒩', O: '𝒪', P: '𝒫', Q: '𝒬', R: 'ℛ', S: '𝒮', T: '𝒯', U: '𝒰', V: '𝒱', W: '𝒲', X: '𝒳', Y: '𝒴', Z: '𝒵',
};

// Private-use markers around a raised / lowered run, and placeholders that
// keep escaped characters (\{ \$ \%) out of the structural rules.
const SUP_OPEN = '';
const SUB_OPEN = '';
const CLOSE = '';
const ROWBREAK = '\uE020';
const ESC: Record<string, string> = { '{': '', '}': '', $: '', '%': '', '&': '', '#': '', _: '' };
const UNESC: Record<string, string> = Object.fromEntries(Object.entries(ESC).map(([k, v]) => [v, k]));

function toScript(s: string, map: Record<string, string>): string | null {
  let out = '';
  for (const ch of s) {
    if (map[ch] == null) return null;
    out += map[ch];
  }
  return out;
}

/**
 * A `$…$` pair that is money, not maths: "$7501 millions de dollars", "$5 and
 * $10". It starts with a number and goes on in words, with nothing mathematical.
 */
export function isMoneyPair(inner: string): boolean {
  return /^\s*\d[\d\s.,]*(?:\s|$)/.test(inner) && /[a-zà-ÿ]{3,}/.test(inner) && !/[\\^_{}=/()]/.test(inner);
}

/**
 * Undo the damage a JSON round trip did to the source. 1 008 formulas in the
 * catalog carry "\frac" as a newline followed by "rac" (the `\f` was read as an
 * escape), and dozens of "\neq" / "\neg" a newline followed by "eq" / "eg".
 * KaTeX does not even error on those: it quietly typesets the letters "rac".
 */
export function repairLatex(input: string): string {
  return String(input ?? '')
    // A line break escaped as text: "suivant:\\n| x_i | 0 |\\n|---|". Only before
    // a pipe, a space or the end, so \\neq, \\nu, \\nabla are never touched.
    .replace(/\\n(?=\s*\||\s|$)/g, '\n')
    // A tab or line break escaped twice ("\\tLe", "\\nD"): no command starts so.
    .replace(/\\t(?=[A-Z])/g, ' ')
    .replace(/\\n(?=[A-Z])/g, '\n')
    // A formula wrapped in code ticks with a stray `$`: "`0,5 \\ kV$`".
    .replace(/`\$?([^`$\n]+)\$`/g, (_, f) => `$${f}$`)
    .replace(/\n(rac\s*\{)/g, '\\f$1')
    .replace(/\f(rac\s*\{)/g, '\\f$1')
    .replace(/([^\n])\n(eq|eg)(?=[\s\d$\\(\-{]|$)/g, '$1\\n$2')
    .replace(/( )\n(e)(?= [-\d])/g, '$1\\n$2')
    .replace(/\t(imes|ext\s*\{|heta|au|o\b|riangle)/g, '\\t$1')
    .replace(/\r(ightarrow|ho\b|angle)/g, '\\r$1')
    .replace(/\u0008(eta|ar\s*\{|inom|egin|oxed)/g, '\\b$1');
}

/**
 * A block where every `$` comes right after a number ("26$ et 7", "182$ - 96$")
 * is priced in dollars, with no formula in it.
 */
export function isPriceText(text: string): boolean {
  const t = String(text ?? '');
  if (/\\[a-zA-Z]|[\^_]/.test(t)) return false;
  const all = t.match(/\$/g)?.length ?? 0;
  const priced = t.match(/(?<![\w^_{.,])\d+(?:[.,]\d+)?\s?\$/g)?.length ?? 0;
  return all > 0 && all === priced;
}

/** Anything worth running the pipeline for. */
const MARKUP = /[$\\^{}*]|(?<!_)_(?!_)|->|<=|>=|√\s*\{/;

const accent = (combining: string) => (_: string, x: string) => (x.length === 1 ? `${x}${combining}` : [...x].map((c) => `${c}${combining}`).join(''));

function core(input: string): string {
  let s = repairLatex(input);

  // "R\{0}": \u211D minus a set, the backslash being \setminus.
  s = s.replace(/(?<![A-Za-z\\])([NZQRC])\\\{/g, (_, L) => `${BLACKBOARD[L]} \u2216 \\{`);
  // Escaped characters are literal: park them before any structural rule.
  s = s.replace(/\\([{}$%&#_])/g, (_, c) => ESC[c]);
  if (isPriceText(s)) s = s.replace(/\$/g, ESC.$);
  // An escaped opening brace closed by a bare one is still a set.
  s = s.replace(/\uE010([^\uE011{}]*)\}/g, '\uE010$1\uE011');

  // Delimiters. A `$…$` pair is unwrapped whatever its content ("$f$" is the
  // variable f), unless it is money. A `$` left without a partner (a formula cut
  // by a blank, "$Df =") is dropped, but a price ("26$", "$5") keeps its sign.
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, '$1');
  s = s.replace(/\$([^$\n]*?)\$/g, (m, inner) => (isMoneyPair(inner) ? `${ESC.$}${inner}${ESC.$}` : inner));
  s = s.replace(/\$(?!\s?\d)/g, (m, off, str) => (/\d\s?$/.test(str.slice(0, off)) ? ESC.$ : ''));
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, '$1').replace(/\\\[([\s\S]*?)\\\]/g, '$1');

  // A row break (\\) is parked first: the spacing rules below would read its
  // second backslash as "\ " and lose the matrix rows.
  s = s.replace(/\\\\/g, ROWBREAK);
  // Spacing and sizing commands.
  s = s.replace(/\\[,;:>]/g, ' ').replace(/\\!/g, '').replace(/\\ /g, ' ').replace(/~/g, ' ');
  s = s.replace(NOISE, '');

  // A parenthesis only where it is needed: "2/49" and "√2" read fine; "2/(49)"
  // and "√(2)" read like a mistake.
  const simple = (x: string) => {
    const bare = x
      .replace(/[\uE000\uE001][^\uE002]*\uE002/g, '')
      .replace(/[\u0300-\u036F\u20D0-\u20FF₀-₉⁰-⁹ₙᵢⁿₖₘₚₜₓⱼ⁺⁻ˣ′]/g, '');
    return /^\d+(?:[.,]\d+)?$/.test(bare) || /^[A-Za-zα-ωΑ-Ωπ∞]$/.test(bare);
  };
  const wrap = (x: string) => (simple(x) ? x : `(${x})`);

  // Structural rules match brace groups with no nested braces, so a construct
  // inside another ("\sqrt{\frac{2}{7}}") resolves innermost first, pass by pass.
  for (let pass = 0; pass < 10; pass += 1) {
    const before = s;
    s = s.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_, a, b) => `${wrap(a.trim())}/${wrap(b.trim())}`);
    s = s.replace(/\\[dt]?frac\s*(\d)\s*(\d)/g, '$1/$2');
    s = s.replace(/\\binom\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_, n, k) => `C(${n.trim()}, ${k.trim()})`);
    s = s.replace(/\\sqrt\s*\[\s*([^\]]+?)\s*\]\s*\{([^{}]*)\}/g, (_, n, x) => {
      const root = n === '3' ? '∛' : n === '4' ? '∜' : `${toScript(n, SUP) ?? `${n}`}√`;
      return `${root}${wrap(x.trim())}`;
    });
    s = s.replace(/(?:\\sqrt|√)\s*\{([^{}]*)\}/g, (_, x) => `√${wrap(x.trim())}`);
    s = s.replace(/\\sqrt\s*(\w)/g, '√$1');
    s = s.replace(/\\mathbb\s*\{\s*([A-Z])\s*\}/g, (_, L) => BLACKBOARD[L] ?? L);
    s = s.replace(/\\mathbb\s*([NZQRC])(?![a-zA-Z])/g, (_, L) => BLACKBOARD[L] ?? L);
    s = s.replace(/\\math(?:cal|scr)\s*\{\s*([A-Z])\s*\}/g, (_, L) => SCRIPT[L] ?? L);
    // A reaction arrow carrying its conditions: "→ (H₂SO₄, 170 °C)".
    s = s.replace(/\\x(?:right|long)?(?:rightarrow|leftarrow)\s*(?:\[[^\]]*\])?\s*\{([^{}]*)\}/g, (m, x) => (x.trim() ? ` → (${x.trim()}) ` : ' → '));
    s = s.replace(/\\overset\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_, a, b) => `${b}${SUP_OPEN}${a}${CLOSE}`);
    s = s.replace(/\\underset\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_, a, b) => `${b}${SUB_OPEN}${a}${CLOSE}`);
    s = s.replace(/\\(?:overline|bar)\s*\{([^{}]*)\}/g, accent('̅'));
    s = s.replace(/\\bar\s*(\w)/g, '$1̅');
    s = s.replace(/\\(?:vec|overrightarrow)\s*\{([^{}]*)\}/g, (_, x) => (x.length === 1 ? `${x}⃗` : `${x}⃗`));
    s = s.replace(/\\vec\s*(\w)/g, '$1⃗');
    s = s.replace(/\\widehat\s*\{([^{}]*)\}/g, (_, x) => (x.length > 1 ? `∠${x}` : `${x}̂`));
    s = s.replace(/\\hat\s*\{([^{}]*)\}/g, accent('̂'));
    s = s.replace(/\\tilde\s*\{([^{}]*)\}/g, accent('̃'));
    s = s.replace(/\\dot\s*\{([^{}]*)\}/g, accent('̇'));
    s = s.replace(/\\(?:text|textrm|textit|textbf|mathrm|mathbf|mathit|mathbb|mathcal|mathfrak|mathsf|mathtt|operatorname|mbox|boldsymbol|bm|underline|overbrace|underbrace)\s*\{([^{}]*)\}/g, '$1');

    // Scripts: Unicode where every character has one, a marked run otherwise.
    const sup = (x: string) => ORDINAL[x.toLowerCase()] ?? toScript(x, SUP) ?? `${SUP_OPEN}${x}${CLOSE}`;
    const sub = (x: string) => toScript(x, SUB) ?? `${SUB_OPEN}${x}${CLOSE}`;
    s = s.replace(/\^\s*\{([^{}]*)\}/g, (_, x) => sup(x.trim()));
    s = s.replace(/(?<!_)_\s*\{([^{}]*)\}/g, (_, x) => sub(x.trim()));
    if (s === before) break;
  }
  // Exponents typed in ASCII: "m^(1/n)", "10^(-5)", "(0.9)^(n+1)".
  s = asciiExponents(s, (x) => toScript(x, SUP) ?? `${SUP_OPEN}${x}${CLOSE}`);
  s = s.replace(/\^\s*(-?\d+(?:[.,]\d+)?|[A-Za-zα-ω*′]|[+\-−](?![\d\w]))/g, (_, x) => toScript(x, SUP) ?? `${SUP_OPEN}${x}${CLOSE}`);
  s = s.replace(/(?<=^|[A-Za-z0-9À-ÿα-ωΑ-Ω)\]′'\u0305\u20D7₀-₉])(?<!_)_(?!_)\s*([A-Za-z0-9α-ω])/g, (_, x) => toScript(x, SUB) ?? `${SUB_OPEN}${x}${CLOSE}`);

  // \begin{env}…\end{env}: a matrix reads as bracketed rows; any other
  // environment just contributes its body.
  s = s.replace(/\\begin\s*\{([a-zA-Z*]+)\}([\s\S]*?)\\end\s*\{\1\}/g, (_, env: string, body: string) => {
    const rows = body.split(ROWBREAK).map((r) => r.trim()).filter(Boolean);
    if (/matrix$/i.test(env)) return `[${rows.map((r) => r.split('&').map((c) => c.trim()).join(', ')).join('; ')}]`;
    if (/cases$/i.test(env)) return `{ ${rows.map((r) => r.replace(/&/g, ' ').replace(/\s+/g, ' ').trim()).join(' ; ')} }`.replace(/[{}]/g, (b) => (b === '{' ? ESC['{'] : ESC['}']));
    return rows.map((r) => r.replace(/&/g, ' ').replace(/\s+/g, ' ').trim()).join(' ');
  });
  s = s.split(ROWBREAK).join('\n');

  // Every remaining command: its symbol, or its bare name (\ln, \sin, \lim).
  s = s.replace(/\\([a-zA-Z]+)/g, (_, name) => SYMBOLS[name] ?? name);
  s = s.replace(/\\(?=[^a-zA-Z-])/g, '');

  // ASCII notation that exam answers are typed in.
  s = s.replace(/(?<=[A-G])\^?flat/g, '♭').replace(/(?<=[A-G])\^?sharp/g, '♯');
  s = s.replace(/\bsqrt\s*\[\s*(\w+)\s*\]\s*\(/g, (_, n) => `${toScript(n, SUP) ?? n}√(`).replace(/\bsqrt\s*\(/g, '√(');
  s = s.replace(/(?<![A-Za-z\\])pi(?![A-Za-z])(?=\s*[·×*/)\d]|$)/g, 'π');
  s = s.replace(/<=>/g, '⇔').replace(/<->/g, '⇌').replace(/-->|->/g, '→').replace(/=>/g, '⇒');
  s = s.replace(/(?<![<>=!])<=(?!=)/g, '≤').replace(/(?<![<>=!])>=(?!=)/g, '≥');
  s = s.replace(/(?<=[\w)\]²³⁰-⁹′])\s*(?<!\*)\*(?!\*)\s*(?=[\w(√π\u0080-￿])/g, (m) => (/\s/.test(m) ? ' × ' : '·'));

  // What is left in braces is either a group glued to what precedes it
  // (structure: drop the braces) or a set written in the open, "= {0}",
  // "ℝ ∖ {0}", "S = {(A, a); (B, b)}" (content: keep them).
  for (let pass = 0; pass < 3; pass += 1) {
    s = s.replace(/(^|[\s=∖∈∉⊂⊆(,;:|])\{([^{}]*)\}/g, (_, pre, inner) => `${pre}${ESC['{']}${inner}${ESC['}']}`);
  }
  s = s.replace(/[{}]/g, '');
  s = s.replace(/(\S) {2,}(?=\S)/g, '$1 ');
  return s.replace(/[-]/g, (c) => UNESC[c]);
}

/** "^(…)" with nested parentheses: the exponent runs to its matching ")". */
function asciiExponents(s: string, sup: (x: string) => string): string {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const at = s.indexOf('^(', i);
    if (at < 0) { out += s.slice(i); break; }
    let depth = 0;
    let end = -1;
    for (let j = at + 1; j < s.length; j += 1) {
      if (s[j] === '(') depth += 1;
      else if (s[j] === ')') { depth -= 1; if (depth === 0) { end = j; break; } }
    }
    if (end < 0) { out += s.slice(i); break; }
    out += s.slice(i, at) + sup(s.slice(at + 2, end));
    i = end + 1;
  }
  return out;
}

export type MathRun = { text: string; script?: 'sup' | 'sub' };

/** Prose + maths as runs, with raised and lowered text kept separate. */
export function mathToRuns(input: string): MathRun[] {
  const src = String(input ?? '');
  if (!src) return [];
  if (!MARKUP.test(src)) return [{ text: src }];
  const s = core(src);
  const runs: MathRun[] = [];
  const re = /([])([^]*)/g;
  let last = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > last) runs.push({ text: s.slice(last, m.index) });
    // A script inside a script stays at one level: two levels down is
    // unreadable at phone size.
    runs.push({ text: m[2].replace(/[-]/g, ''), script: m[1] === SUP_OPEN ? 'sup' : 'sub' });
    last = m.index + m[0].length;
  }
  if (last < s.length) runs.push({ text: s.slice(last) });
  return runs.map((r) => (r.script ? r : { text: r.text.replace(/[-]/g, '') })).filter((r) => r.text);
}

/**
 * Letter forms for places that can only hold text (SVG labels, accessibility
 * labels): eˣ, xᵢ. The drawn runs stay the main path; these glyphs come from
 * fallback fonts, so they are a last resort, not the look.
 */
const SUP_TEXT: Record<string, string> = { ...SUP, a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', j: 'ʲ', k: 'ᵏ', l: 'ˡ', m: 'ᵐ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ', t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ' };
const SUB_TEXT: Record<string, string> = { ...SUB, a: 'ₐ', e: 'ₑ', h: 'ₕ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ' };

/** The runs as one string: `^(…)` / `_(…)` where Unicode has no script. */
export function runsToText(runs: MathRun[]): string {
  return runs.map((r) => {
    if (!r.script) return r.text;
    const glyphs = toScript(r.text, r.script === 'sup' ? SUP_TEXT : SUB_TEXT);
    if (glyphs) return glyphs;
    const t = r.text.length > 1 ? `(${r.text})` : r.text;
    return r.script === 'sup' ? `^${t}` : `_${t}`;
  }).join('');
}

export function mathToText(input: string): string {
  if (!input) return input;
  if (!MARKUP.test(input)) return input;
  return runsToText(mathToRuns(input));
}
