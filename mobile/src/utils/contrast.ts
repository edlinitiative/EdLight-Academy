/**
 * Contrast maths, so branded surfaces are legible by construction.
 *
 * The aurora grounds are derived from a course's own colour, and that colour
 * comes from Firestore — content data, not a vetted design token. A bright
 * subject colour produced a hero with white text at 2.2:1. Rather than assume
 * the palette stays dark, these helpers *drive* a colour to a target ratio.
 *
 * WCAG 2.1 relative luminance and contrast ratio.
 */

export function hexToRgb(hex: string): [number, number, number] {
  let h = String(hex || '').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return [0, 0, 0];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Linear blend; t=0 → a, t=1 → b. */
export function mixHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const k = Math.max(0, Math.min(1, t));
  return rgbToHex(r1 + (r2 - r1) * k, g1 + (g2 - g1) * k, b1 + (b2 - b1) * k);
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Composite `fg` at `alpha` over an opaque `bg` — what translucent text really is. */
export function compositeOver(fg: string, bg: string, alpha: number): string {
  const F = hexToRgb(fg);
  const B = hexToRgb(bg);
  const a = Math.max(0, Math.min(1, alpha));
  return rgbToHex(
    F[0] * a + B[0] * (1 - a),
    F[1] * a + B[1] * (1 - a),
    F[2] * a + B[2] * (1 - a),
  );
}

/**
 * Push `color` toward `toward` until white text on it clears `min`.
 *
 * Steps in small increments and stops at `toward` — so the worst case is the
 * anchor colour itself rather than an infinite loop or a washed-out result.
 */
export function darkenUntilReadable(color: string, toward: string, min = 4.5, step = 0.04): string {
  let out = color;
  for (let t = 0; t <= 1.0001 && contrastRatio('#ffffff', out) < min; t += step) {
    out = mixHex(color, toward, t);
  }
  return out;
}

/**
 * Lighten `color` toward white until it clears `min` against `bg` — used for the
 * accent labels that sit on a tinted ground.
 *
 * Only meaningful on a DARK `bg`: lightening toward white on a light ground
 * reduces contrast, and the loop then terminates at white having achieved
 * nothing. Callers on light grounds want a darkening pass instead.
 */
export function lightenUntilReadable(color: string, bg: string, min = 4.5, step = 0.04): string {
  let out = color;
  for (let t = 0; t <= 1.0001 && contrastRatio(out, bg) < min; t += step) {
    out = mixHex(color, '#ffffff', t);
  }
  return out;
}
