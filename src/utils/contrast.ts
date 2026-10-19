/**
 * WCAG 2.x contrast helpers, dependency-free.
 *
 * Used by the token contrast tests (src/__tests__/tokenContrast.test.ts) to
 * prove every text-on-ground pairing in the design tokens clears AA in both
 * themes. Understands the colour syntaxes our tokens actually use: #rgb,
 * #rrggbb, rgb()/rgba() with 0–255 channels, and `color-mix(in srgb, A p%, B)`
 * (including `transparent`), which the pf-* tones are built from.
 *
 * Two traps this exists to avoid (see pf.css): color-mix results must be
 * computed in sRGB 0–1 space and then scaled, and translucent fills must be
 * COMPOSITED over the ground they sit on before measuring.
 */

export type RGBA = { r: number; g: number; b: number; a: number };

const clamp = (n: number, lo = 0, hi = 255) => Math.min(hi, Math.max(lo, n));

/** Parse one colour (no var()) into 0–255 channels + 0–1 alpha. */
export function parseColor(input: string): RGBA {
  const s = input.trim().toLowerCase();
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (s === 'white') return { r: 255, g: 255, b: 255, a: 1 };
  if (s === 'black') return { r: 0, g: 0, b: 0, a: 1 };
  if (s.startsWith('#')) {
    let hex = s.slice(1);
    if (hex.length === 3 || hex.length === 4) hex = hex.split('').map((c) => c + c).join('');
    const n = parseInt(hex.slice(0, 6), 16);
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
  }
  const rgb = s.match(/^rgba?\(([^)]+)\)$/);
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean).map((p) => p.trim());
    const ch = (p: string) => (p.endsWith('%') ? (parseFloat(p) / 100) * 255 : parseFloat(p));
    const a = parts[3] == null ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    return { r: ch(parts[0]), g: ch(parts[1]), b: ch(parts[2]), a };
  }
  const mix = s.match(/^color-mix\(\s*in\s+srgb\s*,(.*)\)$/);
  if (mix) {
    const [first, second] = splitTopLevel(mix[1]);
    const pa = splitPercent(first);
    const pb = splitPercent(second);
    // Missing percentages: the other one's complement, else 50/50.
    let wa = pa.pct ?? (pb.pct != null ? 100 - pb.pct : 50);
    let wb = pb.pct ?? 100 - wa;
    const total = wa + wb;
    wa /= total; wb /= total;
    const A = parseColor(pa.color);
    const B = parseColor(pb.color);
    // CSS Color 5: premultiplied interpolation in sRGB.
    const a = A.a * wa + B.a * wb;
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    const pm = (ca: number, cb: number) => (ca * A.a * wa + cb * B.a * wb) / a;
    return { r: pm(A.r, B.r), g: pm(A.g, B.g), b: pm(A.b, B.b), a };
  }
  throw new Error(`Unsupported colour: ${input}`);
}

function splitTopLevel(s: string): [string, string] {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth--;
    else if (s[i] === ',' && depth === 0) return [s.slice(0, i), s.slice(i + 1)];
  }
  throw new Error(`color-mix needs two colours: ${s}`);
}

function splitPercent(part: string): { color: string; pct?: number } {
  const m = part.trim().match(/^(.*?)\s+(\d+(?:\.\d+)?)%$/);
  return m ? { color: m[1], pct: parseFloat(m[2]) } : { color: part.trim() };
}

/** Composite a (possibly translucent) colour over an opaque ground. */
export function composite(top: RGBA, ground: RGBA): RGBA {
  const a = top.a;
  return {
    r: clamp(top.r * a + ground.r * (1 - a)),
    g: clamp(top.g * a + ground.g * (1 - a)),
    b: clamp(top.b * a + ground.b * (1 - a)),
    a: 1,
  };
}

/** WCAG relative luminance of an opaque colour. */
export function luminance({ r, g, b }: RGBA): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Contrast ratio of `fg` over `bg`. Translucent colours are composited:
 * `bg` over `ground` (default white) first, then `fg` over the result.
 */
export function contrastRatio(fg: string | RGBA, bg: string | RGBA, ground: string | RGBA = '#ffffff'): number {
  const toRGBA = (c: string | RGBA) => (typeof c === 'string' ? parseColor(c) : c);
  const g = composite(toRGBA(ground), { r: 255, g: 255, b: 255, a: 1 });
  const back = composite(toRGBA(bg), g);
  const front = composite(toRGBA(fg), back);
  const [hi, lo] = [luminance(front), luminance(back)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG thresholds. */
export const AA_TEXT = 4.5;
export const AA_LARGE_TEXT = 3;
export const AA_NON_TEXT = 3;
