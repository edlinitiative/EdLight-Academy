/*
 * Haiti, drawn — the geometry behind the Arena broadcast map.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `src/data/haitiGeo.ts` knows the NAMES of the 10 départements and their 140
 * communes and nothing else: no coordinates, no outlines. The stage needs to
 * put a mark where a school or a player actually is, so the shapes have to
 * live in the repo. Nothing here is fetched: the app's CSP blocks external
 * hosts and the stage has to come up offline on a slow connection. Every
 * number below is committed data.
 *
 * HOW THE GEOMETRY WAS DERIVED, AND WHAT IT IS NOT
 * ------------------------------------------------
 * These coordinates were written from knowledge of Haitian geography — the
 * coastline, the two peninsulas, the département boundaries and the positions of the
 * commune seats — and NOT traced from a survey dataset, a shapefile, or any
 * official boundary file. Treat them accordingly:
 *
 *   - Coastlines are simplified to 15–30 vertices per département. Bays that
 *     carry the silhouette are kept (the Baie de Port-au-Prince, the Gulf of
 *     Gonâve, the Baradères inlet); everything smaller is smoothed away.
 *   - Département boundaries are smooth lines through the right corridor, not
 *     the real jagged ones. Where a commune genuinely sits in a salient — the
 *     Marmelade area is the worst case — the drawn border may put its dot on
 *     the wrong side by a few kilometres. At this scale that is under 3px.
 *   - Commune coordinates are the commune SEAT (the town), not the commune's
 *     area centroid. Expect roughly ±2 km on the well-known towns and up to
 *     ±10 km on the smallest rural ones (Arnaud, Grand-Boucan, Cerca-Carvajal,
 *     Bahon, La Victoire, Perches, Capotille are the least certain).
 *   - A handful of coastal seats (Port-au-Prince, Cité Soleil, Jacmel) sit
 *     within ~1 km of the drawn coast and may render a pixel outside it.
 *
 * This is a broadcast map. It is accurate enough that a Haitian viewer reads
 * the shape instantly and finds their commune in the right place; it is NOT
 * accurate enough to measure anything, settle a boundary, or drive any
 * decision about where something is. Do not use it as a source of truth.
 *
 * PROJECTION AND UNITS
 * --------------------
 * Plate carrée (equirectangular), scaled at the standard parallel 19.1°N so
 * the country is not stretched east–west:
 *
 *     x = (lon − LON_ORIGIN) × UNITS_PER_LON
 *     y = (LAT_ORIGIN − lat) × UNITS_PER_LON / cos(19.1°)
 *
 * LON_ORIGIN −74.60 and LAT_ORIGIN 20.15 put the whole country — Île de la
 * Tortue at the top, Anse-à-Pitres at the bottom, Les Irois at the left,
 * the Massacre river at the right — inside a 1000 × 760 viewBox with a small
 * margin. Units are SVG user units; 1 unit ≈ 333 m of longitude.
 */

import { HAITI_DEPARTMENTS, cityKey } from './haitiGeo';

/* ── Projection ─────────────────────────────────────────────────────────── */

export const LON_ORIGIN = -74.6;
export const LAT_ORIGIN = 20.15;
export const UNITS_PER_LON = 1000 / 3;
/** cos(19.1°) — the standard parallel, the mid-latitude of the country. */
const COS_STANDARD_PARALLEL = 0.944857;
export const UNITS_PER_LAT = UNITS_PER_LON / COS_STANDARD_PARALLEL;

export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 760;
export const MAP_VIEWBOX = `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`;

export interface MapPoint {
  x: number;
  y: number;
}

/** Longitude/latitude in degrees → viewBox user units. Pure. */
export function project(lon: number, lat: number): MapPoint {
  return {
    x: round2((lon - LON_ORIGIN) * UNITS_PER_LON),
    y: round2((LAT_ORIGIN - lat) * UNITS_PER_LAT),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ── Outlines ───────────────────────────────────────────────────────────── */

type Ring = Array<[number, number]>;

/*
 * Each département is one or more closed rings of [lon, lat]. Rings after the
 * first are its islands — Île de la Gonâve and Pointe-à-Raquette belong to
 * Ouest, Île de la Tortue to Nord-Ouest, Île-à-Vache to Sud. Shared borders
 * reuse the same vertices on both sides so the fills meet without a seam.
 */
const DEPARTMENT_RINGS: Record<string, Ring[]> = {
  'Nord-Ouest': [
    [
      [-73.44, 19.81], [-73.34, 19.85], [-73.2, 19.88], [-73.05, 19.89],
      [-72.92, 19.93], [-72.8, 19.96], [-72.68, 19.95], [-72.58, 19.9],
      [-72.64, 19.8], [-72.66, 19.72], [-72.78, 19.71], [-72.92, 19.7],
      [-73.06, 19.68], [-73.14, 19.62], [-73.24, 19.6], [-73.33, 19.65],
      [-73.41, 19.73],
    ],
    // Île de la Tortue.
    [
      [-72.98, 20.05], [-72.9, 20.09], [-72.78, 20.11], [-72.68, 20.09],
      [-72.62, 20.05], [-72.72, 20.02], [-72.85, 20.01],
    ],
  ],

  Nord: [
    [
      [-72.58, 19.9], [-72.46, 19.87], [-72.36, 19.82], [-72.26, 19.79],
      [-72.16, 19.78], [-72.1, 19.73], [-72.1, 19.64], [-72.06, 19.55],
      [-71.97, 19.48], [-71.93, 19.38], [-71.95, 19.29], [-72.04, 19.24],
      [-72.14, 19.23], [-72.24, 19.26], [-72.28, 19.35], [-72.26, 19.47],
      [-72.44, 19.55], [-72.56, 19.62], [-72.66, 19.72], [-72.64, 19.8],
    ],
  ],

  'Nord-Est': [
    [
      [-72.1, 19.73], [-72.0, 19.71], [-71.9, 19.7], [-71.8, 19.72],
      [-71.74, 19.7], [-71.7, 19.58], [-71.66, 19.44], [-71.7, 19.3],
      [-71.7, 19.24], [-71.8, 19.28], [-71.95, 19.29], [-71.93, 19.38],
      [-71.97, 19.48], [-72.06, 19.55], [-72.1, 19.64],
    ],
  ],

  Artibonite: [
    [
      [-73.14, 19.62], [-73.02, 19.6], [-72.9, 19.55], [-72.8, 19.5],
      [-72.72, 19.44], [-72.76, 19.36], [-72.8, 19.28], [-72.83, 19.22],
      [-72.78, 19.16], [-72.72, 19.1], [-72.68, 19.02], [-72.62, 18.95],
      [-72.5, 18.92], [-72.38, 18.88], [-72.28, 18.84], [-72.28, 18.96],
      [-72.3, 19.08], [-72.3, 19.22], [-72.28, 19.35], [-72.26, 19.47],
      [-72.44, 19.55], [-72.56, 19.62], [-72.66, 19.72], [-72.78, 19.71],
      [-72.92, 19.7], [-73.06, 19.68],
    ],
  ],

  Centre: [
    [
      [-72.28, 18.84], [-72.28, 18.96], [-72.3, 19.08], [-72.3, 19.22],
      [-72.28, 19.35], [-72.24, 19.26], [-72.14, 19.23], [-72.04, 19.24],
      [-71.95, 19.29], [-71.8, 19.28], [-71.7, 19.24], [-71.72, 19.14],
      [-71.82, 19.02], [-71.73, 18.92], [-71.76, 18.8], [-71.79, 18.68],
      [-71.95, 18.7], [-72.1, 18.7], [-72.22, 18.74],
    ],
  ],

  Ouest: [
    [
      [-72.62, 18.95], [-72.57, 18.88], [-72.5, 18.78], [-72.42, 18.7],
      [-72.36, 18.63], [-72.34, 18.59], [-72.335, 18.545], [-72.43, 18.52],
      [-72.52, 18.52], [-72.63, 18.5], [-72.77, 18.43], [-72.87, 18.42],
      [-72.94, 18.41], [-72.94, 18.39], [-72.8, 18.32], [-72.66, 18.3],
      [-72.52, 18.33], [-72.4, 18.34], [-72.28, 18.36], [-72.14, 18.36],
      [-72.0, 18.38], [-71.88, 18.38], [-71.78, 18.4], [-71.74, 18.52],
      [-71.73, 18.62], [-71.79, 18.68], [-71.95, 18.7], [-72.1, 18.7],
      [-72.22, 18.74], [-72.28, 18.84], [-72.38, 18.88], [-72.5, 18.92],
    ],
    // Île de la Gonâve.
    [
      [-73.3, 18.8], [-73.22, 18.86], [-73.1, 18.9], [-72.98, 18.93],
      [-72.86, 18.92], [-72.78, 18.87], [-72.74, 18.81], [-72.82, 18.78],
      [-72.94, 18.76], [-73.06, 18.75], [-73.18, 18.76],
    ],
  ],

  Nippes: [
    [
      [-72.94, 18.41], [-73.0, 18.44], [-73.09, 18.46], [-73.18, 18.47],
      [-73.28, 18.49], [-73.38, 18.53], [-73.46, 18.55], [-73.56, 18.54],
      [-73.64, 18.53], [-73.72, 18.55], [-73.74, 18.48], [-73.72, 18.42],
      [-73.62, 18.37], [-73.5, 18.34], [-73.38, 18.32], [-73.24, 18.3],
      [-73.12, 18.34], [-73.0, 18.37], [-72.94, 18.39],
    ],
  ],

  "Grand'Anse": [
    [
      [-73.72, 18.55], [-73.8, 18.54], [-73.88, 18.59], [-73.96, 18.63],
      [-74.1, 18.67], [-74.22, 18.69], [-74.32, 18.67], [-74.38, 18.63],
      [-74.44, 18.58], [-74.48, 18.51], [-74.5, 18.43], [-74.46, 18.37],
      [-74.32, 18.38], [-74.18, 18.4], [-74.04, 18.4], [-73.92, 18.38],
      [-73.8, 18.4], [-73.72, 18.42], [-73.74, 18.48],
    ],
  ],

  Sud: [
    [
      [-74.46, 18.37], [-74.42, 18.33], [-74.36, 18.3], [-74.26, 18.28],
      [-74.16, 18.26], [-74.1, 18.25], [-74.04, 18.21], [-74.0, 18.16],
      [-73.96, 18.11], [-73.92, 18.06], [-73.88, 18.05], [-73.86, 18.11],
      [-73.8, 18.13], [-73.74, 18.18], [-73.64, 18.22], [-73.54, 18.24],
      [-73.42, 18.25], [-73.34, 18.22], [-73.3, 18.2], [-73.24, 18.3],
      [-73.38, 18.32], [-73.5, 18.34], [-73.62, 18.37], [-73.72, 18.42],
      [-73.8, 18.4], [-73.92, 18.38], [-74.04, 18.4], [-74.18, 18.4],
      [-74.32, 18.38],
    ],
    // Île-à-Vache.
    [
      [-73.72, 18.1], [-73.66, 18.12], [-73.58, 18.1], [-73.62, 18.06],
      [-73.7, 18.06],
    ],
  ],

  'Sud-Est': [
    [
      [-73.3, 18.2], [-73.18, 18.12], [-73.04, 18.14], [-72.9, 18.16],
      [-72.76, 18.16], [-72.64, 18.18], [-72.54, 18.22], [-72.44, 18.2],
      [-72.3, 18.2], [-72.16, 18.19], [-72.02, 18.2], [-71.9, 18.14],
      [-71.8, 18.07], [-71.74, 18.04], [-71.76, 18.18], [-71.78, 18.31],
      [-71.78, 18.4], [-71.88, 18.38], [-72.0, 18.38], [-72.14, 18.36],
      [-72.28, 18.36], [-72.4, 18.34], [-72.52, 18.33], [-72.66, 18.3],
      [-72.8, 18.32], [-72.94, 18.39], [-73.0, 18.37], [-73.12, 18.34],
      [-73.24, 18.3],
    ],
  ],
};

/** The 10 départements that have geometry, north-west to south-east. */
export const MAPPED_DEPARTMENTS: string[] = [
  'Nord-Ouest', 'Nord', 'Nord-Est', 'Artibonite', 'Centre',
  'Ouest', 'Nippes', "Grand'Anse", 'Sud', 'Sud-Est',
];

/* ── Commune seats ──────────────────────────────────────────────────────── */

/*
 * [lon, lat] of every commune seat named in haitiGeo.ts — all 140 of them.
 * Keyed by the exact spelling used there so the two files cannot drift apart
 * silently; the test suite asserts the two lists match, both ways.
 *
 * Diaspora / Étranger has no cities and no geometry by construction: a learner
 * abroad is not on this map and must not be placed anywhere on it.
 */
const COMMUNE_LONLAT: Record<string, [number, number]> = {
  // Artibonite
  'Gonaïves': [-72.69, 19.45],
  'Anse-Rouge': [-73.05, 19.62],
  'Desdunes': [-72.6, 19.28],
  'Dessalines': [-72.51, 19.27],
  'Ennery': [-72.47, 19.48],
  'Grande-Saline': [-72.77, 19.28],
  'Gros-Morne': [-72.68, 19.67],
  "L'Estère": [-72.62, 19.36],
  'La Chapelle': [-72.34, 19.0],
  'Marmelade': [-72.36, 19.51],
  "Petite-Rivière-de-l'Artibonite": [-72.45, 19.14],
  'Saint-Marc': [-72.7, 19.11],
  "Saint-Michel-de-l'Attalaye": [-72.33, 19.37],
  'Terre-Neuve': [-72.8, 19.58],
  'Verrettes': [-72.46, 19.05],

  // Centre
  'Hinche': [-72.02, 19.15],
  'Belladère': [-71.79, 18.87],
  'Boucan-Carré': [-72.22, 18.96],
  'Cerca-Carvajal': [-71.97, 19.25],
  'Cerca-la-Source': [-71.78, 19.16],
  'Lascahobas': [-71.94, 18.83],
  'Maïssade': [-72.14, 19.12],
  'Mirebalais': [-72.11, 18.84],
  "Saut-d'Eau": [-72.21, 18.79],
  'Savanette': [-71.87, 18.75],
  'Thomassique': [-71.83, 19.06],
  'Thomonde': [-71.95, 19.06],

  // Grand'Anse
  'Jérémie': [-74.12, 18.65],
  'Abricots': [-74.3, 18.65],
  "Anse-d'Hainault": [-74.45, 18.5],
  'Beaumont': [-73.9, 18.42],
  'Bonbon': [-74.34, 18.61],
  'Chambellan': [-74.25, 18.53],
  'Corail': [-73.89, 18.57],
  'Dame-Marie': [-74.42, 18.56],
  'Les Irois': [-74.47, 18.41],
  'Moron': [-74.17, 18.56],
  'Pestel': [-73.8, 18.51],
  'Roseaux': [-74.03, 18.58],

  // Nippes
  'Miragoâne': [-73.09, 18.45],
  'Anse-à-Veau': [-73.38, 18.51],
  'Arnaud': [-73.36, 18.43],
  'Baradères': [-73.63, 18.5],
  'Fonds-des-Nègres': [-73.22, 18.4],
  'Grand-Boucan': [-73.55, 18.44],
  "L'Asile": [-73.4, 18.36],
  'Paillant': [-73.13, 18.42],
  'Petit-Trou-de-Nippes': [-73.48, 18.52],
  'Petite-Rivière-de-Nippes': [-73.2, 18.44],
  'Plaisance-du-Sud': [-73.32, 18.36],

  // Nord
  'Cap-Haïtien': [-72.2, 19.76],
  'Acul-du-Nord': [-72.33, 19.68],
  'Bahon': [-72.13, 19.52],
  'Bas-Limbé': [-72.36, 19.78],
  'Borgne': [-72.54, 19.84],
  'Dondon': [-72.25, 19.55],
  'Grande-Rivière-du-Nord': [-72.17, 19.58],
  'La Victoire': [-72.0, 19.47],
  'Limbé': [-72.4, 19.7],
  'Limonade': [-72.13, 19.67],
  'Milot': [-72.21, 19.61],
  'Pignon': [-72.1, 19.34],
  'Pilate': [-72.55, 19.67],
  'Plaine-du-Nord': [-72.26, 19.69],
  'Plaisance': [-72.47, 19.6],
  'Port-Margot': [-72.42, 19.8],
  'Quartier-Morin': [-72.15, 19.7],
  'Ranquitte': [-72.02, 19.42],
  'Saint-Raphaël': [-72.11, 19.44],

  // Nord-Est
  'Fort-Liberté': [-71.84, 19.66],
  'Capotille': [-71.72, 19.47],
  'Caracol': [-72.02, 19.68],
  'Carice': [-71.83, 19.42],
  'Ferrier': [-71.83, 19.65],
  'Mombin-Crochu': [-71.9, 19.42],
  'Mont-Organisé': [-71.77, 19.42],
  'Ouanaminthe': [-71.72, 19.55],
  'Perches': [-71.93, 19.57],
  'Sainte-Suzanne': [-72.03, 19.53],
  'Terrier-Rouge': [-71.95, 19.63],
  'Trou-du-Nord': [-72.02, 19.62],
  'Vallières': [-71.85, 19.48],

  // Nord-Ouest
  'Port-de-Paix': [-72.83, 19.93],
  'Anse-à-Foleur': [-72.62, 19.89],
  'Baie-de-Henne': [-73.23, 19.65],
  'Bassin-Bleu': [-72.8, 19.83],
  'Bombardopolis': [-73.34, 19.69],
  'Chansolme': [-72.85, 19.87],
  'Jean-Rabel': [-73.18, 19.84],
  'La Tortue': [-72.8, 20.06],
  'Môle-Saint-Nicolas': [-73.38, 19.8],
  'Saint-Louis-du-Nord': [-72.72, 19.92],

  // Ouest
  'Port-au-Prince': [-72.34, 18.55],
  'Anse-à-Galets': [-72.87, 18.83],
  'Arcahaie': [-72.52, 18.77],
  'Cabaret': [-72.44, 18.7],
  'Carrefour': [-72.4, 18.53],
  'Cité Soleil': [-72.33, 18.58],
  'Cornillon': [-71.95, 18.67],
  'Croix-des-Bouquets': [-72.22, 18.58],
  'Delmas': [-72.3, 18.55],
  'Fonds-Verrettes': [-71.87, 18.41],
  'Ganthier': [-72.03, 18.53],
  'Grand-Goâve': [-72.77, 18.44],
  'Gressier': [-72.5, 18.54],
  'Kenscoff': [-72.29, 18.45],
  'Léogâne': [-72.63, 18.51],
  'Pétion-Ville': [-72.29, 18.51],
  'Petit-Goâve': [-72.87, 18.43],
  'Pointe-à-Raquette': [-73.27, 18.81],
  'Tabarre': [-72.27, 18.57],
  'Thomazeau': [-72.1, 18.68],

  // Sud
  'Les Cayes': [-73.75, 18.2],
  'Aquin': [-73.39, 18.28],
  'Arniquet': [-73.88, 18.24],
  'Camp-Perrin': [-73.87, 18.32],
  'Cavaillon': [-73.65, 18.3],
  'Chantal': [-73.78, 18.26],
  'Chardonnières': [-74.15, 18.28],
  'Côteaux': [-74.05, 18.23],
  'Île-à-Vache': [-73.65, 18.09],
  'Les Anglais': [-74.24, 18.3],
  'Maniche': [-73.7, 18.35],
  'Port-à-Piment': [-74.09, 18.27],
  'Port-Salut': [-73.92, 18.09],
  'Roche-à-Bateau': [-74.0, 18.18],
  'Saint-Jean-du-Sud': [-73.93, 18.15],
  'Saint-Louis-du-Sud': [-73.54, 18.26],
  'Tiburon': [-74.4, 18.32],
  'Torbeck': [-73.82, 18.15],

  // Sud-Est
  'Jacmel': [-72.53, 18.235],
  'Anse-à-Pitres': [-71.75, 18.05],
  'Bainet': [-72.75, 18.18],
  'Belle-Anse': [-72.02, 18.22],
  'Cayes-Jacmel': [-72.39, 18.23],
  'Côtes-de-Fer': [-73.2, 18.16],
  'Grand-Gosier': [-71.83, 18.17],
  'La Vallée-de-Jacmel': [-72.47, 18.31],
  'Marigot': [-72.32, 18.23],
  'Thiotte': [-71.87, 18.25],
};

/* ── Lookup tables ──────────────────────────────────────────────────────── */

function buildIndex<T>(source: Record<string, T>): Map<string, { name: string; value: T }> {
  const index = new Map<string, { name: string; value: T }>();
  for (const name of Object.keys(source)) {
    index.set(cityKey(name), { name, value: source[name] });
  }
  return index;
}

const COMMUNE_INDEX = buildIndex(COMMUNE_LONLAT);
const DEPARTMENT_INDEX = buildIndex(DEPARTMENT_RINGS);

/** commune key → département name, taken from haitiGeo so it cannot drift. */
const COMMUNE_DEPARTMENT = new Map<string, string>();
for (const dept of HAITI_DEPARTMENTS) {
  for (const city of dept.cities) COMMUNE_DEPARTMENT.set(cityKey(city), dept.name);
}

/*
 * The entries haitiGeo lists that are deliberately NOT on this map.
 *
 * Derived, not hardcoded: any top-level entry in HAITI_DEPARTMENTS with no
 * geometry here is off-map by definition. Today that is exactly one —
 * 'Diaspora / Étranger', which students outside the country pick — and if
 * another such bucket is ever added, it is handled without touching this file.
 *
 * Off-map is a THIRD answer, not a flavour of missing. "This school has no
 * commune" is a data gap an admin fixes by typing one. "This player lives in
 * Boston" is correct, permanent, and fixes nothing. The stage words them
 * differently, so the two never share a counter.
 */
const OFF_MAP_KEYS = new Set<string>(
  HAITI_DEPARTMENTS
    .filter((d) => !DEPARTMENT_RINGS[d.name])
    .map((d) => cityKey(d.name)),
);

/**
 * True for a place that is real but cannot be plotted — a learner abroad.
 * Such a place must be shown as a caption, never as a pin and never as a
 * hole in the data.
 *
 * Limitation worth knowing: a diaspora learner who free-typed a foreign city
 * ("Boston") instead of picking the Diaspora entry arrives here as an
 * unrecognised NAME, and nothing in the string can tell that apart from a
 * misspelt Haitian commune. Those land in `unknownNames`. Pass the Diaspora
 * entry itself when the caller knows the learner is abroad.
 */
export function isOffMap(name: string): boolean {
  return OFF_MAP_KEYS.has(cityKey(name));
}

/* ── Paths ──────────────────────────────────────────────────────────────── */

const pathCache = new Map<string, string>();

function ringToPath(ring: Ring): string {
  let d = '';
  for (let i = 0; i < ring.length; i += 1) {
    const p = project(ring[i][0], ring[i][1]);
    d += `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`;
  }
  return `${d}Z`;
}

/**
 * The SVG path for one département — all of its rings, mainland first, so a
 * single <path> carries its islands too. Returns null for a name with no
 * geometry (an unknown name, or Diaspora / Étranger).
 */
export function departmentPath(name: string): string | null {
  const hit = DEPARTMENT_INDEX.get(cityKey(name));
  if (!hit) return null;
  const cached = pathCache.get(hit.name);
  if (cached) return cached;
  const d = hit.value.map(ringToPath).join('');
  pathCache.set(hit.name, d);
  return d;
}

/* ── Centroids ──────────────────────────────────────────────────────────── */

const centroidCache = new Map<string, MapPoint>();

/** Area centroid of the mainland ring, in user units. */
function ringCentroid(ring: Ring): MapPoint {
  const pts = ring.map(([lon, lat]) => project(lon, lat));
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const cross = a.x * b.y - b.x * a.y;
    twiceArea += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (twiceArea === 0) return pts[0];
  return { x: round2(cx / (3 * twiceArea)), y: round2(cy / (3 * twiceArea)) };
}

/**
 * Where to put a mark that is known only to the département. This is the
 * fallback position, never a claim about where anything actually is.
 */
export function departmentCentroid(name: string): MapPoint | null {
  const hit = DEPARTMENT_INDEX.get(cityKey(name));
  if (!hit) return null;
  const cached = centroidCache.get(hit.name);
  if (cached) return cached;
  const c = ringCentroid(hit.value[0]);
  centroidCache.set(hit.name, c);
  return c;
}

/** The projected seat of a commune, or null when the name is not a commune. */
export function communePoint(name: string): MapPoint | null {
  const hit = COMMUNE_INDEX.get(cityKey(name));
  if (!hit) return null;
  return project(hit.value[0], hit.value[1]);
}

/** The département a commune belongs to, per haitiGeo. */
export function departmentOf(commune: string): string | null {
  return COMMUNE_DEPARTMENT.get(cityKey(commune)) || null;
}

export interface ResolvedPlace extends MapPoint {
  /** the canonical haitiGeo spelling that matched */
  name: string;
  /** the département the mark sits in */
  department: string;
  /** 'commune' — the seat itself; 'department' — the centroid, a fallback */
  precision: 'commune' | 'department';
}

/**
 * Resolve a free-typed place to a point: the commune seat when we know it,
 * otherwise the centroid of its département, otherwise null.
 *
 * Null means "we do not know where this is" and the caller must SAY so rather
 * than drop it or park it somewhere plausible. A commune we cannot place is
 * still reported at département precision so the data point survives; a name
 * we do not recognise at all is not placed at any precision.
 */
export function resolvePlace(name: string): ResolvedPlace | null {
  const key = cityKey(name);
  if (!key) return null;
  // Not a gap in the geometry — there is nowhere on a map of Haiti for it.
  if (OFF_MAP_KEYS.has(key)) return null;

  const commune = COMMUNE_INDEX.get(key);
  if (commune) {
    const p = project(commune.value[0], commune.value[1]);
    return {
      ...p,
      name: commune.name,
      department: COMMUNE_DEPARTMENT.get(key) || '',
      precision: 'commune',
    };
  }

  const dept = DEPARTMENT_INDEX.get(key);
  if (dept) {
    const c = departmentCentroid(dept.name);
    if (c) return { ...c, name: dept.name, department: dept.name, precision: 'department' };
    return null;
  }

  // A known commune with no coordinate of its own still lands in its
  // département rather than disappearing. (There are none today; this keeps
  // the behaviour correct if haitiGeo gains a commune before this file does.)
  const parent = COMMUNE_DEPARTMENT.get(key);
  if (parent) {
    const c = departmentCentroid(parent);
    if (c) return { ...c, name: parent, department: parent, precision: 'department' };
  }

  return null;
}

/* ── The two layers ─────────────────────────────────────────────────────── */

export type PlaceKind = 'school' | 'player';

export interface MapPlace {
  /** commune or department name as spelled in haitiGeo.ts */
  name: string;
  kind: PlaceKind;
  /** stable identity, so 'arrivals' knows what is genuinely new */
  id: string;
  /** school short name (CODOSA) for a school; omitted for players */
  label?: string;
  value?: number;
  active?: boolean;
}

export interface SchoolMark {
  id: string;
  label: string;
  value: number;
  active: boolean;
}

export interface MapCluster {
  /** stable key for React, derived from the position */
  key: string;
  x: number;
  y: number;
  /** the place name that resolved here */
  name: string;
  department: string;
  /** true when this is a département centroid, not a commune seat */
  approximate: boolean;
  schools: SchoolMark[];
  /** how many `kind: 'player'` places landed on this point */
  playerCount: number;
  /** summed player `value` (defaults to 1 each) — what density shades by */
  playerValue: number;
  active: boolean;
}

/** A real participant with no possible position: a learner outside Haiti. */
export interface OffMapPlace {
  name: string;
  kind: PlaceKind;
  value: number;
}

export interface MapCoverage {
  schoolsPlaced: number;
  schoolsUnplaced: number;
  playersPlaced: number;
  playersUnplaced: number;
  /**
   * Places that are correct but unplottable — the diaspora. Kept apart from
   * the unplaced counts on purpose: one is a data gap somebody can fix, the
   * other is a fact about where a person lives.
   */
  offMap: OffMapPlace[];
  offMapSchools: number;
  offMapPlayers: number;
  /** summed value of the off-map places, players weighted as 1 each */
  offMapValue: number;
  /** distinct unrecognised place names, for the caller to show or log */
  unknownNames: string[];
}

export interface MapLayout {
  clusters: MapCluster[];
  /** summed player value per département, for density shading */
  byDepartment: Record<string, number>;
  totalPlayerValue: number;
  totalPlayers: number;
  totalSchools: number;
  coverage: MapCoverage;
}

/**
 * Fold a flat list of places into one cluster per point.
 *
 * Two layers, deliberately kept apart:
 *
 *   - SCHOOLS are the named actors. Each keeps its own mark and short name;
 *     they are never merged into a count, because a viewer cheers for a name.
 *   - PLAYERS are the crowd. They are aggregated into a single count per
 *     point. Forty students in Delmas must read as WEIGHT — one mark whose
 *     area grows with the count — not as forty identical dots stacked on the
 *     same pixel, which at 1920×1080 is an unreadable blob that also lies
 *     about how many there are.
 *
 * A school's commune and a player's ville are different facts about different
 * people. A player's ville is where the STUDENT is (their leaderboard profile);
 * a school's commune is where the SCHOOL is. Students board and travel. This
 * function never uses one to stand in for the other, and neither should
 * anything downstream of it.
 *
 * Places that resolve to nothing are counted in `coverage`, never placed.
 */
export function buildMapLayers(places: MapPlace[]): MapLayout {
  const byKey = new Map<string, MapCluster>();
  const byDepartment: Record<string, number> = {};
  const unknown = new Set<string>();
  const coverage: MapCoverage = {
    schoolsPlaced: 0,
    schoolsUnplaced: 0,
    playersPlaced: 0,
    playersUnplaced: 0,
    offMap: [],
    offMapSchools: 0,
    offMapPlayers: 0,
    offMapValue: 0,
    unknownNames: [],
  };
  let totalPlayerValue = 0;
  let totalPlayers = 0;
  let totalSchools = 0;

  for (const place of places || []) {
    if (!place) continue;
    const isSchool = place.kind === 'school';
    if (isSchool) totalSchools += 1; else totalPlayers += 1;

    // The common case, not an edge case: all 94 seeded schools carry an empty
    // commune. An empty name is a school whose location nobody has typed in
    // yet — it is UNPLACED, and counted, because skipping it here is exactly
    // how twelve schools become nine on the broadcast with nothing said.
    // There is no name to report back, so it stays out of `unknownNames`.
    if (!place.name) {
      if (isSchool) coverage.schoolsUnplaced += 1;
      else coverage.playersUnplaced += 1;
      continue;
    }

    if (isOffMap(place.name)) {
      const weight = typeof place.value === 'number' ? place.value : (isSchool ? 0 : 1);
      coverage.offMap.push({ name: place.name, kind: place.kind, value: weight });
      coverage.offMapValue += weight;
      if (isSchool) coverage.offMapSchools += 1;
      else coverage.offMapPlayers += 1;
      continue;
    }

    const at = resolvePlace(place.name);
    if (!at) {
      unknown.add(String(place.name));
      if (isSchool) coverage.schoolsUnplaced += 1;
      else coverage.playersUnplaced += 1;
      continue;
    }

    const key = `${at.x}:${at.y}`;
    let cluster = byKey.get(key);
    if (!cluster) {
      cluster = {
        key,
        x: at.x,
        y: at.y,
        name: at.name,
        department: at.department,
        approximate: at.precision === 'department',
        schools: [],
        playerCount: 0,
        playerValue: 0,
        active: false,
      };
      byKey.set(key, cluster);
    }

    if (place.active) cluster.active = true;

    if (isSchool) {
      coverage.schoolsPlaced += 1;
      cluster.schools.push({
        id: place.id,
        label: place.label || at.name,
        value: typeof place.value === 'number' ? place.value : 0,
        active: !!place.active,
      });
    } else {
      const weight = typeof place.value === 'number' ? place.value : 1;
      coverage.playersPlaced += 1;
      cluster.playerCount += 1;
      cluster.playerValue += weight;
      totalPlayerValue += weight;
      if (at.department) {
        byDepartment[at.department] = (byDepartment[at.department] || 0) + weight;
      }
    }
  }

  coverage.unknownNames = Array.from(unknown);

  // North to south, then west to east: schools that need a label are laid out
  // in this order, so the ladder that separates colliding labels is stable
  // between renders instead of jumping when the array order changes.
  const clusters = Array.from(byKey.values()).sort((a, b) => (a.y - b.y) || (a.x - b.x));

  return {
    clusters,
    byDepartment,
    totalPlayerValue,
    totalPlayers,
    totalSchools,
    coverage,
  };
}

/* ── School labels ──────────────────────────────────────────────────────── */

export interface SchoolLabel {
  clusterKey: string;
  id: string;
  label: string;
  /** the mark the label belongs to */
  x: number;
  y: number;
  /** the end of the leader hairline, where the text sits */
  textX: number;
  textY: number;
  anchor: 'start' | 'end';
  active: boolean;
  approximate: boolean;
}

/** Nominal label type size in user units — mirrored by .hmap__school-label. */
export const LABEL_FONT = 17;
const LABEL_BOX_H = 21;
/** Above first (the name reads as flying the mark), then below. */
const LADDER = [-30, -52, -74, -96, -118, 30, 52, 74];

function labelWidth(text: string): number {
  // Plus Jakarta / Source Sans at 700 weight runs ~0.60em per uppercase glyph.
  return Math.max(26, text.length * LABEL_FONT * 0.6) + 14;
}

function overlaps(a: number[], b: number[]): boolean {
  return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
}

/**
 * Place the school names so they do not sit on top of each other.
 *
 * Communes around Port-au-Prince are five user units apart; their names are a
 * hundred wide. A broadcast map solves that with leader lines, so that is what
 * this does: each name climbs a short ladder from its mark until it finds
 * clear air. Deterministic — same clusters in, same layout out — because a
 * label that reshuffles on every poll is worse than one that overlaps.
 */
export function layoutSchoolLabels(clusters: MapCluster[]): SchoolLabel[] {
  const out: SchoolLabel[] = [];
  const taken: number[][] = [];

  for (const cluster of clusters) {
    for (const school of cluster.schools) {
      const anchor: 'start' | 'end' = cluster.x > MAP_WIDTH * 0.62 ? 'end' : 'start';
      const w = labelWidth(school.label);
      const dir = anchor === 'end' ? -1 : 1;
      const textX = cluster.x + dir * 11;

      let chosen = LADDER[0];
      for (const rung of LADDER) {
        const textY = cluster.y + rung;
        if (textY < LABEL_BOX_H || textY > MAP_HEIGHT - 6) continue;
        const left = anchor === 'end' ? textX - w : textX;
        const box = [left, textY - LABEL_BOX_H * 0.78, left + w, textY + LABEL_BOX_H * 0.3];
        if (!taken.some((t) => overlaps(box, t))) {
          chosen = rung;
          taken.push(box);
          break;
        }
      }

      out.push({
        clusterKey: cluster.key,
        id: school.id,
        label: school.label,
        x: cluster.x,
        y: cluster.y,
        textX,
        textY: cluster.y + chosen,
        anchor,
        active: school.active,
        approximate: cluster.approximate,
      });
    }
  }

  return out;
}

/* ── Density scale ──────────────────────────────────────────────────────── */

/**
 * Five flat steps, never a gradient. A projector in a school hall crushes
 * anything subtler, and the design language has no gradients in it anywhere.
 * Step 0 is "no data", which is a different statement from "very few" and is
 * drawn as bare land rather than as the palest shade.
 */
export const DENSITY_STEPS = 5;

/** Which step a département's total falls in: 0 = no data, 1..5 = shaded. */
export function densityStep(value: number, max: number): number {
  if (!value || value <= 0) return 0;
  if (!max || max <= 0) return 0;
  const step = Math.ceil((value / max) * DENSITY_STEPS);
  return Math.min(DENSITY_STEPS, Math.max(1, step));
}

/** The upper bound of each step, for the legend. */
export function densityBounds(max: number): number[] {
  const bounds: number[] = [];
  for (let i = 1; i <= DENSITY_STEPS; i += 1) {
    bounds.push(Math.ceil((max * i) / DENSITY_STEPS));
  }
  return bounds;
}

/**
 * Radius of the player crowd mark. Area grows with the count — that is the
 * whole point: a commune with 40 players has to LOOK four times the commune
 * with 10, and a linear radius would make it sixteen times and shout.
 */
export function crowdRadius(count: number): number {
  if (count <= 0) return 0;
  return round2(Math.min(34, 3.4 * Math.sqrt(count) + 2.6));
}
