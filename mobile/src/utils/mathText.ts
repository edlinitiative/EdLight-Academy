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
  if (!input || (!input.includes('$') && !input.includes('\\'))) return input;
  let s = input;

  // Strip math delimiters, keeping inner content (but leave literal "$5" prose).
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, (m, inner) => (looksMath(inner) ? inner : m));
  s = s.replace(/\$([^$\n]*?)\$/g, (m, inner) => (looksMath(inner) ? inner : m));
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, '$1').replace(/\\\[([\s\S]*?)\\\]/g, '$1');

  // \frac{a}{b} / \dfrac / \tfrac -> a/b (parenthesize multi-char parts)
  const wrap = (x: string) => (x.length > 1 ? `(${x})` : x);
  s = s.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_, a, b) => `${wrap(a)}/${wrap(b)}`);
  // \sqrt{x} -> √(x)
  s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, (_, x) => `√(${x})`);
  // text-ish wrappers keep their content
  s = s.replace(/\\(?:text|mathrm|mathbf|mathit|operatorname)\s*\{([^{}]*)\}/g, '$1');

  // super/subscripts
  s = s.replace(/\^\{([^{}]*)\}/g, (_, x) => toScript(x, SUP) ?? `^(${x})`);
  s = s.replace(/\^(\w)/g, (_, x) => toScript(x, SUP) ?? `^${x}`);
  s = s.replace(/_\{([^{}]*)\}/g, (_, x) => toScript(x, SUB) ?? `_(${x})`);
  s = s.replace(/_(\w)/g, (_, x) => toScript(x, SUB) ?? `_${x}`);

  // \left( \right) sizing wrappers are noise in plain text
  s = s.replace(/\\left\s*/g, '').replace(/\\right\s*/g, '');

  // Remaining commands -> symbol or bare name
  s = s.replace(/\\([a-zA-Z]+)/g, (_, name) => SYMBOLS[name] ?? name);

  // Leftover grouping braces
  s = s.replace(/[{}]/g, '');
  return s;
}
