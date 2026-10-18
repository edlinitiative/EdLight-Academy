/**
 * The avatar drawing, as data. Framework-free: `buildAvatarScene` returns a
 * tree of plain SVG primitives that the web renderer (Avatar.tsx → react-dom)
 * and the Expo renderer (react-native-svg) both turn into elements, so the two
 * platforms draw the exact same student. DUPLICATED byte-for-byte at
 * mobile/src/components/arena/art/avatars/avatarScene.ts (parity test).
 *
 * viewBox 0 0 100 100. `cls` names are the web's animation hooks (avatars.css);
 * the phone ignores them.
 */
import { avatarTraits, type AvatarMood } from './traits';
import {
  AVATAR_HAIR_COLORS, AVATAR_SKIN_TONES, AVATAR_WRAPS, FRAME_COLORS, LONG_HAIRS, UNIFORM_HEX,
  type AvatarConfig, type UniformColor,
} from './avatarConfig';

export type SceneAttrs = Record<string, string | number>;
export interface SceneNode {
  k: 'path' | 'circle' | 'ellipse' | 'rect' | 'g';
  p: SceneAttrs;
  c?: SceneNode[];
  cls?: string;
  key?: string;
}

export interface AvatarScene {
  nodes: SceneNode[];
  /** School colours the backdrop + confetti use. */
  colors: { primary: string; secondary: string };
  blinkDelay: number;
}

const path = (d: string, p: SceneAttrs = {}): SceneNode => ({ k: 'path', p: { d, ...p } });
const circle = (cx: number, cy: number, r: number, p: SceneAttrs = {}): SceneNode => ({ k: 'circle', p: { cx, cy, r, ...p } });
const ellipse = (cx: number, cy: number, rx: number, ry: number, p: SceneAttrs = {}): SceneNode => ({ k: 'ellipse', p: { cx, cy, rx, ry, ...p } });
const rect = (x: number, y: number, width: number, height: number, p: SceneAttrs = {}): SceneNode => ({ k: 'rect', p: { x, y, width, height, ...p } });
const g = (c: SceneNode[], extra: Partial<SceneNode> = {}): SceneNode => ({ k: 'g', p: {}, ...extra, c });
/** A round-capped stroke. */
const L = (d: string, stroke: string, w: number, p: SceneAttrs = {}): SceneNode =>
  path(d, { fill: 'none', stroke, strokeWidth: w, strokeLinecap: 'round', strokeLinejoin: 'round', ...p });

/* ── geometry ───────────────────────────────────────────────── */

const HEADS: Record<AvatarConfig['face'], string> = {
  oval: 'M29,43C29,27 38,19 50,19C62,19 71,27 71,43C71,57 62,67 50,67C38,67 29,57 29,43Z',
  round: 'M28.2,44C28.2,27 38,19 50,19C62,19 71.8,27 71.8,44C71.8,57.6 63,66 50,66C37,66 28.2,57.6 28.2,44Z',
  long: 'M30,43C30,26.4 38.6,18.6 50,18.6C61.4,18.6 70,26.4 70,43C70,58.4 62,68.8 50,68.8C38,68.8 30,58.4 30,43Z',
};
const CAP = 'M28.4,44C27,26 37,16.6 50,16.6C63,16.6 73,26 71.6,44C70.6,38 68.6,34 66,31.6C61,29.6 56,29.2 50,29.6C44,29.2 39,29.6 34,31.6C31.4,34 29.4,38 28.4,44Z';
const FADE_TOP = 'M31.2,35C30.4,20.5 38.6,13.4 50,13.4C61.4,13.4 69.6,20.5 68.8,35C65.4,30.8 59.6,29.4 50,29.6C40.4,29.4 34.6,30.8 31.2,35Z';
const WRAP = 'M26.6,42C24,19.5 35,7.5 50,7.5C65,7.5 76,19.5 73.4,42C68,33.6 59,30.2 50,30.2C41,30.2 32,33.6 26.6,42Z';

/** Circle with a coiled, scalloped edge — afros, puffs, buns, twists. */
export function coils(cx: number, cy: number, r: number, n: number): string {
  let d = '';
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const x = (cx + r * Math.cos(a)).toFixed(1);
    const y = (cy + r * Math.sin(a)).toFixed(1);
    if (i === 0) d += `M${x},${y}`;
    else d += `A${(r * 0.36).toFixed(1)},${(r * 0.36).toFixed(1)} 0 0 1 ${x},${y}`;
  }
  return d + 'Z';
}

const f1 = (n: number) => +n.toFixed(2);

/** Hanging strands either side of the face (locs, long braids). */
function strands(count: number, reach: number): string {
  let d = '';
  for (let i = 0; i < count; i++) {
    const x = 31.5 - i * 1.4;
    const end = reach + i * 2;
    d += `M${x},34L${f1(x - 3 - i * 1.6)},${end}`;
    const xr = 100 - x;
    d += `M${xr},34L${f1(xr + 3 + i * 1.6)},${end}`;
  }
  return d;
}

function hairLayers(cfg: AvatarConfig, base: string, hi: string, ribbon: string) {
  const back: SceneNode[] = [];
  const front: SceneNode[] = [];
  const capped = () => front.push(path(CAP, { fill: base }));
  switch (cfg.hair) {
    case 'afro':
      back.push(path(coils(50, 31.5, 28.5, 16), { fill: base }));
      capped();
      front.push(L('M37,14.5q3-2.6 6-1.8M57,12.6q3.4.2 5.4 2.6M68,22q1.8 2.6 1.8 5', hi, 1.3, { opacity: 0.8 }));
      break;
    case 'puffs':
      back.push(path(coils(28.5, 21, 11, 9), { fill: base }));
      back.push(path(coils(71.5, 21, 11, 9), { fill: base }));
      capped();
      front.push(L('M50,17.2V29', hi, 1));
      front.push(L('M24,16.5q2.4-2.4 5.4-2M66,14.5q3-.6 5.4 1.4', hi, 1.2, { opacity: 0.8 }));
      break;
    case 'cornrows':
      capped();
      front.push(L('M35,32.5Q36,22 44,17.6M41.6,30.2Q42.6,21 47.4,17M50,29.6V16.8M58.4,30.2Q57.4,21 52.6,17M65,32.5Q64,22 56,17.6', '#000', 1.1, { opacity: 0.5 }));
      front.push(L('M38.4,30.6Q39.4,21.4 45.6,17.6M46,29.6Q46.4,20.4 48.8,17M54,29.6Q53.6,20.4 51.2,17M61.6,30.6Q60.6,21.4 54.4,17.6', hi, 0.9, { strokeDasharray: '1.6 1.1' }));
      break;
    case 'locs':
      back.push(L(strands(4, 70), base, 4.4));
      back.push(L('M27.5,48l-1.2,8M74.5,50l1.2,8M25.6,60l-1,6M75.8,62l.8,5', hi, 0.9));
      capped();
      front.push(L('M36,31Q37.5,22 45,17.8M50,29.6V17M64,31Q62.5,22 55,17.8', hi, 1, { strokeDasharray: '2.2 1.4' }));
      break;
    case 'longbraids': {
      const d = strands(4, 84);
      back.push(L(d, base, 4.8));
      back.push(L(d, hi, 1.1, { strokeDasharray: '1.3 1.5', opacity: 0.85 }));
      [[23.6, 84], [76.4, 84], [20.6, 90], [79.4, 90]].forEach(([x, y]) => back.push(circle(x, y, 1.5, { fill: ribbon })));
      capped();
      front.push(L('M35,32.5Q37,22 46,17.4M42,30.2Q44,21.4 48.6,17M58,30.2Q56,21.4 51.4,17M65,32.5Q63,22 54,17.4', hi, 1, { strokeDasharray: '1.6 1.2' }));
      break;
    }
    case 'braids':
      back.push(path(coils(50, 12.5, 8.2, 9), { fill: base }));
      capped();
      front.push(L('M35,32.5Q38,22 47.6,16.6M42,30.2Q44.4,21.6 49,16.6M58,30.2Q55.6,21.6 51,16.6M65,32.5Q62,22 52.4,16.6', hi, 1, { strokeDasharray: '1.8 1.2' }));
      front.push(L('M45.5,9.5q4.5-2.4 9 0', hi, 1));
      break;
    case 'bun':
      back.push(circle(50, 11.6, 8.4, { fill: base }));
      capped();
      front.push(L('M34,31.6Q38,20 48,16.8M66,31.6Q62,20 52,16.8M42,29.6Q45,20 49.2,16.8M58,29.6Q55,20 50.8,16.8', hi, 0.9, { opacity: 0.7 }));
      front.push(L('M44.4,9.6q5.6-3.4 11.2 0', hi, 1.1, { opacity: 0.8 }));
      front.push(L('M43.2,16.2Q50,13.4 56.8,16.2', ribbon, 1.8));
      break;
    case 'ponytail':
      back.push(path('M60,17.4C74,14.6 81,26 78.6,40C77.2,49 73.6,56.6 69.6,61.6C70.8,52 71.4,42.6 67.8,33.4C66.4,28 64,22 60,17.4Z', { fill: base }));
      back.push(L('M73.6,30Q76,40 72.8,52', hi, 1, { opacity: 0.7 }));
      capped();
      front.push(L('M34,31.6Q38,21 49,17M44,29.4Q50,21 63,19.6', hi, 0.9, { opacity: 0.7 }));
      front.push(ellipse(64.6, 19.2, 2.6, 1.8, { fill: ribbon, transform: 'rotate(28 64.6 19.2)' }));
      break;
    case 'twists':
      back.push(path(coils(50, 27.6, 24, 22), { fill: base }));
      capped();
      front.push(L('M35,26q2-2 4 0M42,20q2-2 4 0M54,20q2-2 4 0M61,26q2-2 4 0M48,14.4q2-2 4 0M38.6,31q2-2 4 0M57.4,31q2-2 4 0', hi, 1, { opacity: 0.8 }));
      break;
    case 'bantu':
      capped();
      front.push(L('M41,30L44,17.6M59,30L56,17.6M50,29.6V14.6', '#000', 0.9, { opacity: 0.35 }));
      [[33.8, 24.8, 5.2], [43.4, 16.4, 5.4], [56.6, 16.4, 5.4], [66.2, 24.8, 5.2], [50, 11.2, 4.6]].forEach(([x, y, r]) => {
        front.push(path(coils(x, y, r, 7), { fill: base }));
        front.push(L(`M${f1(x - r * 0.5)},${f1(y - r * 0.2)}q${f1(r * 0.5)},${f1(-r * 0.6)} ${f1(r)},0`, hi, 0.9, { opacity: 0.85 }));
      });
      break;
    case 'shaved':
      front.push(path(CAP, { fill: base, opacity: 0.32 }));
      break;
    case 'fade':
      front.push(path(CAP, { fill: base, opacity: 0.5 }));
      front.push(path(FADE_TOP, { fill: base }));
      front.push(L('M36,22.5Q50,14.5 64,22.5M33.6,28.6Q50,19.4 66.4,28.6M40,17.4Q50,13.4 60,17.4', hi, 1.3, { strokeDasharray: '0.1 2.3', opacity: 0.9 }));
      break;
    case 'crop':
    default:
      capped();
      front.push(L('M40,20q5-2 10-1.8', hi, 1.1, { opacity: 0.7 }));
  }

  if (cfg.headwear === 'moushwa') {
    // The wrap covers the crown: only long styles still show below it.
    const keepBack = LONG_HAIRS.includes(cfg.hair) && cfg.hair !== 'ponytail';
    const wrap = AVATAR_WRAPS[cfg.wrap % AVATAR_WRAPS.length];
    return {
      back: keepBack ? back : [],
      front: [
        path(CAP, { fill: base }),
        path(WRAP, { fill: wrap[0] }),
        L('M32.5,22Q50,12.5 67.5,22M29.6,30.6Q50,19.6 70.4,30.6', wrap[1], 1.2, { opacity: 0.75 }),
        L('M41.6,9.8Q39.6,20 40.8,30.4M50,8V29.6M58.4,9.8Q60.4,20 59.2,30.4', wrap[1], 0.8, { opacity: 0.5 }),
        L('M36,14Q45,21 43,30.4M30,27.5Q37,25.5 41,30.8', '#000', 1.1, { opacity: 0.18 }),
        L('M27.6,37.6C33,31.4 41,29 50,29S67,31.4 72.4,37.6', '#000', 1.6, { opacity: 0.18 }),
        ellipse(53, 10.4, 7, 4.2, { transform: 'rotate(-28 53 10.4)', fill: wrap[0], stroke: '#000', strokeOpacity: 0.22, strokeWidth: 0.8 }),
        ellipse(61.6, 11.4, 6, 3.8, { transform: 'rotate(38 61.6 11.4)', fill: wrap[0], stroke: '#000', strokeOpacity: 0.22, strokeWidth: 0.8 }),
        L('M50,10.6q3.4-2 6.6-.6M58.6,9.6q2.6.8 4.6 3.4', wrap[1], 1, { opacity: 0.8 }),
      ],
    };
  }
  if (cfg.headwear === 'riban') {
    // A school ribbon headband with a bow above the left temple.
    front.push(L('M30.4,33.6Q33.6,20.4 50,18.8Q66.4,20.4 69.6,33.6', ribbon, 2.4));
    front.push(path('M35.4,23.4L28.6,18.6Q27,22.8 29.4,26.6ZM35.4,23.4L39.6,16.4Q35.2,15.2 32.2,18.2Z', { fill: ribbon, stroke: '#000', strokeOpacity: 0.18, strokeWidth: 0.6 }));
    front.push(circle(35.4, 23.4, 1.7, { fill: ribbon, stroke: '#000', strokeOpacity: 0.22, strokeWidth: 0.6 }));
  }
  return { back, front };
}

/* Per-mood face recipe. brows: [outer, mid, inner] y · lids: how far the upper /
 * lower lid closes · gaze: iris offset. */
const FACE: Record<AvatarMood, { brows: [number, number, number]; top: number; bottom: number; gaze: [number, number] }> = {
  idle: { brows: [39.2, 37.8, 38.8], top: 0, bottom: 0, gaze: [0, 0.2] },
  ready: { brows: [38.0, 38.4, 40.2], top: 1.1, bottom: 0.7, gaze: [0, 0] },
  focused: { brows: [38.2, 38.8, 40.8], top: 1.9, bottom: 0.4, gaze: [0.5, 0.9] },
  celebrating: { brows: [37.0, 35.0, 36.4], top: 0, bottom: 0, gaze: [0, 0] },
  recovering: { brows: [38.0, 37.0, 38.4], top: 0.2, bottom: 1.4, gaze: [0, -0.2] },
};

const INK = '#22120D';
const LIP = '#2B120E';

type Traits = ReturnType<typeof avatarTraits>;

function face(mood: AvatarMood, t: Traits, cfg: AvatarConfig, skin: string, shade: string, browColor: string): SceneNode {
  const s = t.eyeSize;
  const lx = 41 - t.eyeGap * 0.5;
  const rx = 59 + t.eyeGap * 0.5;
  const ey = 46;
  const w = 5.4 + t.smile * 1.1;
  const f = FACE[mood];

  const brow = (cx: number, side: 1 | -1, lift = 0) => {
    const [o, m, i] = f.brows;
    const outer = cfg.brows === 'arched' ? o + 0.5 : o;
    const mid = cfg.brows === 'straight' ? (o + i) / 2 - 0.4 : cfg.brows === 'arched' ? m - 2.3 : m - 1.2;
    return `M${f1(cx - 3.9 * side)},${f1(outer - lift)}Q${f1(cx)},${f1(mid - lift)} ${f1(cx + 3.9 * side)},${f1(i - lift)}`;
  };

  const eye = (cx: number): SceneNode => {
    if (mood === 'celebrating') {
      return L(`M${f1(cx - 3.5)},${ey + 1}Q${f1(cx)},${ey - 3.8} ${f1(cx + 3.5)},${ey + 1}`, INK, 2.2);
    }
    const ex = 3.5 * s;
    const eyy = 3.75 * s;
    const ix = cx + f.gaze[0];
    const iy = ey + f.gaze[1];
    const tEnd = ey - 0.9 * s + f.top * 0.35;
    const tMid = ey - eyy + f.top;
    const tCtl = f1(2 * tMid - tEnd);
    const bEnd = ey + 0.7 * s - f.bottom * 0.2;
    const bMid = ey + eyy - f.bottom;
    const bCtl = f1(2 * bMid - bEnd);
    const x0 = f1(cx - ex - 0.6);
    const x1 = f1(cx + ex + 0.6);
    const kids: SceneNode[] = [
      ellipse(cx, ey, ex, eyy, { fill: '#FFFBF4' }),
      ellipse(ix, iy, 2.5 * s, 3.05 * s, { fill: INK }),
      circle(ix + 0.95, iy - 1, 0.95, { fill: '#fff' }),
      circle(ix - 0.8, iy + 1.05, 0.42, { fill: '#fff', opacity: 0.8 }),
    ];
    if (f.bottom > 0) kids.push(path(`M${x0},${f1(bEnd)}Q${f1(cx)},${bCtl} ${x1},${f1(bEnd)}V${ey + 5}H${x0}Z`, { fill: skin }));
    kids.push(path(`M${x0},${f1(tEnd)}Q${f1(cx)},${tCtl} ${x1},${f1(tEnd)}V${ey - 6}H${x0}Z`, { fill: skin }));
    kids.push(L(`M${f1(cx - ex - 0.3)},${f1(tEnd + 0.2)}Q${f1(cx)},${tCtl} ${f1(cx + ex + 0.3)},${f1(tEnd - 0.2)}`, INK, 1.5));
    return g(kids);
  };

  let mouth: SceneNode[];
  switch (mood) {
    case 'ready':
      mouth = [L(`M${f1(50 - w - 1.2)},56.2l.9,.8Q50,59.6 ${f1(50 + w + 0.3)},57l.9,-.8`, LIP, 1.9)];
      break;
    case 'focused':
      mouth = [L('M47.8,58.5Q50.6,57.6 53.2,58.7', LIP, 1.8)];
      break;
    case 'celebrating':
      mouth = [
        path(`M${f1(50 - w - 1)},55.4Q50,57 ${f1(50 + w + 1)},55.4Q${f1(50 + w)},64.6 50,64.8Q${f1(50 - w)},64.6 ${f1(50 - w - 1)},55.4Z`, { fill: '#3A1111' }),
        path(`M${f1(50 - w + 0.2)},56.1Q50,57.4 ${f1(50 + w - 0.2)},56.1L${f1(50 + w - 1)},58.3Q50,59.3 ${f1(50 - w + 1)},58.3Z`, { fill: '#FFF8F0' }),
        path('M46,63.2Q50,60.4 54,63.2Q50,64.9 46,63.2Z', { fill: '#D9676A' }),
      ];
      break;
    case 'recovering':
      mouth = [
        path(`M${f1(50 - w + 0.4)},56.6Q50,58.2 ${f1(50 + w + 0.4)},55.6Q${f1(50 + w - 1)},61.4 50.4,61.5Q${f1(50 - w + 1.4)},61 ${f1(50 - w + 0.4)},56.6Z`, { fill: '#3A1111' }),
        path(`M${f1(50 - w + 1)},56.9Q50,58.3 ${f1(50 + w - 0.2)},56L${f1(50 + w - 1)},57.7Q50,59.1 ${f1(50 - w + 1.6)},58.3Z`, { fill: '#FFF8F0' }),
        L(`M${f1(50 + w + 1)},54.9l.8,1.2`, LIP, 1.1),
      ];
      break;
    default:
      mouth = [L(`M${f1(50 - w)},56.9Q50,${f1(60.4 + t.smile * 0.7)} ${f1(50 + w)},56.9`, LIP, 1.8)];
  }

  const kids: SceneNode[] = [];
  const blushBase = mood === 'celebrating' ? 0.36 : mood === 'recovering' ? 0.26 : 0.2;
  const blush = cfg.cheeks === 'plain' ? 0 : cfg.cheeks === 'dimples' ? blushBase * 0.6 : blushBase;
  if (blush > 0) {
    kids.push(ellipse(36.2, 53.8, 3.6, 2.1, { fill: '#E5604C', opacity: f1(blush) }));
    kids.push(ellipse(63.8, 53.8, 3.6, 2.1, { fill: '#E5604C', opacity: f1(blush) }));
  }
  if (cfg.marks === 'freckles') {
    const dots = [[36.4, 51], [39.2, 52.4], [34.6, 53], [37.6, 54.2], [63.6, 51], [60.8, 52.4], [65.4, 53], [62.4, 54.2]];
    kids.push(g(dots.map(([x, y]) => circle(x, y, 0.55, {})), { p: { fill: '#000', opacity: 0.24 } }));
  }
  kids.push(g([eye(lx), eye(rx)], { cls: 'av-eyes' }));
  const lift = mood === 'recovering' ? 0.9 : 0;
  kids.push(L(brow(lx, 1) + brow(rx, -1, lift), browColor, t.browWeight));
  kids.push(L('M48.5,51.4Q50,53.7 51.5,51.4', shade, 1.5));
  kids.push(...mouth);
  if (cfg.cheeks === 'dimples' && mood !== 'focused') {
    kids.push(L(`M${f1(50 - w - 1.6)},56.2q-.7,1.2 .1,2.3M${f1(50 + w + 1.6)},56.2q.7,1.2 -.1,2.3`, shade, 0.9));
  }
  if (cfg.marks === 'beauty') kids.push(circle(60.8, 56.2, 0.8, { fill: INK, opacity: 0.8 }));
  if (mood === 'recovering') kids.push({ ...L('M76.5,25.5l3.2-3.2M78.6,31h4.2M73.4,21.2l.9-4.2', '#F2C230', 1.6), cls: 'av-spark' });
  return g(kids, { cls: 'av-face', key: `face-${mood}` });
}

function glasses(cfg: AvatarConfig, t: Traits): SceneNode | null {
  if (cfg.glasses === 'none') return null;
  const frame = FRAME_COLORS[cfg.frame % FRAME_COLORS.length];
  const l = 41 - t.eyeGap * 0.5;
  const r = 59 + t.eyeGap * 0.5;
  const bridge = 'M46.4,45.4Q50,43.8 53.6,45.4M35.4,44.6L30.4,43.4M64.6,44.6L69.6,43.4';
  const p: SceneAttrs = { fill: '#fff', fillOpacity: 0.12, stroke: frame, strokeWidth: 1.3 };
  if (cfg.glasses === 'round') {
    return g([circle(l, 46, 5.5), circle(r, 46, 5.5), path(bridge, { fill: 'none' })], { p });
  }
  if (cfg.glasses === 'square') {
    return g([
      rect(f1(l - 5.7), 41.6, 11.4, 8.8, { rx: 2.4 }),
      rect(f1(r - 5.7), 41.6, 11.4, 8.8, { rx: 2.4 }),
      path(bridge, { fill: 'none' }),
    ], { p });
  }
  // browline: heavy top bar, fine lower rim
  return g([
    rect(f1(l - 5.6), 41.8, 11.2, 8.4, { rx: 3.4, strokeWidth: 0.8 }),
    rect(f1(r - 5.6), 41.8, 11.2, 8.4, { rx: 3.4, strokeWidth: 0.8 }),
    L(`M${f1(l - 5.8)},43.4Q${f1(l)},40.6 ${f1(l + 5.8)},43Q50,42.4 ${f1(r - 5.8)},43Q${f1(r)},40.6 ${f1(r + 5.8)},43.4`, frame, 2.2),
    path('M35.4,44.2L30.4,43.2M64.6,44.2L69.6,43.2', { fill: 'none' }),
  ], { p: { ...p, strokeWidth: 1.1 } });
}

const colorOf = (c: UniformColor, school: string): string => (c === 'ecole' ? school : UNIFORM_HEX[c]);

/** Uniform layers: shoulders (silhouette by presentation), neck, collar, closure, badge. */
function uniform(cfg: AvatarConfig, shirt: string, tie: string, skin: string, shade: string): SceneNode[] {
  const dx = cfg.presentation === 'fille' ? 3 : cfg.presentation === 'garçon' ? -3 : 0;
  const a = 10 + dx;
  const b = 90 - dx;
  const out: SceneNode[] = [
    path(`M${a},100C${a},84 ${22 + dx * 0.6},75.5 38,73L62,73C${78 - dx * 0.6},75.5 ${b},84 ${b},100Z`, { fill: shirt }),
    path(`M${a},100C${a},90 ${a + 4},84 ${a + 10},80.5Q${a + 8},90 ${a + 9},100ZM${b},100C${b},90 ${b - 4},84 ${b - 10},80.5Q${b - 8},90 ${b - 9},100Z`, { fill: '#000', opacity: 0.1 }),
  ];
  const outline: SceneAttrs = { stroke: '#000', strokeOpacity: 0.18, strokeWidth: 0.6, strokeLinejoin: 'round' };
  const closed = cfg.uniform === 'cravate' || cfg.uniform === 'noeud';
  const vBottom = closed ? 75.6 : cfg.uniform === 'polo' ? 76.4 : cfg.uniform === 'blouse' ? 77 : 80.5;
  out.push(path(`M42.5,58H57.5V72L50,${vBottom}L42.5,72Z`, { fill: skin }));
  out.push(path('M42.5,59.5Q50,67 57.5,59.5V65Q50,71 42.5,65Z', { fill: shade }));
  // collar band behind the neck
  out.push(path('M40.6,70.4Q50,67.8 59.4,70.4L58.4,73.4Q50,71.2 41.6,73.4Z', { fill: cfg.uniform === 'blouse' ? tie : shirt, ...outline }));

  switch (cfg.uniform) {
    case 'chemise':
      out.push(L('M50,80.5V100', '#000', 0.9, { opacity: 0.2 }));
      out.push(circle(50, 88, 0.95, { fill: tie }), circle(50, 95, 0.95, { fill: tie }));
      out.push(path('M40.8,70.6L50,80.5L43.6,87.4L35.2,74.6ZM59.2,70.6L50,80.5L56.4,87.4L64.8,74.6Z', { fill: shirt, stroke: tie, strokeOpacity: 0.6, strokeWidth: 0.8, strokeLinejoin: 'round' }));
      break;
    case 'blouse':
      out.push(L('M50,77V100', '#000', 0.9, { opacity: 0.2 }));
      out.push(circle(50, 85, 0.95, { fill: tie }), circle(50, 92, 0.95, { fill: tie }));
      out.push(path('M40.8,70.6L50,77C48.6,82.6 43.4,84.6 38.6,82.2C35.6,80.6 34.6,77.4 35.4,74.8ZM59.2,70.6L50,77C51.4,82.6 56.6,84.6 61.4,82.2C64.4,80.6 65.4,77.4 64.6,74.8Z', { fill: tie, ...outline }));
      break;
    case 'polo':
      out.push(L('M50,76.4V86.4', '#000', 0.9, { opacity: 0.2 }));
      out.push(circle(50, 80, 0.85, { fill: tie }), circle(50, 84.4, 0.85, { fill: tie }));
      out.push(path('M40.8,70.6L50,76.4L44.6,81.4L35.6,74.6ZM59.2,70.6L50,76.4L55.4,81.4L64.4,74.6Z', { fill: shirt, stroke: tie, strokeWidth: 1.3, strokeLinejoin: 'round' }));
      out.push(L('M19.6,96Q22,92 26,90.6M80.4,96Q78,92 74,90.6', tie, 1.4, { opacity: 0.9 }));
      break;
    case 'cravate':
      out.push(path('M48.4,77.2L46.6,92.4L50,97L53.4,92.4L51.6,77.2Z', { fill: tie, ...outline }));
      out.push(L('M47.6,85.6L52.6,81.6M47,91.2L53,86.4', '#fff', 0.8, { opacity: 0.22 }));
      out.push(path('M47.4,73.8H52.6L51.6,77.6H48.4Z', { fill: tie, ...outline }));
      out.push(path('M40.8,70.6L50,75.6L45,82.4L35.4,74.8ZM59.2,70.6L50,75.6L55,82.4L64.6,74.8Z', { fill: shirt, stroke: tie, strokeOpacity: 0.6, strokeWidth: 0.8, strokeLinejoin: 'round' }));
      break;
    case 'noeud':
      out.push(L('M50,78V100', '#000', 0.9, { opacity: 0.2 }));
      out.push(circle(50, 88, 0.95, { fill: tie }), circle(50, 95, 0.95, { fill: tie }));
      out.push(path('M40.8,70.6L50,75.6L45,82.4L35.4,74.8ZM59.2,70.6L50,75.6L55,82.4L64.6,74.8Z', { fill: shirt, stroke: tie, strokeOpacity: 0.6, strokeWidth: 0.8, strokeLinejoin: 'round' }));
      out.push(path('M50,76.6L43.4,73.2Q42.2,76.6 43.4,80ZM50,76.6L56.6,73.2Q57.8,76.6 56.6,80Z', { fill: tie, ...outline }));
      out.push(rect(48.2, 74.8, 3.6, 3.6, { rx: 1, fill: tie, ...outline }));
      break;
  }
  // School pocket patch (a plain star, no logo).
  out.push(path('M61.2,86.4H67.2V90.4Q67.2,93.4 64.2,94.6Q61.2,93.4 61.2,90.4Z', { fill: tie, stroke: '#000', strokeOpacity: 0.15, strokeWidth: 0.5 }));
  out.push(path('M64.2,88l.7,1.5 1.6.2-1.2 1 .3 1.6-1.4-.8-1.4.8.3-1.6-1.2-1 1.6-.2Z', { fill: shirt }));
  return out;
}

export function buildAvatarScene({
  seed, config, mood, colors, small,
}: {
  seed: string;
  config: AvatarConfig;
  mood: AvatarMood;
  colors?: { primary: string; secondary: string };
  small: boolean;
}): AvatarScene {
  const t = avatarTraits(String(seed ?? ''));
  const cfg = config;
  const c = colors ?? t.colors;
  const [skin, shade] = AVATAR_SKIN_TONES[cfg.skin % AVATAR_SKIN_TONES.length];
  const [hair, hi] = AVATAR_HAIR_COLORS[cfg.hairColor % AVATAR_HAIR_COLORS.length];
  const browColor = cfg.hairColor < 4 ? hair : AVATAR_HAIR_COLORS[2][0];
  const shirt = colorOf(cfg.shirt, c.primary);
  const tie = colorOf(cfg.tie, c.secondary);
  const hl = hairLayers(cfg, hair, hi, tie);

  const head: SceneNode[] = [
    ...hl.back,
    ellipse(29.6, 45.5, 3.7, 5.2, { fill: skin }),
    ellipse(70.4, 45.5, 3.7, 5.2, { fill: skin }),
    ellipse(29.9, 46, 1.6, 2.9, { fill: shade }),
    ellipse(70.1, 46, 1.6, 2.9, { fill: shade }),
    path(HEADS[cfg.face] || HEADS.oval, { fill: skin }),
  ];
  if (cfg.earrings && !small) head.push(circle(29, 51.2, 1.15, { fill: '#F2C230' }), circle(71, 51.2, 1.15, { fill: '#F2C230' }));
  head.push(...hl.front);
  head.push(face(mood, t, cfg, skin, shade, browColor));
  const gl = glasses(cfg, t);
  if (gl) head.push(gl);

  const nodes: SceneNode[] = [
    g([
      g([
        ...uniform(cfg, shirt, tie, skin, shade),
        g([g(head, { cls: 'av-hanim' })], { cls: 'av-hpose' }),
      ], { cls: 'av-pose' }),
    ], { cls: 'av-body' }),
  ];
  return { nodes, colors: c, blinkDelay: t.blinkDelay };
}
