/**
 * Crest colour system — pure, framework-free, unit-tested.
 *
 * Every school gets one curated pair: an enamel FIELD colour and a CHARGE
 * colour (the symbol, the ribbon). Each pair is chosen so the charge reads on
 * the field AND on the field's second tincture (the "tone" used by field
 * divisions) at ≥ 3:1 (WCAG non-text contrast). The metal of the rim — gold
 * or silver — is chosen per pair for harmony, never for meaning.
 *
 * Coral is deliberately absent: in the Arène coral means "primary action".
 */

export interface CrestPalette {
  id: string;
  /** Enamel field. */
  field: string;
  /** Second field tincture, for divisions (per pale, chevron…). */
  tone: string;
  /** The charge (symbol) and ribbon. */
  charge: string;
  /** Rim metal. */
  metal: 'gold' | 'silver';
}

export const CREST_PALETTES: CrestPalette[] = [
  { id: 'azur-or', field: '#1D4F9E', tone: '#163C78', charge: '#F4C95D', metal: 'gold' },
  { id: 'cramoisi-creme', field: '#A1222C', tone: '#7E1A22', charge: '#F7ECD6', metal: 'gold' },
  { id: 'foret-or', field: '#1E6A47', tone: '#164F35', charge: '#F3D27C', metal: 'gold' },
  { id: 'violet-ivoire', field: '#4A2D82', tone: '#382163', charge: '#F2E6C6', metal: 'gold' },
  { id: 'lagon-sable', field: '#0E6670', tone: '#0A4C54', charge: '#FFE2A6', metal: 'silver' },
  { id: 'bordeaux-peche', field: '#6C1E2E', tone: '#521622', charge: '#F2CDA6', metal: 'gold' },
  { id: 'ocre-nuit', field: '#C89A3A', tone: '#DDB760', charge: '#14284A', metal: 'silver' },
  { id: 'ciel-marine', field: '#64A9DC', tone: '#8CC1E8', charge: '#0F2547', metal: 'silver' },
  { id: 'ivoire-grenat', field: '#EFE3C6', tone: '#E0CFA5', charge: '#8C1C26', metal: 'gold' },
  { id: 'emeraude-blanc', field: '#13845A', tone: '#0E6646', charge: '#F7F4EA', metal: 'silver' },
  { id: 'ardoise-or', field: '#24313F', tone: '#33465A', charge: '#E9C35C', metal: 'gold' },
  { id: 'cobalt-blanc', field: '#2650B8', tone: '#1D3E90', charge: '#F5F8FF', metal: 'silver' },
  { id: 'terre-creme', field: '#9A4317', tone: '#7A3411', charge: '#FFF0D9', metal: 'gold' },
  { id: 'olive-ivoire', field: '#4F5E1F', tone: '#3C4818', charge: '#F4EBC9', metal: 'gold' },
];

/** Rim metal gradients [light, mid, deep]. */
export const METALS: Record<CrestPalette['metal'], [string, string, string]> = {
  gold: ['#FBE6A2', '#D9A63E', '#9C6A1C'],
  silver: ['#F4F7FA', '#B7C2CF', '#7D8A99'],
};

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance of a #RRGGBB colour. */
export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two #RRGGBB colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** FNV-1a, 32-bit. Stable across platforms and runtimes. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — a tiny deterministic PRNG, so each trait gets its own draw. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
