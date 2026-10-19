/**
 * schoolBuilding — a deterministic pixel-art building for any school name.
 *
 * The Arène is an arcade, and in an arcade every team has a face. Schools have
 * no photos or logos we could use (and inventing them would put words in a
 * real school's mouth), so each school gets a building GENERATED from its
 * name: the same name always draws the same building, on every device, with
 * zero network requests.
 *
 * It is a drawing, not a likeness — wall colours are the painted-plaster
 * palette of a Haitian schoolyard, the roof is one of four silhouettes, and
 * the flag on the roof is the national one. Nothing on it claims anything
 * about the real school.
 *
 * Pure: returns a list of rects on a cell grid. `SchoolBuilding.tsx` renders
 * it as crisp SVG; tests pin determinism and bounds.
 */

export type Rect = { x: number; y: number; w: number; h: number; c: string };
export type RoofKind = 'flat' | 'gable' | 'dome' | 'tower';

export interface Building {
  width: number;
  height: number;
  rects: Rect[];
  roof: RoofKind;
  wall: string;
  floors: number;
}

// FNV-1a, the same seed function PixelAvatar uses.
export function hashSeed(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Painted plaster walls + the darker trim each one is paired with. */
const WALLS: Array<[string, string]> = [
  ['#F3E3C3', '#C9A66B'], // cream / ochre
  ['#9CC9F0', '#4A86C5'], // sky blue
  ['#F6D776', '#C99A2E'], // yellow
  ['#A8DCC5', '#3E9A78'], // mint
  ['#F4A99A', '#C8604B'], // salmon
  ['#C9B6E8', '#7D62B5'], // lilac
  ['#EEF2F7', '#8A9AB3'], // white
];
const ROOFS: RoofKind[] = ['flat', 'gable', 'dome', 'tower'];
const ROOF_COLORS = ['#B5452F', '#2F5D9E', '#3C7A55', '#6B4E3D'];
const GLASS = '#5B8DD6';
const GLASS_LIT = '#FFD966';
const DOOR = '#3A2A20';
const FLAG_BLUE = '#00209F';
const FLAG_RED = '#D21034';
const POLE = '#5C6B80';

export interface BuildingOptions {
  /** Floors, 1–8. Default comes from the name (2–4). A skyline passes a
   *  score-derived value so taller = stronger. */
  floors?: number;
  /** Night lights some windows. */
  night?: boolean;
}

export function buildSchool(name: string, opts: BuildingOptions = {}): Building {
  const seed = hashSeed(String(name || 'école').trim().toLowerCase());
  const rand = mulberry32(seed);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

  const [wall, trim] = pick(WALLS);
  const roof = pick(ROOFS);
  const roofColor = pick(ROOF_COLORS);
  const width = 14 + 2 * Math.floor(rand() * 4); // 14, 16, 18, 20 — even, so the door centres
  const nameFloors = 2 + Math.floor(rand() * 3);
  const floors = Math.max(1, Math.min(8, Math.round(opts.floors ?? nameFloors)));
  const floorH = 4;
  const roofH = roof === 'flat' ? 2 : roof === 'gable' ? Math.floor(width / 4) + 1 : roof === 'dome' ? 5 : 7;
  const flagH = 5;
  const bodyTop = flagH + roofH;
  const height = bodyTop + floors * floorH + 1;

  const rects: Rect[] = [];
  const put = (x: number, y: number, w: number, h: number, c: string) => rects.push({ x, y, w, h, c });

  // Body + base course + cornice.
  put(0, bodyTop, width, floors * floorH + 1, wall);
  put(0, height - 1, width, 1, trim);
  put(0, bodyTop, width, 1, trim);

  // Windows: a column every 3 cells, one row per floor; the ground floor
  // leaves the middle for the door.
  const cols: number[] = [];
  for (let x = 2; x + 2 <= width - 1; x += 3) cols.push(x);
  const mid = width / 2;
  for (let f = 0; f < floors; f += 1) {
    const y = bodyTop + 1 + f * floorH + 1;
    for (const x of cols) {
      const ground = f === floors - 1;
      if (ground && x + 2 > mid - 2 && x < mid + 2) continue;
      const lit = opts.night && rand() < 0.55;
      put(x, y, 2, 2, lit ? GLASS_LIT : GLASS);
    }
  }

  // Door, with a lintel in the trim colour.
  put(mid - 2, height - 4, 4, 3, DOOR);
  put(mid - 2, height - 5, 4, 1, trim);

  // Roof.
  let flagX = mid;
  let roofTop = bodyTop;
  if (roof === 'flat') {
    put(0, bodyTop - 2, width, 2, trim);
    for (let x = 1; x < width; x += 3) put(x, bodyTop - 2, 1, 1, wall); // crenels
    roofTop = bodyTop - 2;
    flagX = width - 5; // pole + 3-cell flag stay inside the wall
  } else if (roof === 'gable') {
    // A stepped triangle, one step per row.
    for (let r = 0; r < roofH; r += 1) {
      const inset = Math.min(r * 2, Math.floor(width / 2) - 1);
      put(inset, bodyTop - 1 - r, width - inset * 2, 1, roofColor);
    }
    roofTop = bodyTop - roofH;
  } else if (roof === 'dome') {
    put(0, bodyTop - 1, width, 1, trim);
    const dw = Math.max(6, Math.floor(width / 2));
    const dx = Math.floor((width - dw) / 2);
    put(dx + 2, bodyTop - 4, dw - 4, 1, roofColor);
    put(dx + 1, bodyTop - 3, dw - 2, 1, roofColor);
    put(dx, bodyTop - 2, dw, 1, roofColor);
    put(Math.floor(mid) - 1, bodyTop - 5, 2, 1, roofColor);
    roofTop = bodyTop - 5;
  } else {
    // Clock tower over the entrance.
    put(0, bodyTop - 1, width, 1, trim);
    put(mid - 3, bodyTop - 6, 6, 5, wall);
    put(mid - 3, bodyTop - 7, 6, 1, roofColor);
    put(mid - 1, bodyTop - 5, 2, 2, '#FFFFFF');
    put(mid - 1, bodyTop - 5, 1, 1, '#1F2937'); // the hand
    roofTop = bodyTop - 7;
  }

  // The national flag on a pole.
  const poleTop = Math.max(0, roofTop - flagH);
  put(flagX, poleTop, 1, roofTop - poleTop, POLE);
  put(flagX + 1, poleTop, 3, 1, FLAG_BLUE);
  put(flagX + 1, poleTop + 1, 3, 1, FLAG_RED);

  // Trim offset so the drawing sits at y=0 when the flag ends lower.
  const minY = Math.min(...rects.map((r) => r.y));
  if (minY > 0) rects.forEach((r) => { r.y -= minY; });

  return { width, height: height - minY, rects, roof, wall, floors };
}

export interface PaintLayer {
  c: string;
  /** One SVG path of axis-aligned rects ("M x y h w v h h -w Z" per rect). */
  d: string;
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * The same picture in far fewer nodes: rects merged into one path per colour,
 * WITHOUT changing paint order. A rect joins the latest layer of its colour
 * only when nothing painted in a later layer overlaps it; otherwise it opens
 * a new layer on top. Native SVG cost scales with nodes, so a ~60-rect
 * building becomes a handful of paths (the phone's city draws eight of them).
 */
export function paintLayers(rects: readonly Rect[]): PaintLayer[] {
  const layers: { c: string; d: string }[] = [];
  const painted: { rect: Rect; layer: number }[] = [];
  const seg = (r: Rect) => `M${r.x} ${r.y}h${r.w}v${r.h}h${-r.w}Z`;
  for (const r of rects) {
    let target = -1;
    for (let li = layers.length - 1; li >= 0; li -= 1) {
      if (layers[li].c === r.c) { target = li; break; }
    }
    // Anything in a LATER layer that overlaps r would end up under it.
    if (target >= 0 && painted.some((p) => p.layer > target && overlaps(p.rect, r))) target = -1;
    if (target < 0) {
      layers.push({ c: r.c, d: '' });
      target = layers.length - 1;
    }
    layers[target].d += seg(r);
    painted.push({ rect: r, layer: target });
  }
  return layers;
}
