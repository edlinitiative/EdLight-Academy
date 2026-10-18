/**
 * The student-chosen avatar — the model behind the avatar editor.
 *
 * Framework-free (no React, no DOM, no Firebase) so the web app, the Expo app
 * AND the Vercel api/ layer can all import it. This file is DUPLICATED
 * byte-for-byte at mobile/src/components/arena/art/avatars/avatarConfig.ts;
 * a jest test on each side fails if the two copies drift.
 *
 * Rules:
 *   • Anyone who never customised keeps their seeded face: `defaultConfigFor`
 *     maps the seeded traits (traits.ts) onto this model.
 *   • `presentation` is CHOSEN by the student, never inferred from a name. It
 *     only reorders suggestions and nudges the shoulder line; every hairstyle
 *     and uniform stays available to everyone.
 *   • Untrusted input (Firestore docs, request bodies) goes through
 *     `sanitizeConfig`, which whitelists every field.
 *   • The wire / storage form is `serializeConfig` — "1" + 16 base-36 digits
 *     (17 chars). Option lists below are APPEND-ONLY: their index is the
 *     stored digit, so reordering one would silently change saved avatars.
 *     Display order is separate (see suggested*).
 */
import { avatarTraits, type AvatarTraitOverrides } from './traits';

export type Presentation = 'fille' | 'garçon' | 'neutre';
export const PRESENTATIONS: Presentation[] = ['fille', 'garçon', 'neutre'];

/** [base, shade]. Deep and brown tones first (indices 2–9 are the seeded set), then lighter. */
export const AVATAR_SKIN_TONES: Array<[string, string]> = [
  ['#2E1A13', '#22130D'],
  ['#3C2219', '#2E1912'],
  ['#4A2C21', '#3A2119'],
  ['#5A3526', '#47291D'],
  ['#6A3F2B', '#553222'],
  ['#7B4A31', '#633B27'],
  ['#89553A', '#6F432D'],
  ['#966041', '#7A4C33'],
  ['#A46C47', '#865739'],
  ['#B27B52', '#926242'],
  ['#C08A5E', '#A0704A'],
  ['#D3A27A', '#B5845E'],
  ['#E4BC98', '#C89C78'],
  ['#F1D3B8', '#D8B496'],
];
/** Seeded skin index i (traits.ts, 0–7) lives at AVATAR_SKIN_TONES[i + SEEDED_SKIN_OFFSET]. */
export const SEEDED_SKIN_OFFSET = 2;

export type AvatarHair =
  | 'fade' | 'crop' | 'afro' | 'puffs' | 'cornrows' | 'locs' | 'braids'
  | 'twists' | 'bun' | 'ponytail' | 'shaved' | 'bantu' | 'longbraids';
export const AVATAR_HAIRS: AvatarHair[] = [
  'fade', 'crop', 'afro', 'puffs', 'cornrows', 'locs', 'braids',
  'twists', 'bun', 'ponytail', 'shaved', 'bantu', 'longbraids',
];
/** Styles long enough to show below a moushwa. */
export const LONG_HAIRS: AvatarHair[] = ['locs', 'longbraids', 'ponytail'];

/** [base, highlight]. 0–3 are the seeded near-black / dark-brown set. */
export const AVATAR_HAIR_COLORS: Array<[string, string]> = [
  ['#17100D', '#3A2A22'],
  ['#1F1612', '#45332A'],
  ['#2A1D17', '#4F3A2E'],
  ['#3A271C', '#5E4333'],
  ['#5A3A26', '#7E5638'],
  ['#8A3B22', '#B0573A'],
  ['#B07A3E', '#D39C5C'],
  ['#5E1E2A', '#84303F'],
];

export type FaceShape = 'oval' | 'round' | 'long';
export const FACE_SHAPES: FaceShape[] = ['oval', 'round', 'long'];

export type BrowStyle = 'soft' | 'straight' | 'arched';
export const BROW_STYLES: BrowStyle[] = ['soft', 'straight', 'arched'];

export type FaceMark = 'none' | 'freckles' | 'beauty';
export const FACE_MARKS: FaceMark[] = ['none', 'freckles', 'beauty'];

export type CheekStyle = 'blush' | 'plain' | 'dimples';
export const CHEEK_STYLES: CheekStyle[] = ['blush', 'plain', 'dimples'];

export type AvatarGlasses = 'none' | 'round' | 'square' | 'browline';
export const AVATAR_GLASSES: AvatarGlasses[] = ['none', 'round', 'square', 'browline'];

/** Frame colours: ink, tortoise brown, gold wire. */
export const FRAME_COLORS: string[] = ['#1C1A24', '#7A3F22', '#B8913A'];

export type Headwear = 'none' | 'moushwa' | 'riban';
export const HEADWEARS: Headwear[] = ['none', 'moushwa', 'riban'];

/** Moushwa fabrics [base, band] — madras-inspired warm tones (same as traits.ts). */
export const AVATAR_WRAPS: Array<[string, string]> = [
  ['#C8402F', '#F2B636'],
  ['#E8A21F', '#B4321F'],
  ['#2E7D5B', '#F2C94C'],
  ['#6B3FA0', '#F29E4C'],
];

export type UniformCut = 'chemise' | 'blouse' | 'polo' | 'cravate' | 'noeud';
export const UNIFORM_CUTS: UniformCut[] = ['chemise', 'blouse', 'polo', 'cravate', 'noeud'];

/** 'ecole' = the student's school colours (shirt → primary, tie/trim → secondary). */
export type UniformColor = 'ecole' | 'blanc' | 'kaki' | 'bleu' | 'marine' | 'gris' | 'bordeaux';
export const UNIFORM_COLORS: UniformColor[] = ['ecole', 'blanc', 'kaki', 'bleu', 'marine', 'gris', 'bordeaux'];
export const UNIFORM_HEX: Record<Exclude<UniformColor, 'ecole'>, string> = {
  blanc: '#F3F4F6',
  kaki: '#C9B48A',
  bleu: '#8DB4E2',
  marine: '#1F2D57',
  gris: '#8F98A3',
  bordeaux: '#6D1F2C',
};

export interface AvatarConfig {
  presentation: Presentation;
  skin: number;
  hair: AvatarHair;
  hairColor: number;
  face: FaceShape;
  brows: BrowStyle;
  marks: FaceMark;
  cheeks: CheekStyle;
  glasses: AvatarGlasses;
  frame: number;
  earrings: boolean;
  headwear: Headwear;
  wrap: number;
  uniform: UniformCut;
  shirt: UniformColor;
  tie: UniformColor;
}

const SEEDED_UNIFORM: Record<string, UniformCut> = { collar: 'chemise', epaulettes: 'cravate', piping: 'polo' };

/** The face a student has before customising anything — their seeded student. */
export function defaultConfigFor(seed: string, overrides: AvatarTraitOverrides = {}): AvatarConfig {
  const t = avatarTraits(String(seed ?? ''), overrides);
  const wrapped = t.hair === 'headwrap';
  return {
    presentation: 'neutre',
    skin: clampIndex(t.skin, 8) + SEEDED_SKIN_OFFSET,
    hair: wrapped ? 'crop' : (t.hair as AvatarHair),
    hairColor: clampIndex(t.hairColor, 4),
    face: 'oval',
    brows: 'soft',
    marks: 'none',
    cheeks: 'blush',
    glasses: t.glasses,
    frame: t.wrap % 2,
    earrings: !!t.earrings,
    headwear: wrapped ? 'moushwa' : 'none',
    wrap: clampIndex(t.wrap, AVATAR_WRAPS.length),
    uniform: SEEDED_UNIFORM[t.uniform] || 'chemise',
    shirt: 'ecole',
    tie: 'ecole',
  };
}

function clampIndex(n: unknown, len: number): number {
  const i = Math.floor(Number(n));
  return Number.isFinite(i) && i >= 0 && i < len ? i : 0;
}

/* ── wire format ─────────────────────────────────────────────── */

export const CONFIG_VERSION = '1';
export const SERIALIZED_LENGTH = 17;

type Slot = { get: (c: AvatarConfig) => number; set: (c: AvatarConfig, i: number) => void; n: number };
const listSlot = <K extends keyof AvatarConfig>(key: K, list: readonly unknown[]): Slot => ({
  get: (c) => list.indexOf(c[key]),
  set: (c, i) => { (c as any)[key] = list[i]; },
  n: list.length,
});
const numSlot = (key: 'skin' | 'hairColor' | 'frame' | 'wrap', n: number): Slot => ({
  get: (c) => c[key],
  set: (c, i) => { c[key] = i; },
  n,
});
/** Field order on the wire. APPEND-ONLY. */
const SLOTS: Slot[] = [
  listSlot('presentation', PRESENTATIONS),
  numSlot('skin', AVATAR_SKIN_TONES.length),
  listSlot('hair', AVATAR_HAIRS),
  numSlot('hairColor', AVATAR_HAIR_COLORS.length),
  listSlot('face', FACE_SHAPES),
  listSlot('brows', BROW_STYLES),
  listSlot('marks', FACE_MARKS),
  listSlot('cheeks', CHEEK_STYLES),
  listSlot('glasses', AVATAR_GLASSES),
  numSlot('frame', FRAME_COLORS.length),
  { get: (c) => (c.earrings ? 1 : 0), set: (c, i) => { c.earrings = i === 1; }, n: 2 },
  listSlot('headwear', HEADWEARS),
  numSlot('wrap', AVATAR_WRAPS.length),
  listSlot('uniform', UNIFORM_CUTS),
  listSlot('shirt', UNIFORM_COLORS),
  listSlot('tie', UNIFORM_COLORS),
];

/** Compact, storage-safe form ("1" + 16 base-36 digits). Input must be sanitized. */
export function serializeConfig(config: AvatarConfig): string {
  return CONFIG_VERSION + SLOTS.map((s) => {
    const i = s.get(config);
    return (i >= 0 && i < s.n ? i : 0).toString(36);
  }).join('');
}

const WIRE = /^1[0-9a-z]{16}$/;

/** Parse the wire form. Anything malformed or out of range → null. */
export function parseConfig(value: unknown): AvatarConfig | null {
  if (typeof value !== 'string' || !WIRE.test(value)) return null;
  const out = { ...NEUTRAL };
  for (let k = 0; k < SLOTS.length; k++) {
    const i = parseInt(value[k + 1], 36);
    if (!(i >= 0 && i < SLOTS[k].n)) return null;
    SLOTS[k].set(out, i);
  }
  return out;
}

/** Field fallback for object input with a bad field. */
const NEUTRAL: AvatarConfig = {
  presentation: 'neutre', skin: 4, hair: 'crop', hairColor: 0, face: 'oval', brows: 'soft',
  marks: 'none', cheeks: 'blush', glasses: 'none', frame: 0, earrings: false, headwear: 'none',
  wrap: 0, uniform: 'chemise', shirt: 'ecole', tie: 'ecole',
};

const pickFrom = <T,>(list: readonly T[], v: unknown, fallback: T): T =>
  (list as readonly unknown[]).includes(v) ? (v as T) : fallback;
const pickIndex = (v: unknown, n: number, fallback: number): number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < n ? v : fallback;

/**
 * Whitelist untrusted input into a valid config.
 *   • a wire string → parsed (null when malformed)
 *   • a plain object → every known field validated; bad / missing fields fall
 *     back to a neutral value; unknown keys are dropped
 *   • anything else → null (the caller falls back to the seeded face)
 */
export function sanitizeConfig(input: unknown): AvatarConfig | null {
  if (typeof input === 'string') return parseConfig(input);
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const o = input as Record<string, unknown>;
  return {
    presentation: pickFrom(PRESENTATIONS, o.presentation, NEUTRAL.presentation),
    skin: pickIndex(o.skin, AVATAR_SKIN_TONES.length, NEUTRAL.skin),
    hair: pickFrom(AVATAR_HAIRS, o.hair, NEUTRAL.hair),
    hairColor: pickIndex(o.hairColor, AVATAR_HAIR_COLORS.length, NEUTRAL.hairColor),
    face: pickFrom(FACE_SHAPES, o.face, NEUTRAL.face),
    brows: pickFrom(BROW_STYLES, o.brows, NEUTRAL.brows),
    marks: pickFrom(FACE_MARKS, o.marks, NEUTRAL.marks),
    cheeks: pickFrom(CHEEK_STYLES, o.cheeks, NEUTRAL.cheeks),
    glasses: pickFrom(AVATAR_GLASSES, o.glasses, NEUTRAL.glasses),
    frame: pickIndex(o.frame, FRAME_COLORS.length, NEUTRAL.frame),
    earrings: o.earrings === true,
    headwear: pickFrom(HEADWEARS, o.headwear, NEUTRAL.headwear),
    wrap: pickIndex(o.wrap, AVATAR_WRAPS.length, NEUTRAL.wrap),
    uniform: pickFrom(UNIFORM_CUTS, o.uniform, NEUTRAL.uniform),
    shirt: pickFrom(UNIFORM_COLORS, o.shirt, NEUTRAL.shirt),
    tie: pickFrom(UNIFORM_COLORS, o.tie, NEUTRAL.tie),
  };
}

/** Sanitize → wire string, or null. What servers store and forward. */
export function cleanAvatar(input: unknown): string | null {
  const c = sanitizeConfig(input);
  return c ? serializeConfig(c) : null;
}

export function sameConfig(a: AvatarConfig | null | undefined, b: AvatarConfig | null | undefined): boolean {
  if (!a || !b) return a === b;
  return serializeConfig(a) === serializeConfig(b);
}

/* ── suggestions (display order only; every option stays available) ─── */

const HAIR_FIRST: Record<Presentation, AvatarHair[]> = {
  fille: ['puffs', 'braids', 'bun', 'ponytail', 'bantu', 'longbraids', 'twists', 'cornrows', 'afro', 'locs', 'crop', 'fade', 'shaved'],
  garçon: ['fade', 'crop', 'shaved', 'twists', 'afro', 'cornrows', 'locs', 'braids', 'longbraids', 'bantu', 'puffs', 'bun', 'ponytail'],
  neutre: AVATAR_HAIRS,
};
const UNIFORM_FIRST: Record<Presentation, UniformCut[]> = {
  fille: ['blouse', 'noeud', 'chemise', 'polo', 'cravate'],
  garçon: ['chemise', 'cravate', 'polo', 'noeud', 'blouse'],
  neutre: ['chemise', 'polo', 'cravate', 'blouse', 'noeud'],
};
export const suggestedHairs = (p: Presentation): AvatarHair[] => HAIR_FIRST[p] || AVATAR_HAIRS;
export const suggestedUniforms = (p: Presentation): UniformCut[] => UNIFORM_FIRST[p] || UNIFORM_CUTS;

/** "Aléatoire": a fresh look that keeps the chosen presentation. `rand` is injectable for tests. */
export function randomConfig(presentation: Presentation, rand: () => number = Math.random): AvatarConfig {
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length) % list.length];
  const idx = (n: number) => Math.floor(rand() * n) % n;
  // Suggested styles are twice as likely, but never exclusive.
  const hairs = suggestedHairs(presentation);
  const hair = rand() < 0.66 ? pick(hairs.slice(0, 6)) : pick(AVATAR_HAIRS);
  const uniforms = suggestedUniforms(presentation);
  const uniform = rand() < 0.66 ? pick(uniforms.slice(0, 2)) : pick(UNIFORM_CUTS);
  const g = rand();
  const h = rand();
  return {
    presentation,
    // Deep and brown tones are the common case.
    skin: rand() < 0.85 ? idx(10) : 10 + idx(4),
    hair,
    hairColor: rand() < 0.8 ? idx(4) : idx(AVATAR_HAIR_COLORS.length),
    face: pick(FACE_SHAPES),
    brows: pick(BROW_STYLES),
    marks: rand() < 0.7 ? 'none' : pick(FACE_MARKS),
    cheeks: pick(CHEEK_STYLES),
    glasses: g < 0.7 ? 'none' : pick(AVATAR_GLASSES.slice(1)),
    frame: idx(FRAME_COLORS.length),
    earrings: rand() < 0.3,
    headwear: h < 0.8 ? 'none' : h < 0.9 ? 'moushwa' : 'riban',
    wrap: idx(AVATAR_WRAPS.length),
    uniform,
    shirt: rand() < 0.6 ? 'ecole' : pick(UNIFORM_COLORS),
    tie: 'ecole',
  };
}
