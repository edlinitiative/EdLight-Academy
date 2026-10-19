/**
 * shared/geo/haitiDepartments — the ten département outlines and the
 * projection that draws them, where BOTH apps can read them.
 *
 * Moved out of src/data/haitiMapGeometry.ts (Oct 2026) so the phone's Mode
 * Histoire map draws the very same Haiti as the web map and the broadcast.
 * haitiMapGeometry re-exports everything here, so web imports are unchanged.
 * See that file's header for how the geometry was derived and what it is NOT
 * (a broadcast map, not a survey).
 *
 * Pure and typed: no React, no DOM, no imports.
 */

/** Same normaliser as haitiGeo.cityKey (accent/case/punctuation-insensitive). */
export function deptKey(s: unknown): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]+/g, '');
}

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

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ── Outlines ───────────────────────────────────────────────────────────── */

export type Ring = Array<[number, number]>;

/*
 * Each département is one or more closed rings of [lon, lat]. Rings after the
 * first are its islands — Île de la Gonâve and Pointe-à-Raquette belong to
 * Ouest, Île de la Tortue to Nord-Ouest, Île-à-Vache to Sud. Shared borders
 * reuse the same vertices on both sides so the fills meet without a seam.
 */
export const DEPARTMENT_RINGS: Record<string, Ring[]> = {
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

/* ── Paths ──────────────────────────────────────────────────────────────── */

const DEPARTMENT_INDEX = new Map<string, { name: string; value: Ring[] }>();
for (const name of Object.keys(DEPARTMENT_RINGS)) DEPARTMENT_INDEX.set(deptKey(name), { name, value: DEPARTMENT_RINGS[name] });

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
  const hit = DEPARTMENT_INDEX.get(deptKey(name));
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
  const hit = DEPARTMENT_INDEX.get(deptKey(name));
  if (!hit) return null;
  const cached = centroidCache.get(hit.name);
  if (cached) return cached;
  const c = ringCentroid(hit.value[0]);
  centroidCache.set(hit.name, c);
  return c;
}
