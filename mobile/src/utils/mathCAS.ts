/**
 * mathCAS.js — Lightweight CAS for EdLight Academy exam grading.
 *
 * Converts LaTeX math expressions to evaluable JavaScript, then numerically
 * compares results to check equivalence.  This lets the grading engine accept
 * answers like "√2/2" when the expected answer is "1/√2".
 *
 * NOT a full symbolic CAS — it evaluates both sides to a float and compares
 * within a tolerance.  This covers ~95 % of exam answers (numeric results,
 * simplified radicals, fractions, trig values, etc.).
 */

// ─── LaTeX → computable JS expression ───────────────────────────────────────

/**
 * Convert a LaTeX math string to a JavaScript expression that uses `Math.*`.
 *
 * Examples:
 *   "\\frac{17\\sqrt{14}}{7}"  →  "((17*Math.sqrt(14))/(7))"
 *   "2^{10}"                   →  "Math.pow(2,10)"
 *   "\\sqrt[3]{8}"             →  "Math.pow(8,1/(3))"
 *   "3\\pi"                    →  "3*Math.PI"
 */
export function latexToJs(raw) {
  if (!raw || typeof raw !== 'string') return null;

  let s = raw.trim();

  // Strip display-math delimiters ($, $$)
  s = s.replace(/^\$\$?|\$\$?$/g, '').trim();

  // Remove \left, \right, \big etc. — just keep the bracket
  s = s.replace(/\\(?:left|right|big|Big|bigg|Bigg)\s*/g, '');

  // ── Multi-pass replacements ──────────────────────────────────────────────
  //
  // ORDER MATTERS: process inner constructs (\sqrt, ^{}) BEFORE \frac so
  // that by the time the \frac regex runs, the nested braces from \sqrt{14}
  // and 2^{10} are already consumed and the \frac {…}{…} groups have no
  // inner braces left.  (The regex uses [^{}]* which requires flat content.)
  //

  // \text{...} → strip (sometimes wraps units like "cm")
  s = s.replace(/\\text\{([^}]*)\}/g, '($1)');

  // ① Inner constructs first ─────────────────────────────────────────────

  // \sqrt[n]{x} → Math.pow(x, 1/(n))  — nth root, BEFORE \sqrt{x}
  for (let i = 0; i < 10; i++) {
    const before = s;
    s = s.replace(/\\sqrt\s*\[([^\]]+)\]\s*\{([^{}]*)\}/g, 'Math.pow($2,1/($1))');
    if (s === before) break;
  }

  // \sqrt{x} → Math.sqrt(x)
  for (let i = 0; i < 10; i++) {
    const before = s;
    s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, 'Math.sqrt($1)');
    if (s === before) break;
  }

  // x^{n} → Math.pow(x, n)  — braced exponent
  for (let i = 0; i < 10; i++) {
    const before = s;
    s = s.replace(/([0-9a-zA-Z.)]+)\s*\^\s*\{([^{}]*)\}/g, 'Math.pow($1,$2)');
    if (s === before) break;
  }

  // x^n  (single char/digit exponent, no braces)
  s = s.replace(/([0-9a-zA-Z.)]+)\s*\^\s*([0-9a-zA-Z])/g, 'Math.pow($1,$2)');

  // ② \frac AFTER inner braces are gone ──────────────────────────────────

  // \frac{a}{b} → ((a)/(b))  — multi-pass for nested fracs
  for (let i = 0; i < 10; i++) {
    const before = s;
    s = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '(($1)/($2))');
    if (s === before) break;
  }

  // Named constants
  s = s.replace(/\\pi\b/g, 'Math.PI');

  // Trig / log functions
  const fns = ['sin', 'cos', 'tan', 'ln', 'log', 'exp', 'abs'];
  for (const fn of fns) {
    const jsFn = fn === 'ln' ? 'Math.log' : fn === 'abs' ? 'Math.abs' : `Math.${fn}`;
    s = s.replace(new RegExp(`\\\\${fn}\\s*\\{([^{}]*)\\}`, 'g'), `${jsFn}($1)`);
    s = s.replace(new RegExp(`\\\\${fn}\\s*\\(([^)]*)\\)`, 'g'), `${jsFn}($1)`);
    s = s.replace(new RegExp(`\\\\${fn}\\s+([0-9a-zA-Z.]+)`, 'g'), `${jsFn}($1)`);
  }

  // Operators
  s = s.replace(/\\times/g, '*');
  s = s.replace(/\\cdot/g, '*');
  s = s.replace(/\\div/g, '/');
  s = s.replace(/\\pm/g, '+');          // treat ± as + for evaluation

  // Remove remaining backslash commands we don't handle (\mathbb, \in, …)
  s = s.replace(/\\[a-zA-Z]+/g, '');

  // Curly braces → parens
  s = s.replace(/\{/g, '(');
  s = s.replace(/\}/g, ')');

  // ── Implicit multiplication ─────────────────────────────────────────────
  s = s.replace(/([0-9])(\()/g, '$1*$2');          // 3( → 3*(
  s = s.replace(/(\))(\()/g, '$1*$2');              // )( → )*(
  s = s.replace(/(\))(Math\.)/g, '$1*$2');          // )Math. → )*Math.
  s = s.replace(/(\))([0-9a-zA-Z])/g, '$1*$2');    // )x → )*x
  s = s.replace(/([0-9])(Math\.)/g, '$1*$2');       // 3Math. → 3*Math.
  s = s.replace(/([0-9])([a-zA-Z])/g, '$1*$2');     // 3x → 3*x

  // Clean up
  s = s.replace(/\s+/g, '');
  s = s.replace(/\+\-/g, '-');
  s = s.replace(/\-\+/g, '-');

  return s || null;
}

// ─── Safe numeric evaluator ─────────────────────────────────────────────────

/**
 * Safely evaluate a JS math expression string to a number.
 * Returns NaN on failure.
 */
export function safeEvaluate(expr) {
  if (!expr || typeof expr !== 'string') return NaN;

  // Whitelist: only allow digits, operators, parens, dots, commas, and Math.*
  const sanitized = expr.replace(/Math\.\w+/g, '');
  if (/[^0-9+\-*/().,%e ]/.test(sanitized)) return NaN;

  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('Math', `"use strict"; return (${expr});`);
    const result = fn(Math);
    return typeof result === 'number' ? result : NaN;
  } catch {
    return NaN;
  }
}

// ─── Evaluate any expression (LaTeX or plain) ──────────────────────────────

/**
 * Evaluate an expression that might be plain text, a number, or LaTeX.
 * Tries: 1) direct parseFloat  2) LaTeX→JS→eval  3) plain expression eval
 */
export function evaluateExpression(raw) {
  if (raw == null) return NaN;
  const s = String(raw).trim();
  if (!s) return NaN;

  // 1.  Simple number (possibly with comma as decimal separator)
  const plain = parseFloat(s.replace(/,/g, '.'));
  if (!isNaN(plain) && /^[0-9,.\-+]+$/.test(s)) return plain;

  // 2.  LaTeX → JS → eval
  const js = latexToJs(s);
  if (js) {
    const val = safeEvaluate(js);
    if (!isNaN(val)) return val;
  }

  // 3.  Try evaluating as-is (e.g. "17*sqrt(14)/7")
  const asIs = s
    .replace(/sqrt/gi, 'Math.sqrt')
    .replace(/pi/gi, 'Math.PI')
    .replace(/\^/g, '**');
  const val2 = safeEvaluate(asIs);
  if (!isNaN(val2)) return val2;

  return NaN;
}

// ─── Expression equivalence ────────────────────────────────────────────────

/**
 * Check whether two math expressions are numerically equivalent.
 *
 * @param {string} a - First expression (LaTeX or plain number)
 * @param {string} b - Second expression (LaTeX or plain number)
 * @param {number} [tolerance=0.001] - Absolute tolerance
 * @returns {{ equivalent: boolean, valueA: number|null, valueB: number|null }}
 */
export function areExpressionsEquivalent(a, b, tolerance = 0.001) {
  const result = { equivalent: false, valueA: null, valueB: null };

  const valA = evaluateExpression(a);
  const valB = evaluateExpression(b);

  result.valueA = isNaN(valA) ? null : valA;
  result.valueB = isNaN(valB) ? null : valB;

  if (result.valueA !== null && result.valueB !== null) {
    if (Math.abs(valA) < tolerance && Math.abs(valB) < tolerance) {
      result.equivalent = true;
    } else if (Math.abs(valA) > 1) {
      // Relative comparison for larger numbers
      result.equivalent = Math.abs(valA - valB) / Math.abs(valA) < tolerance;
    } else {
      result.equivalent = Math.abs(valA - valB) < tolerance;
    }
  }

  return result;
}

// ─── Normalize answer text ─────────────────────────────────────────────────

/**
 * Normalize an answer string for comparison: strip $ delimiters, trim,
 * normalize whitespace, replace comma decimals with dots.
 */
export function normalizeAnswer(text) {
  if (!text) return '';
  return String(text)
    .replace(/^\$\$?|\$\$?$/g, '')   // strip $ / $$
    .replace(/\\,/g, '')             // LaTeX thin spaces
    .replace(/\s+/g, ' ')
    .replace(/,/g, '.')              // comma → dot for decimals
    .trim()
    .toLowerCase();
}

// ─── Public API for grading ────────────────────────────────────────────────

/**
 * Enhanced answer checking: tries text matching first, then CAS equivalence.
 * Returns { correct: boolean, method: string, details: object }
 */
export function checkWithCAS(userAnswer, correctAnswer) {
  const user = normalizeAnswer(userAnswer);
  const correct = normalizeAnswer(correctAnswer);

  if (!user || !correct) return { correct: false, method: 'empty', details: {} };

  // 1.  Exact text match
  if (user === correct) return { correct: true, method: 'exact', details: {} };

  // 2.  Accent-normalized text match
  const norm = (s) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
  if (norm(user) === norm(correct))
    return { correct: true, method: 'normalized', details: {} };

  // 3.  CAS numeric equivalence
  const cas = areExpressionsEquivalent(userAnswer, correctAnswer);
  if (cas.equivalent) {
    return { correct: true, method: 'cas', details: cas };
  }

  // 4.  Not equivalent
  return { correct: false, method: 'cas', details: cas };
}
