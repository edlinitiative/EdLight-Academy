import katex from 'katex';
import 'katex/dist/katex.min.css';

/** React hook — returns true once KaTeX is available. Always true since KaTeX is bundled. */
export function useKatex(): boolean {
  return true;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Render text containing LaTeX math to an HTML string for dangerouslySetInnerHTML.
 * Supports inline $...$, \(...\), and display $$...$$ delimiters.
 * Outputs both HTML and MathML for screen reader accessibility.
 *
 * SECURITY: only KaTeX-generated markup (from trusted rendering) is emitted as
 * HTML; every non-math segment is HTML-escaped. Previously the text outside
 * math delimiters was inserted raw, so any `<img onerror=…>` in the (admin-
 * authored) content executed — a stored-XSS sink once an attacker could write
 * content. Escaping the plain-text runs closes that.
 */
export function renderWithKatex(text: string, _katexReady?: boolean) {
  if (!text) return { __html: '' };
  const src = String(text);
  // A single regex matching any supported math span; alternatives capture the
  // expression: $$display$$ (g1), \(inline\) (g2), $inline$ (g3).
  const mathRe = /\$\$([\s\S]+?)\$\$|\\\((.+?)\\\)|(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g;
  const opts = { throwOnError: false, output: 'htmlAndMathml' as const };

  let out = '';
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = mathRe.exec(src)) !== null) {
    out += escapeHtml(src.slice(last, m.index));          // plain text before math → escaped
    const display = m[1] !== undefined;
    const expr = m[1] ?? m[2] ?? m[3] ?? '';
    try {
      out += katex.renderToString(expr, display ? { ...opts, displayMode: true } : opts);
    } catch {
      out += escapeHtml(m[0]);                            // bad LaTeX → show literally, escaped
    }
    last = mathRe.lastIndex;
  }
  out += escapeHtml(src.slice(last));                     // trailing plain text → escaped
  return { __html: out };
}

// ─── Subject colours / icons ─────────────────────────────────────────────────
export const SUBJECT_COLORS = {
  CHEM: '#1B6FE0',
  PHYS: '#1558B8',
  MATH: '#4A93DD',
  ECON: '#5D5B54',
};

export const SUBJECT_LABELS = {
  CHEM: 'Chemistry',
  PHYS: 'Physics',
  MATH: 'Mathematics',
  ECON: 'Economics',
};

// ─── Formatting helpers ──────────────────────────────────────────────────────
/** Convert minutes to "X h Y min" human-readable string */
export function formatDuration(minutes) {
  if (!minutes) return '';
  const mins = parseInt(minutes, 10);
  if (isNaN(mins)) return '';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

/** Extract first name from a user object */
export function getFirstName(user) {
  if (!user) return '';
  return (
    (user.firstName && String(user.firstName).trim()) ||
    (user.name && String(user.name).trim().split(/\s+/)[0]) ||
    (user.email && String(user.email).split('@')[0]) ||
    ''
  );
}

// ─── Fisher-Yates shuffle ────────────────────────────────────────────────────
/** Return a new shuffled copy of the array (does NOT mutate the original) */
export function shuffleArray(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
