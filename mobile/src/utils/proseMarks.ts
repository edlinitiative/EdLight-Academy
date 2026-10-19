/**
 * The two markdown marks exam content ships in plain prose: `**bold**` around
 * the scaffold's blank markers ("appelée **①**") and `* ` list bullets at the
 * start of a line. MathText is not a markdown renderer, so both used to reach
 * the screen as literal asterisks (TestFlight, Oct 2026: "format is weird").
 *
 * Deliberately narrow: only a line-leading "* " and a same-line `**…**` pair,
 * so math such as `a*b` or `2**3` is never touched.
 */

export interface ProseSegment {
  text: string;
  bold: boolean;
}

const BULLET_RE = /^([ \t]*)\*[ \t]+/gm;
const BOLD_RE = /\*\*([^*\n]+?)\*\*/g;

/** Line-leading "* " → "• ". */
export function bulletize(text: string): string {
  return text.replace(BULLET_RE, '$1• ');
}

/** Bullets converted and `**…**` dropped to its content (for the KaTeX path). */
export function stripProseMarks(text: string): string {
  return bulletize(text).replace(BOLD_RE, '$1');
}

/** Bullets converted, then split into plain/bold runs for nested <Text>. */
export function proseSegments(text: string): ProseSegment[] {
  const src = bulletize(text);
  const out: ProseSegment[] = [];
  let last = 0;
  for (const m of src.matchAll(BOLD_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: src.slice(last, at), bold: false });
    out.push({ text: m[1], bold: true });
    last = at + m[0].length;
  }
  if (last < src.length) out.push({ text: src.slice(last), bold: false });
  return out;
}
