/**
 * mathText — convert inline LaTeX to readable Unicode for plain-text surfaces.
 *
 * Sandra replies in markdown and sometimes emits LaTeX (e.g. `$\frac{1}{4}$`).
 * react-native-markdown-display can't typeset math, so it rendered the raw
 * source. In a chat bubble, readable inline text ("1/4", "x²", "√(2)") is
 * better UX than a WebView per formula — so we transform the common constructs
 * to Unicode. Best-effort: unknown commands degrade to their bare name.
 */

const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶',
  '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '(': '⁽', ')': '⁾',
  n: 'ⁿ', i: 'ⁱ',
};
const SUB: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆',
  '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '(': '₍', ')': '₎',
};
const SYMBOLS: Record<string, string> = {
  times: '×', div: '÷', cdot: '·', pm: '±', mp: '∓', leq: '≤', le: '≤',
  geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡', infty: '∞',
  pi: 'π', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ',
  theta: 'θ', lambda: 'λ', mu: 'μ', sigma: 'σ', Sigma: '∑', omega: 'ω',
  Omega: 'Ω', phi: 'φ', rho: 'ρ', tau: 'τ', rightarrow: '→', Rightarrow: '⇒',
  leftarrow: '←', to: '→', in: '∈', notin: '∉', forall: '∀', exists: '∃',
  sum: '∑', int: '∫', partial: '∂', nabla: '∇', angle: '∠', deg: '°',
  circ: '°', ldots: '…', dots: '…', cdots: '⋯',
};

/** The named sets, which carry meaning a bare letter does not. */
const BLACKBOARD: Record<string, string> = {
  N: 'ℕ', Z: 'ℤ', Q: 'ℚ', R: 'ℝ', C: 'ℂ',
};

function toScript(s: string, map: Record<string, string>): string | null {
  let out = '';
  for (const ch of s) {
    if (map[ch] == null) return null;
    out += map[ch];
  }
  return out;
}

/** Only unwrap `$…$` when the inner content actually looks like math. */
const looksMath = (inner: string) => /[\\^_{}]/.test(inner);

export function mathToText(input: string): string {
  if (!input) return input;
  // Quiz-bank content sometimes mixes Unicode with LaTeX ("√{\frac{2}{7}}"),
  // so braces alone are reason enough to run — not just $ and backslashes.
  if (!input.includes('$') && !input.includes('\\') && !/√\s*\{/.test(input)) return input;
  let s = input;

  // Strip math delimiters, keeping inner content (but leave literal "$5" prose).
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, (m, inner) => (looksMath(inner) ? inner : m));
  s = s.replace(/\$([^$\n]*?)\$/g, (m, inner) => (looksMath(inner) ? inner : m));
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, '$1').replace(/\\\[([\s\S]*?)\\\]/g, '$1');

  // Parenthesize multi-char parts, but a bare number needs no parentheses
  // ("2/49" reads fine; "2/(49)" reads like a mistake).
  const wrap = (x: string) => (x.length > 1 && !/^\d+(?:[.,]\d+)?$/.test(x) ? `(${x})` : x);

  // The structural rules only match brace groups with NO nested braces, so a
  // construct inside another ("\sqrt{\frac{2}{7}}") needs the inner one
  // rewritten first. Loop until stable — innermost resolves each pass.
  // (This was the "formatting issues" TestFlight bug: exam options showed
  // raw "36√{\frac{2}{7}}".)
  for (let pass = 0; pass < 8; pass += 1) {
    const before = s;

    // \frac{a}{b} / \dfrac / \tfrac -> a/b (parenthesize multi-char parts)
    s = s.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_, a, b) => `${wrap(a)}/${wrap(b)}`);
    // \sqrt{x} -> √(x) — also the pre-mixed Unicode form "√{x}"
    s = s.replace(/(?:\\sqrt|√)\s*\{([^{}]*)\}/g, (_, x) => `√(${x})`);
    // Blackboard bold is a REAL symbol, not a font choice: \mathbb{R} is ℝ, and
    // unwrapping it to a bare "R" loses the meaning. Named sets first, then the
    // general unwrap.
    s = s.replace(/\\mathbb\s*\{\s*([NZQRC])\s*\}/g, (_, L) => BLACKBOARD[L] ?? L);
    // text-ish wrappers keep their content. \mathbb/\mathcal/\mathfrak were
    // missing here, so "\mathbb{R}" fell through to the bare-command rule below
    // and reached students as the word "mathbbR".
    s = s.replace(/\\(?:text|mathrm|mathbf|mathit|mathbb|mathcal|mathfrak|mathsf|mathtt|operatorname)\s*\{([^{}]*)\}/g, '$1');

    // super/subscripts
    s = s.replace(/\^\{([^{}]*)\}/g, (_, x) => toScript(x, SUP) ?? `^(${x})`);
    s = s.replace(/\^(\w)/g, (_, x) => toScript(x, SUP) ?? `^${x}`);
    s = s.replace(/_\{([^{}]*)\}/g, (_, x) => toScript(x, SUB) ?? `_(${x})`);
    s = s.replace(/_(\w)/g, (_, x) => toScript(x, SUB) ?? `_${x}`);

    if (s === before) break;
  }

  // \begin{env}…\end{env}. Without this the bare-command rule below turns
  // "\begin{pmatrix}" into the word "beginpmatrix" and leaves the `\\` row
  // separators untouched — exactly what the determinant question showed on
  // TestFlight. Matrices read as bracketed rows; any other environment just
  // contributes its body, since its name is noise to a student.
  s = s.replace(
    /\\begin\s*\{([a-zA-Z*]+)\}([\s\S]*?)\\end\s*\{\1\}/g,
    (_, env: string, body: string) => {
      const rows = body.split(/\\\\/).map((r) => r.trim()).filter(Boolean);
      if (/matrix$/i.test(env)) {
        const cells = rows.map((r) => r.split('&').map((c) => c.trim()).join(', '));
        return `[${cells.join('; ')}]`;
      }
      return rows.map((r) => r.replace(/&/g, ' ').replace(/\s+/g, ' ').trim()).join(' ');
    },
  );

  // \left( \right) sizing wrappers are noise in plain text
  s = s.replace(/\\left\s*/g, '').replace(/\\right\s*/g, '');

  // Remaining commands -> symbol or bare name
  s = s.replace(/\\([a-zA-Z]+)/g, (_, name) => SYMBOLS[name] ?? name);

  // Leftover grouping braces
  s = s.replace(/[{}]/g, '');
  return s;
}
