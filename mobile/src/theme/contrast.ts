/**
 * WCAG 2.x contrast helpers. Used by the token contrast test and handy when a
 * screen has to choose between two inks at runtime (e.g. text on a course tint).
 *
 * Only opaque #rgb / #rrggbb colours are accepted: a translucent token has no
 * single contrast ratio until it is composited over its ground, which is why
 * every palette token is opaque.
 */

export function parseHex(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Not an opaque hex colour: ${hex}`);
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** Relative luminance (WCAG 2.x definition), 0 = black, 1 = white. */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two opaque colours, 1–21. Order does not matter. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** AA thresholds: 4.5 body text, 3 large text (≥18.66px bold / 24px) and UI parts. */
export const AA = { text: 4.5, large: 3, ui: 3 } as const;

/** Whichever of two inks reads better on `ground` (e.g. white vs ink on a tint). */
export function readableOn(ground: string, light = '#ffffff', dark = '#0F1E38'): string {
  return contrastRatio(ground, light) >= contrastRatio(ground, dark) ? light : dark;
}
