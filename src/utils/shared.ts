import katex from 'katex';
import 'katex/dist/katex.min.css';

/** React hook — returns true once KaTeX is available. Always true since KaTeX is bundled. */
export function useKatex(): boolean {
  return true;
}

/**
 * Render text containing LaTeX math to an HTML string for dangerouslySetInnerHTML.
 * Supports inline $...$, \(...\), and display $$...$$ delimiters.
 * Outputs both HTML and MathML for screen reader accessibility.
 */
export function renderWithKatex(text: string, katexReady: boolean) {
  if (!text) return { __html: '' };
  if (!katexReady) {
    return {
      __html: String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br/>'),
    };
  }
  const opts = { throwOnError: false, output: 'htmlAndMathml' as const };
  const optsDisplay = { ...opts, displayMode: true };
  let html = String(text);
  // Display math: $$...$$
  html = html.replace(/\$\$([\s\S]+?)\$\$/g, (_, expr) => {
    try { return katex.renderToString(expr, optsDisplay); } catch { return _; }
  });
  // Inline math: \(...\)
  html = html.replace(/\\\((.+?)\\\)/g, (_, expr) => {
    try { return katex.renderToString(expr, opts); } catch { return _; }
  });
  // Inline math: $...$ (single dollar, not escaped \$, not $$)
  html = html.replace(/(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g, (_, expr) => {
    try { return katex.renderToString(expr, opts); } catch { return _; }
  });
  return { __html: html };
}

// ─── Subject colours / icons ─────────────────────────────────────────────────
export const SUBJECT_COLORS = {
  CHEM: '#0A66C2',
  PHYS: '#0857A6',
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
