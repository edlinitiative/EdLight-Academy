import { useEffect, useState } from 'react';

// ─── KaTeX Lazy Loading ──────────────────────────────────────────────────────
const KATEX_CSS = 'https://unpkg.com/katex@0.16.9/dist/katex.min.css';
const KATEX_JS = 'https://unpkg.com/katex@0.16.9/dist/katex.min.js';

export function loadCssOnce(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

export function loadScriptOnce(src, onload) {
  if (document.querySelector(`script[src="${src}"]`)) {
    if (onload) onload();
    return;
  }
  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  script.onload = onload || null;
  document.body.appendChild(script);
}

/** React hook — returns true once window.katex is available */
export function useKatex() {
  const [ready, setReady] = useState(typeof window !== 'undefined' && !!window.katex);
  useEffect(() => {
    if (ready) return;
    loadCssOnce(KATEX_CSS);
    loadScriptOnce(KATEX_JS, () => setReady(true));
  }, [ready]);
  return ready;
}

/**
 * Render text containing LaTeX math to an HTML string for dangerouslySetInnerHTML.
 * Supports inline $...$, \(...\), and display $$...$$ delimiters.
 */
export function renderWithKatex(text, katexReady) {
  if (!text) return { __html: '' };
  let html = String(text);
  if (katexReady && typeof window !== 'undefined' && window.katex) {
    // Display math first: $$...$$
    html = html.replace(/\$\$([\s\S]+?)\$\$/g, (_, expr) => {
      try { return window.katex.renderToString(expr, { displayMode: true, throwOnError: false }); } catch { return _; }
    });
    // Inline math: \(...\)
    html = html.replace(/\\\((.+?)\\\)/g, (_, expr) => {
      try { return window.katex.renderToString(expr, { throwOnError: false }); } catch { return _; }
    });
    // Inline math: $...$  (single dollar, not escaped \$, not $$)
    html = html.replace(/(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g, (_, expr) => {
      try { return window.katex.renderToString(expr, { throwOnError: false }); } catch { return _; }
    });
  } else {
    html = html
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br/>');
  }
  return { __html: html };
}

// ─── Subject colours / icons ─────────────────────────────────────────────────
export const SUBJECT_COLORS = {
  CHEM: '#10B981',
  PHYS: '#3B82F6',
  MATH: '#8B5CF6',
  ECON: '#F59E0B',
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
