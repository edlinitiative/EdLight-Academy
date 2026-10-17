/**
 * Pure, deterministic trait picker for Arène avatars.
 *
 * The same seed (a user id, a nickname…) always yields the same student, on
 * every device and every render. No randomness at render time.
 */

export type AvatarMood = 'idle' | 'ready' | 'focused' | 'celebrating' | 'recovering';
export const AVATAR_MOODS: AvatarMood[] = ['idle', 'ready', 'focused', 'celebrating', 'recovering'];

export type HairStyle =
  | 'fade' | 'afro' | 'cornrows' | 'puffs' | 'locs' | 'crop' | 'braids' | 'headwrap';
export const HAIR_STYLES: HairStyle[] = ['fade', 'afro', 'cornrows', 'puffs', 'locs', 'crop', 'braids', 'headwrap'];

export type UniformStyle = 'collar' | 'epaulettes' | 'piping';
export const UNIFORM_STYLES: UniformStyle[] = ['collar', 'epaulettes', 'piping'];

export type GlassesStyle = 'none' | 'round' | 'square';

/** [base, shade] — predominantly deep and medium browns. */
export const SKIN_TONES: Array<[string, string]> = [
  ['#4A2C21', '#3A2119'],
  ['#5A3526', '#47291D'],
  ['#6A3F2B', '#553222'],
  ['#7B4A31', '#633B27'],
  ['#89553A', '#6F432D'],
  ['#966041', '#7A4C33'],
  ['#A46C47', '#865739'],
  ['#B27B52', '#926242'],
];

/** [base, highlight] */
export const HAIR_COLORS: Array<[string, string]> = [
  ['#17100D', '#3A2A22'],
  ['#1F1612', '#45332A'],
  ['#2A1D17', '#4F3A2E'],
  ['#3A271C', '#5E4333'],
];

/** Headwrap fabrics [base, band] — madras-inspired warm tones. */
export const WRAP_FABRICS: Array<[string, string]> = [
  ['#C8402F', '#F2B636'],
  ['#E8A21F', '#B4321F'],
  ['#2E7D5B', '#F2C94C'],
  ['#6B3FA0', '#F29E4C'],
];

/** Default school uniform pairs when none are passed: [shirt, trim]. */
export const SCHOOL_COLORS: Array<{ primary: string; secondary: string }> = [
  { primary: '#1F4E9C', secondary: '#F2C230' },
  { primary: '#8EB6E6', secondary: '#16305C' },
  { primary: '#7A1F2B', secondary: '#F3E9D6' },
  { primary: '#0F6B4F', secondary: '#F5EFE0' },
  { primary: '#C9A66B', secondary: '#5B2A1A' },
  { primary: '#F1F3F7', secondary: '#1B3E8A' },
  { primary: '#E0C14A', secondary: '#20305E' },
  { primary: '#2E2E6E', secondary: '#E85D4A' },
];

export interface AvatarTraits {
  skin: number;
  hair: HairStyle;
  hairColor: number;
  wrap: number;
  glasses: GlassesStyle;
  uniform: UniformStyle;
  colors: { primary: string; secondary: string };
  /** Small expression nuances, all in viewBox units. */
  eyeSize: number;   // 0.92 … 1.08
  eyeGap: number;    // -1 … 1
  browWeight: number; // 1.7 … 2.3
  smile: number;     // 0 … 1 (wider / warmer resting smile)
  earrings: boolean;
  /** Seconds — desynchronises blinking in lists. */
  blinkDelay: number;
}

export type AvatarTraitOverrides = Partial<AvatarTraits>;

/** FNV-1a 32-bit hash. */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — tiny, good-enough deterministic PRNG. */
function rng(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Relative frequency of each hair style (headwrap is an occasional accent). */
export const HAIR_WEIGHTS: Record<HairStyle, number> = {
  fade: 16, afro: 14, cornrows: 12, puffs: 13, locs: 9, crop: 16, braids: 14, headwrap: 6,
};

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export function avatarTraits(seed: string, overrides: AvatarTraitOverrides = {}): AvatarTraits {
  // murmur3 finaliser so near-identical seeds ('u-1', 'u-2') diverge fully.
  let h = hashSeed(String(seed ?? ''));
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  const r = rng(h >>> 0);
  r();
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)];
  const weighted = (): HairStyle => {
    const total = HAIR_STYLES.reduce((n, k) => n + HAIR_WEIGHTS[k], 0);
    let x = r() * total;
    for (const k of HAIR_STYLES) { x -= HAIR_WEIGHTS[k]; if (x < 0) return k; }
    return 'crop';
  };
  const g = r();
  const base: AvatarTraits = {
    skin: Math.floor(r() * SKIN_TONES.length),
    hair: weighted(),
    hairColor: Math.floor(r() * HAIR_COLORS.length),
    wrap: Math.floor(r() * WRAP_FABRICS.length),
    glasses: g < 0.14 ? 'round' : g < 0.24 ? 'square' : 'none',
    uniform: pick(UNIFORM_STYLES),
    colors: pick(SCHOOL_COLORS),
    eyeSize: round(0.92 + r() * 0.16),
    eyeGap: round(r() * 2 - 1),
    browWeight: round(1.7 + r() * 0.6),
    smile: round(r()),
    earrings: r() < 0.3,
    blinkDelay: round(r() * 4, 1),
  };
  return { ...base, ...overrides };
}
