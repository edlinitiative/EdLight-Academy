/**
 * Whether a stored exam answer actually holds an answer — the phone twin of
 * the web's `isAnswerFilled` (src/pages/ExamTake.tsx), extended to the shapes
 * the phone stores.
 *
 * The rail and the counts used to treat any non-empty string as answered, so
 * a scaffold whose steps were all cleared (`{"scaffold":["",""]}`), an empty
 * proof, or a multi-blank sentence with nothing typed ("|") showed as done.
 */
export function isAnswerFilled(v: unknown): boolean {
  if (v == null) return false;
  if (Array.isArray(v)) return v.some((x) => isAnswerFilled(x));
  if (typeof v !== 'string') return true;
  const s = v.trim();
  if (!s) return false;
  if (s.startsWith('{') || s.startsWith('[')) {
    try {
      const parsed: any = JSON.parse(s);
      if (parsed && Array.isArray(parsed.scaffold)) return parsed.scaffold.some((x: unknown) => String(x ?? '').trim());
      if (parsed && Array.isArray(parsed.steps)) {
        return parsed.steps.some((x: any) => String(x?.math ?? '').trim()) || !!String(parsed.finalAnswer ?? '').trim();
      }
      if (Array.isArray(parsed)) return parsed.some((x: any) => String(x?.math ?? x ?? '').trim());
    } catch { /* not JSON: a plain answer that starts with a bracket */ }
    return true;
  }
  // Multi-blank answers are pipe-joined; "|" or " | " alone means nothing typed.
  if (s.includes('|')) return s.split('|').some((p) => p.trim());
  return true;
}
