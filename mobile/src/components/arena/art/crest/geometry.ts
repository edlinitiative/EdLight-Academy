/**
 * Crest grammar — the geometry of shields, field divisions and charges.
 * Pure data (SVG path strings), so it can be unit-tested and reused by the
 * phone app later.
 *
 * Coordinates: shields and divisions live in a 100 × 100 box; charges live in
 * a 48 × 48 box centred on (24, 24) and are placed by the renderer.
 *
 * All symbols are original drawings. None reproduces a real school's crest or
 * the national arms (no liberty cap, cannons, flags or trophies of arms).
 */

export type ShieldShape = 'heater' | 'arrondi' | 'francais' | 'echancre' | 'cartouche' | 'fronton';
export type Division = 'plain' | 'pale' | 'fess' | 'bend' | 'chevron' | 'quarterly' | 'chief' | 'pallet' | 'bordure';
export type Charge = 'livre' | 'flambeau' | 'etoile' | 'palmier' | 'lambi' | 'mornes' | 'plume' | 'soleil' | 'lampe' | 'tanbou';

export const SHIELDS: Record<ShieldShape, string> = {
  // Classic heater — straight top, curved flanks to a point.
  heater: 'M12 8H88V42C88 66 72 84 50 94C28 84 12 66 12 42Z',
  // Round-bottomed ("Spanish") shield.
  arrondi: 'M14 8H86V58A36 36 0 0 1 14 58Z',
  // Flat base with a small central point.
  francais: 'M12 8H88V74Q88 84 78 84H60L50 94L40 84H22Q12 84 12 74Z',
  // Concave notched top corners.
  echancre: 'M12 18Q23 18 23 7H77Q77 18 88 18V46C88 68 72 84 50 94C28 84 12 68 12 46Z',
  // Oval cartouche.
  cartouche: 'M50 5C71 5 86 25 86 50C86 75 71 95 50 95C29 95 14 75 14 50C14 25 29 5 50 5Z',
  // A pediment top — the roofline of a school building.
  fronton: 'M12 24L50 6L88 24V50C88 72 72 86 50 94C28 86 12 72 12 50Z',
};

/** The region painted in the second tincture, before clipping to the shield. */
export const DIVISIONS: Record<Division, string | null> = {
  plain: null,
  pale: 'M50 -2H102V102H50Z',
  fess: 'M-2 52H102V102H-2Z',
  bend: 'M-2 -2L102 102V-2Z',
  chevron: 'M-2 102L50 50L102 102Z',
  quarterly: 'M50 -2H102V50H50ZM-2 50H50V102H-2Z',
  chief: 'M-2 -2H102V30H-2Z',
  pallet: 'M39 -2H61V102H39Z',
  bordure: '', // drawn as an inner band along the shield outline
};

/** Where the charge sits (centre, in the 100 box) for a given division. */
export function chargeCentre(division: Division, shape: ShieldShape): { x: number; y: number } {
  const base = shape === 'fronton' ? 52 : shape === 'cartouche' ? 50 : 46;
  if (division === 'chief') return { x: 50, y: base + 10 };
  return { x: 50, y: base };
}

function starPath(cx: number, cy: number, outer: number, inner: number, points = 5): string {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

function sunRays(cx: number, cy: number, r0: number, r1: number, n: number, spread: number): string {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (i + 0.5) * (Math.PI / n);
    const a0 = a - spread;
    const a1 = a + spread;
    const p = (ang: number, r: number) => `${(cx + r * Math.cos(ang)).toFixed(2)} ${(cy + r * Math.sin(ang)).toFixed(2)}`;
    d += `M${p(a0, r0)}L${p(a, r1)}L${p(a1, r0)}Z`;
  }
  return d;
}

export interface ChargeArt {
  /** Filled in the charge colour. */
  body: string;
  /** Fine cut lines in the field colour — shown only at reading sizes. */
  cuts?: string;
  /** Strokes in the charge colour (e.g. a quill's shaft). */
  strokes?: string;
}

export const CHARGES: Record<Charge, ChargeArt> = {
  // Open book — knowledge.
  livre: {
    body: 'M24 13C18 8.5 10 8.5 3 11V37C10 34.5 18 34.5 24 39C30 34.5 38 34.5 45 37V11C38 8.5 30 8.5 24 13Z',
    cuts: 'M24 14V38M8 16C12 15 16 15 20 17M8 22C12 21 16 21 20 23M28 17C32 15 36 15 40 16M28 23C32 21 36 21 40 22',
  },
  // Torch — the flame of learning.
  flambeau: {
    body: 'M24 2C30 8 33.5 13 31 19C30 21.5 27.5 23 24 23C20.5 23 18 21.5 17 19C15 14 18 9.5 21.5 6C21.5 10 23 12.5 25 11.5C26.5 9.5 26 5.5 24 2ZM15 25H33L29.5 31H18.5ZM19.5 32.5H28.5L26.5 46H21.5Z',
    cuts: 'M18 28H30',
  },
  // Five-point star.
  etoile: { body: starPath(24, 25.5, 22, 9) },
  // Palm — the island, standing alone (never with the national trophies).
  palmier: {
    body:
      'M22.5 45C22 35 22.5 27 25.5 18.5H28C26 27 25.5 35 27 45Z' +
      'M26.5 17C19 9 10.5 10 4 19C11.5 15.5 18 15.5 26 19.5Z' +
      'M26.5 17C34 9 42.5 10 46 19C38.5 15.5 33 15.5 27 19.5Z' +
      'M26.5 17C22.5 8 16 3.5 9 4C15.5 7.5 20 12 25.5 18.5Z' +
      'M26.5 17C30.5 8 36.5 3.5 43 5C37 8 32.5 12 27.5 18.5Z' +
      'M26.5 17C25.5 10.5 26.5 5.5 29 2C30 7 29.5 12 27.5 17.5Z' +
      'M14 45H38V47H14Z',
  },
  // Lambi — the queen conch, the call to gather.
  lambi: {
    body: 'M2.5 26L9.5 21.5L10 16.5L14.5 18.5L16.5 13L20.5 16.5L24 10.5L27.5 15L31.5 9.5C39 8 45.5 13.5 46 22C46.5 31 41 38.5 32.5 39.5C25.5 40.5 17.5 36 11.5 31.5Z',
    cuts: 'M33 15C38.5 17 41.5 23.5 39 31M7 25.5C15 29.5 23 31.5 31.5 30.5',
  },
  // Mòn — a mountain ridge, "dèyè mòn gen mòn".
  mornes: {
    body: 'M1 42L15 19L21 27L30 10L47 42Z',
    cuts: 'M30 10L27 21L31 25M15 19L14 28',
  },
  // Quill.
  plume: {
    body: 'M43 3C31 5 19 15 13 31C16.5 29.5 19.5 29.5 21.5 28C19.5 26.5 21 24.5 25 24C23 22.5 26.5 19 31 18.5C29 17 34.5 12 43 3Z',
    strokes: 'M42 4L9 41',
    cuts: 'M38 8.5L17 30',
  },
  // Rising sun over the horizon — a new day.
  soleil: {
    body: 'M10 37A14 14 0 0 1 38 37Z' + sunRays(24, 37, 17, 30, 7, 0.13) + 'M3 39.5H45V43H3Z',
  },
  // Oil lamp of knowledge.
  lampe: {
    body:
      'M5 31C10 25.5 29 25 37 29L46 24.5L43.5 31.5C38 38 14.5 39.5 5 31Z' +
      'M17.5 37.5H30.5L32.5 44H15.5Z' +
      'M9.5 25C7 20 10.5 15.5 10.5 9.5C15 15 15.5 21 12 25Z',
    cuts: 'M10 31.5C17 34 29 33.5 36 30.5',
  },
  // Tanbou — the drum.
  tanbou: {
    body: 'M11 9H37L32 41H16Z M15 42H33V46H15Z',
    cuts: 'M11.5 13H36.5M13 13L20 25L14.5 37M20 25L28 13M20 25L28 37M28 13L35 25L33.5 37M28 37L35 25',
  },
};

export const SHIELD_SHAPES = Object.keys(SHIELDS) as ShieldShape[];
export const DIVISION_LIST = Object.keys(DIVISIONS) as Division[];
export const CHARGE_LIST = Object.keys(CHARGES) as Charge[];

/** Banner silhouettes (100 × 140 box), hanging from a rod at y = 10. */
export type BannerCut = 'queue' | 'pointe' | 'droit';
export const BANNERS: Record<BannerCut, string> = {
  queue: 'M14 12H86V128L50 108L14 128Z', // swallowtail
  pointe: 'M14 12H86V112L50 132L14 112Z', // pointed
  droit: 'M14 12H86V124Q50 134 14 124Z', // gently curved hem
};
/** Divisions re-drawn for cloth (100 × 140): nothing may cross the charge or the initials. */
export const BANNER_DIVISIONS: Record<Division, string | null> = {
  plain: null,
  pale: 'M14 0H26V140H14ZM74 0H86V140H74Z',
  bend: 'M14 0H26V140H14ZM74 0H86V140H74Z',
  quarterly: 'M14 0H26V140H14ZM74 0H86V140H74Z',
  fess: 'M-2 112H102V142H-2Z',
  chevron: 'M-2 142L50 108L102 142Z',
  chief: 'M-2 -2H102V27H-2Z',
  pallet: 'M40 -2H60V142H40Z',
  bordure: '',
};
export const BANNER_CUTS = Object.keys(BANNERS) as BannerCut[];
