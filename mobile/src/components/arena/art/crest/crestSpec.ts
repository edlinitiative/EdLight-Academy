import { normalizeName } from '../../../../../../shared/leaderboardAgg';
import { CREST_PALETTES, hashString, seededRandom, type CrestPalette } from './palette';
import {
  SHIELD_SHAPES, DIVISION_LIST, CHARGE_LIST, BANNER_CUTS,
  type ShieldShape, type Division, type Charge, type BannerCut,
} from './geometry';

/** Everything that defines one school's crest — derived from its name only. */
export interface CrestSpec {
  /** The normalised name the crest is seeded from. */
  key: string;
  palette: CrestPalette;
  shape: ShieldShape;
  division: Division;
  charge: Charge;
  bannerCut: BannerCut;
  /** Initials for the ribbon, e.g. "ISLG", "CCH". 1–4 letters. */
  monogram: string;
}

const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'en', 'au', 'aux', 'a', 'sur', 'pour', 'of', 'the']);

/** "Institution Saint-Louis de Gonzague" → "ISLG"; "Collège Canado Haïtien" → "CCH". */
export function monogramOf(name: string): string {
  const words = normalizeName(name).split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w));
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 4).map((w) => w[0].toUpperCase()).join('');
}

/**
 * The crest for a school. Deterministic: every spelling that normalises to
 * the same key ("Lycée Toussaint-Louverture", "LYCEE TOUSSAINT LOUVERTURE")
 * gets the same crest, on every device.
 */
export function crestSpec(name: string): CrestSpec {
  const key = normalizeName(name) || 'ecole';
  const rand = seededRandom(hashString(key));
  const pick = <T,>(list: T[]): T => list[Math.floor(rand() * list.length) % list.length];
  const palette = pick(CREST_PALETTES);
  const shape = pick(SHIELD_SHAPES);
  let division = pick(DIVISION_LIST);
  const charge = pick(CHARGE_LIST);
  const bannerCut = pick(BANNER_CUTS);
  // A palm on a field divided per fess reads too close to the national arms
  // (palm over the blue-and-red flag). Keep the palm, change the division.
  if (charge === 'palmier' && division === 'fess') division = 'pale';
  return { key, palette, shape, division, charge, bannerCut, monogram: monogramOf(name) };
}
