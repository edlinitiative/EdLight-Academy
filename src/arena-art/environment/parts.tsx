import React from 'react';

/**
 * Building blocks of the Arène night world: palette, seeded randomness,
 * shared <defs> (gradients + reusable symbols) and the parametric pieces
 * (ridges, city rows, stadium, palms, lamps, bunting, tap-tap) that the
 * wide and tall compositions arrange differently.
 */

export type Occasion = 'everyday' | 'match' | 'championship';

export const C = {
  sky0: '#060E22',
  sky1: '#0C1D44',
  far: '#1A3470',
  mid: '#13285F',
  near: '#0E2152',
  district: '#0B1A45',
  city: '#0F2257',
  fg: '#050B1D',
  street: '#070F27',
  sodium: '#FFB65C',
  win: '#FFE6A8',
  flood: '#EAF2FF',
  coral: '#FF6A45',
  gold: '#FFB92E',
  moon: '#F3EEDC',
  rim: '#3B5CA6',
};

/** Deterministic PRNG so every render of a composition is identical. */
export function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export type Pt = [number, number];

/** Smooth open ridge line through points (quadratic midpoint smoothing). */
export function ridgeLine(pts: Pt[]): string {
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += `Q${r1(pts[i][0])} ${r1(pts[i][1])} ${r1(mx)} ${r1(my)}`;
  }
  const l = pts[pts.length - 1];
  return `${d}L${r1(l[0])} ${r1(l[1])}`;
}

export function ridgePath(pts: Pt[], bottom: number): string {
  const l = pts[pts.length - 1];
  return `${ridgeLine(pts)}L${l[0]} ${bottom}L${pts[0][0]} ${bottom}Z`;
}

/** Linear interpolation of a ridge's height at x (close enough for scattering lights). */
export function ridgeY(pts: Pt[], x: number): number {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    if (x >= x0 && x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return pts[pts.length - 1][1];
}

/* ------------------------------------------------------------------ */
/* Shared defs                                                         */
/* ------------------------------------------------------------------ */

export function Defs({ p }: { p: string }) {
  const radial = (id: string, color: string, op: number, mid = 0.35) => (
    <radialGradient id={p + id}>
      <stop offset="0" stopColor={color} stopOpacity={op} />
      <stop offset={mid} stopColor={color} stopOpacity={op * 0.45} />
      <stop offset="1" stopColor={color} stopOpacity="0" />
    </radialGradient>
  );
  return (
    <defs>
      <linearGradient id={p + 'sky'} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={C.sky0} />
        <stop offset="0.62" stopColor={C.sky1} />
        <stop offset="1" stopColor="#13285C" />
      </linearGradient>
      <linearGradient id={p + 'haze'} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={C.sodium} stopOpacity="0" />
        <stop offset="1" stopColor={C.sodium} stopOpacity="0.2" />
      </linearGradient>
      <linearGradient id={p + 'hazeG'} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={C.gold} stopOpacity="0" />
        <stop offset="1" stopColor={C.gold} stopOpacity="0.16" />
      </linearGradient>
      <linearGradient id={p + 'cit'} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#0E2255" />
        <stop offset="0.75" stopColor="#14306A" />
        <stop offset="1" stopColor={C.far} />
      </linearGradient>
      <linearGradient id={p + 'stands'} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#1E3878" />
        <stop offset="1" stopColor="#142A63" />
      </linearGradient>
      <linearGradient id={p + 'facade'} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#1C3675" />
        <stop offset="1" stopColor="#0E1E4C" />
      </linearGradient>
      <linearGradient id={p + 'field'} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#2D7A63" />
        <stop offset="1" stopColor="#1F5C55" />
      </linearGradient>
      <linearGradient id={p + 'fieldDim'} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#173E48" />
        <stop offset="1" stopColor="#123241" />
      </linearGradient>
      <linearGradient id={p + 'beam'} x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor={C.flood} stopOpacity="0.34" />
        <stop offset="0.6" stopColor={C.flood} stopOpacity="0.08" />
        <stop offset="1" stopColor={C.flood} stopOpacity="0" />
      </linearGradient>
      <linearGradient id={p + 'column'} x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor={C.gold} stopOpacity="0.42" />
        <stop offset="1" stopColor={C.gold} stopOpacity="0" />
      </linearGradient>
      <linearGradient id={p + 'trophy'} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#FFE7A6" />
        <stop offset="0.45" stopColor={C.gold} />
        <stop offset="1" stopColor="#B87412" />
      </linearGradient>
      <linearGradient id={p + 'street'} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#0B1736" />
        <stop offset="1" stopColor="#040917" />
      </linearGradient>
      {radial('halo', '#DCE6FF', 0.32, 0.18)}
      {radial('lamp', C.sodium, 0.6)}
      {radial('pool', C.sodium, 0.34, 0.5)}
      {radial('flood', C.flood, 0.65, 0.25)}
      {radial('dome', '#BFD3FF', 0.26, 0.45)}
      {radial('gold', C.gold, 0.55, 0.3)}
      {radial('warm', '#FF9A4A', 0.22, 0.5)}

      {/* A single drooping palm frond, pointing +x, 100 long. */}
      <path
        id={p + 'frond'}
        d="M0 0C28-16 66-15 100 20C93 15 87 16 81 12L78 19C71 12 65 11 59 8L55 15C49 9 42 6 35 4L31 10C25 5 17 4 8 4Z"
      />

      {/* Small hillside house — stretches to any size. Fill comes from <use>. */}
      <symbol id={p + 'hh'} viewBox="0 0 20 16" preserveAspectRatio="none">
        <path d="M-1 7.5 10 0 21 7.5ZM2 7h16v9H2z" />
      </symbol>

      {/* Gingerbread house: steep hip roof, front gable, fretwork eaves, two-storey gallery. */}
      <symbol id={p + 'gb'} viewBox="0 0 120 160">
        <path className="aw-r" d="M4 64 40 14h40l36 50z" />
        <path className="aw-r" d="M36 64 60 2l24 62z" />
        <path className="aw-ts" strokeWidth="1.4" d="M60 2v-6M42 62 60 14l18 48M30 24h60" />
        <circle className="aw-w" cx="60" cy="44" r="5.5" />
        <path className="aw-ts" strokeWidth="1" d="M60 38.5v11M54.5 44h11" />
        <rect className="aw-b" x="15" y="64" width="90" height="42" />
        <rect className="aw-w" x="23" y="70" width="15" height="30" />
        <rect className="aw-x" x="52.5" y="70" width="15" height="30" />
        <rect className="aw-w" x="82" y="70" width="15" height="30" />
        <path className="aw-ts" strokeWidth="1" d="M30.5 70v30M89.5 70v30M23 80h15M82 80h15" />
        <path
          className="aw-ts"
          strokeWidth="1.6"
          d="M4 64a4 4 0 0 0 8 0a4 4 0 0 0 8 0a4 4 0 0 0 8 0a4 4 0 0 0 8 0a4 4 0 0 0 8 0a4 4 0 0 0 8 0a4 4 0 0 0 8 0a4 4 0 0 0 8 0a4 4 0 0 0 8 0a4 4 0 0 0 8 0a4 4 0 0 0 8 0a4 4 0 0 0 8 0a4 4 0 0 0 8 0a4 4 0 0 0 8 0"
        />
        <path className="aw-t" d="M7 64h3v42H7zM42 64h3v42h-3zM75 64h3v42h-3zM110 64h3v42h-3z" />
        <path className="aw-t" d="M5 92h110v2H5zM3 105h114v4H3z" />
        <path
          className="aw-ts"
          strokeWidth="1.1"
          d="M10 94v11M14 94v11M18 94v11M22 94v11M26 94v11M30 94v11M34 94v11M38 94v11M48 94v11M52 94v11M56 94v11M60 94v11M64 94v11M68 94v11M72 94v11M82 94v11M86 94v11M90 94v11M94 94v11M98 94v11M102 94v11M106 94v11"
        />
        <rect className="aw-b" x="13" y="109" width="94" height="51" />
        <path className="aw-w" d="M21 160v-38a8 8 0 0 1 16 0v38zM83 160v-38a8 8 0 0 1 16 0v38z" />
        <path className="aw-x" d="M52 160v-38a8 8 0 0 1 16 0v38z" />
        <path className="aw-t" d="M16 118h4v34h-4zM38 118h4v34h-4zM78 118h4v34h-4zM100 118h4v34h-4z" />
        <path className="aw-t" d="M11 158h98v2H11z" />
      </symbol>

      {/* Cottage with porch fretwork. */}
      <symbol id={p + 'ct'} viewBox="0 0 100 92">
        <path className="aw-r" d="M2 40 28 6h44l26 34z" />
        <rect className="aw-b" x="9" y="40" width="82" height="52" />
        <path
          className="aw-ts"
          strokeWidth="1.3"
          d="M4 41a3.5 3.5 0 0 0 7 0a3.5 3.5 0 0 0 7 0a3.5 3.5 0 0 0 7 0a3.5 3.5 0 0 0 7 0a3.5 3.5 0 0 0 7 0a3.5 3.5 0 0 0 7 0a3.5 3.5 0 0 0 7 0a3.5 3.5 0 0 0 7 0a3.5 3.5 0 0 0 7 0a3.5 3.5 0 0 0 7 0a3.5 3.5 0 0 0 7 0a3.5 3.5 0 0 0 7 0a3.5 3.5 0 0 0 7 0"
        />
        <path className="aw-w" d="M42 92V64a8 8 0 0 1 16 0v28z" />
        <rect className="aw-w" x="18" y="56" width="13" height="20" />
        <rect className="aw-x" x="69" y="56" width="13" height="20" />
        <path className="aw-t" d="M6 44h3v48H6zM91 44h3v48h-3zM14 54h3v24h-3zM32 54h3v24h-3zM65 54h3v24h-3zM83 54h3v24h-3zM4 90h92v2H4z" />
      </symbol>

      {/* Street lamp post (head at 51,17 in 60x200 space). */}
      <symbol id={p + 'lp'} viewBox="0 0 60 200">
        <path d="M27 200h6V24h-6z" />
        <path d="M30 26Q30 8 48 9" fill="none" stroke="currentColor" strokeWidth="3.4" />
        <path d="M43 12q8-6 15 2l-2 3H45z" />
        <rect x="24" y="190" width="12" height="10" />
      </symbol>
    </defs>
  );
}

/* ------------------------------------------------------------------ */
/* Sky                                                                 */
/* ------------------------------------------------------------------ */

export function Stars({ n, w, h, seed }: { n: number; w: number; h: number; seed: number }) {
  const R = rng(seed);
  const still: string[] = [];
  const tw: React.ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const x = r1(R() * w);
    const y = r1(Math.pow(R(), 1.4) * h);
    const r = r1(0.5 + R() * 1.1);
    if (i % 9 === 0) {
      tw.push(
        <circle key={i} className="aw-tw" style={{ animationDelay: `${r1(R() * 8)}s` }} cx={x} cy={y} r={r + 0.3} />,
      );
    } else {
      still.push(`M${x} ${y}m-${r} 0a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 -${r * 2} 0`);
    }
  }
  return (
    <g fill="#DCE6FF">
      <path d={still.join('')} opacity="0.7" />
      {tw}
    </g>
  );
}

export function Moon({ x, y, r, p }: { x: number; y: number; r: number; p: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r * 7} fill={`url(#${p}halo)`} />
      <circle cx={x} cy={y} r={r} fill={C.moon} />
      <path
        d={`M${x - r * 0.3} ${y - r * 0.2}a${r * 0.22} ${r * 0.22} 0 1 0 1 0zM${x + r * 0.3} ${y + r * 0.3}a${r * 0.14} ${r * 0.14} 0 1 0 1 0zM${x + r * 0.15} ${y - r * 0.5}a${r * 0.1} ${r * 0.1} 0 1 0 1 0`}
        fill="#C9C6BA"
        opacity="0.45"
      />
    </g>
  );
}

export function Clouds({ items }: { items: [number, number, number, number][] }) {
  return (
    <g className="aw-cloud" fill="#2A4686" opacity="0.32">
      {items.map(([x, y, rx, ry], i) => (
        <ellipse key={i} cx={x} cy={y} rx={rx} ry={ry} />
      ))}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Land                                                                */
/* ------------------------------------------------------------------ */

export function Ridge({ pts, bottom, fill, rim, rimOp = 0.6 }: { pts: Pt[]; bottom: number; fill: string; rim?: string; rimOp?: number }) {
  return (
    <g>
      <path d={ridgePath(pts, bottom)} fill={fill} />
      {rim && <path d={ridgeLine(pts)} fill="none" stroke={rim} strokeWidth="1.4" opacity={rimOp} />}
    </g>
  );
}

/** Ship-prowed mountaintop fortress, a respectful nod to the Citadelle. Origin = base centre. */
export function Fortress({ x, y, s, p }: { x: number; y: number; s: number; p: string }) {
  const ports: string[] = [];
  for (let gx = -34; gx <= 44; gx += 9) ports.push(`M${gx} -28h3v4h-3z`);
  for (let gx = -30; gx <= 26; gx += 8) ports.push(`M${gx} -12h3v4h-3z`);
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path
        d="M-62 26-56-30-46-40-10-44-8-51H8L10-44 34-42 40-34C52-34 58-26 58-18L62 26Z"
        fill={`url(#${p}cit)`}
      />
      <path d="M-62 26-56-30-46-40-40 26Z" fill="#2A4A92" opacity="0.55" />
      <path d={ports.join('')} fill="#081536" opacity="0.9" />
      <path d="M-40-20H50M-40-34 38-36" stroke="#2C4C94" strokeWidth="1" opacity="0.5" fill="none" />
      <path d="M-62 26-56-30-46-40-10-44-8-51H8" stroke="#5A7BC8" strokeWidth="1.4" opacity="0.8" fill="none" />
    </g>
  );
}

/** Warm specks of homes climbing the mornes. */
export function HillLights({ pts, ranges, depth, n, seed }: { pts: Pt[]; ranges: [number, number][]; depth: number; n: number; seed: number }) {
  const R = rng(seed);
  const warm: string[] = [];
  const pale: string[] = [];
  const total = ranges.reduce((a, [x0, x1]) => a + (x1 - x0), 0);
  for (let i = 0; i < n; i++) {
    let u = R() * total;
    let x = 0;
    for (const [x0, x1] of ranges) {
      if (u <= x1 - x0) { x = x0 + u; break; }
      u -= x1 - x0;
    }
    const y = ridgeY(pts, x) + 8 + Math.pow(R(), 0.7) * depth;
    const s = R() < 0.2 ? 2.4 : 1.6;
    (R() < 0.7 ? warm : pale).push(`M${r1(x)} ${r1(y)}h${s}v${s}h-${s}z`);
  }
  return (
    <g>
      <path d={warm.join('')} fill={C.sodium} opacity="0.75" />
      <path d={pale.join('')} fill={C.win} opacity="0.55" />
    </g>
  );
}

/** A row of small houses along a base line, windows individually lit. */
export function CityRow({ x0, x1, base, scale, seed, fill, p, lit = 0.5, flick = 0 }: { x0: number; x1: number; base: number; scale: number; seed: number; fill: string; p: string; lit?: number; flick?: number }) {
  const R = rng(seed);
  const houses: React.ReactNode[] = [];
  const wins: string[] = [];
  const flickers: React.ReactNode[] = [];
  let x = x0;
  let i = 0;
  const href = `#${p}hh`;
  while (x < x1) {
    const w = (16 + R() * 18) * scale;
    const h = (12 + R() * 12) * scale;
    houses.push(<use key={i} href={href} x={r1(x)} y={r1(base - h)} width={r1(w)} height={r1(h)} />);
    const nw = w > 24 * scale ? 2 : 1;
    for (let k = 0; k < nw; k++) {
      if (R() < lit) {
        const wx = x + w * (nw === 1 ? 0.42 : 0.25 + k * 0.38);
        const wy = base - h * 0.42;
        const ww = r1(Math.max(1.6, w * 0.13));
        const wh = r1(Math.max(1.8, h * 0.2));
        if (flickers.length < flick && R() < 0.3) {
          flickers.push(
            <rect key={`f${i}${k}`} className="aw-flick" style={{ animationDelay: `${r1(R() * 14)}s` }} x={r1(wx)} y={r1(wy)} width={ww} height={wh} />,
          );
        } else {
          wins.push(`M${r1(wx)} ${r1(wy)}h${ww}v${wh}h-${ww}z`);
        }
      }
    }
    x += w + (R() < 0.3 ? 3 * scale : -1);
    i++;
  }
  return (
    <g>
      <g fill={fill}>{houses}</g>
      <path d={wins.join('')} fill={C.win} opacity="0.85" />
      <g fill={C.sodium}>{flickers}</g>
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Street furniture                                                    */
/* ------------------------------------------------------------------ */

export function Lamp({ x, base, h, p, pool = 1 }: { x: number; base: number; h: number; p: string; pool?: number }) {
  const s = h / 200;
  const hx = x + (51 - 30) * s;
  const hy = base - h + 17 * s;
  return (
    <g>
      <ellipse cx={hx} cy={base + 4} rx={h * 0.7 * pool} ry={h * 0.11 * pool} fill={`url(#${p}pool)`} />
      <use href={`#${p}lp`} x={x - 30 * s} y={base - h} width={60 * s} height={h} color={C.fg} fill={C.fg} />
      <circle cx={hx} cy={hy} r={h * 0.32} fill={`url(#${p}lamp)`} />
      <ellipse cx={hx} cy={hy + 1} rx={4.5 * s * 1.6} ry={2.4 * s * 1.6} fill="#FFE9C2" />
    </g>
  );
}

export function Palm({ x, base, tx, ty, size, fill = C.fg, seed = 1, p }: { x: number; base: number; tx: number; ty: number; size: number; fill?: string; seed?: number; p: string }) {
  const w0 = size * 0.075;
  const w1 = size * 0.035;
  const cx1 = x + (tx - x) * 0.15;
  const cy1 = base - (base - ty) * 0.45;
  const cx2 = x + (tx - x) * 0.55;
  const cy2 = ty + (base - ty) * 0.2;
  const d =
    `M${r1(x - w0)} ${base}C${r1(cx1 - w0)} ${r1(cy1)} ${r1(cx2 - w1)} ${r1(cy2)} ${r1(tx - w1)} ${r1(ty)}` +
    `L${r1(tx + w1)} ${r1(ty)}C${r1(cx2 + w1)} ${r1(cy2)} ${r1(cx1 + w0)} ${r1(cy1)} ${r1(x + w0)} ${base}Z`;
  const R = rng(seed);
  const angles = [-172, -146, -118, -84, -52, -22, 8, 34, 196, 150];
  const k = size / 100;
  return (
    <g fill={fill}>
      <path d={d} />
      {/* trunk rings, catching the moon on the left */}
      <path d={`M${r1(tx - w1)} ${r1(ty)}C${r1(cx2 - w1)} ${r1(cy2)} ${r1(cx1 - w0)} ${r1(cy1)} ${r1(x - w0)} ${base}`} fill="none" stroke={C.rim} strokeWidth="1.2" opacity="0.35" />
      {angles.map((a, i) => {
        const len = k * (0.85 + R() * 0.35);
        const flip = a > 90 || a < -90 ? -1 : 1;
        return (
          <use
            key={i}
            href={`#${p}frond`}
            transform={`translate(${r1(tx)} ${r1(ty)}) rotate(${a + (flip < 0 ? 180 : 0)}) scale(${r1(len * flip)} ${r1(len)})`}
          />
        );
      })}
      <circle cx={tx} cy={ty + 2 * k} r={5 * k} />
    </g>
  );
}

export function Mango({ x, base, s, fill = C.fg }: { x: number; base: number; s: number; fill?: string }) {
  const blobs: [number, number, number][] = [
    [-62, -98, 44], [-20, -128, 54], [36, -122, 50], [74, -92, 40], [-40, -70, 40], [20, -78, 48], [56, -64, 34], [-80, -62, 28],
  ];
  const d = (dx: number, dy: number) =>
    blobs.map(([bx, by, r]) => `M${r1(x + (bx + dx) * s - r * s)} ${r1(base + (by + dy) * s)}a${r1(r * s)} ${r1(r * s)} 0 1 0 ${r1(r * s * 2)} 0a${r1(r * s)} ${r1(r * s)} 0 1 0 -${r1(r * s * 2)} 0`).join('');
  return (
    <g>
      <path d={d(-4, -5)} fill="#22407E" />
      <path d={d(3, -1)} fill="#3B3A5E" opacity="0.6" />
      <path d={d(0, 0)} fill={fill} />
      <path d={`M${x - 7 * s} ${base}C${x - 5 * s} ${base - 30 * s} ${x - 10 * s} ${base - 46 * s} ${x - 26 * s} ${base - 62 * s}L${x - 18 * s} ${base - 66 * s}C${x - 4 * s} ${base - 52 * s} ${x + 2 * s} ${base - 46 * s} ${x + 14 * s} ${base - 68 * s}L${x + 20 * s} ${base - 62 * s}C${x + 8 * s} ${base - 40 * s} ${x + 6 * s} ${base - 26 * s} ${x + 8 * s} ${base}Z`} fill={fill} />
    </g>
  );
}

/** Little figures heading to the stadium; some wave their school's flag. */
export function People({ cx, cy, rx, ry, n, s, seed, flags }: { cx: number; cy: number; rx: number; ry: number; n: number; s: number; seed: number; flags?: [string, string] }) {
  const R = rng(seed);
  const bodies: string[] = [];
  const fl: Record<string, string[]> = {};
  const poles: string[] = [];
  for (let i = 0; i < n; i++) {
    const th = R() * Math.PI * 2;
    const rr = Math.sqrt(R());
    const x = cx + Math.cos(th) * rx * rr;
    const y = cy + Math.sin(th) * ry * rr;
    const k = s * (0.85 + (y - (cy - ry)) / (ry * 2) * 0.3) * (0.9 + R() * 0.2);
    bodies.push(
      `M${r1(x - 2.4 * k)} ${r1(y)}L${r1(x - 1.9 * k)} ${r1(y - 7 * k)}Q${r1(x)} ${r1(y - 8.6 * k)} ${r1(x + 1.9 * k)} ${r1(y - 7 * k)}L${r1(x + 2.4 * k)} ${r1(y)}Z` +
      `M${r1(x - 1.7 * k)} ${r1(y - 9.6 * k)}a${r1(1.7 * k)} ${r1(1.7 * k)} 0 1 0 ${r1(3.4 * k)} 0a${r1(1.7 * k)} ${r1(1.7 * k)} 0 1 0 -${r1(3.4 * k)} 0`,
    );
    if (flags && R() < 0.3) {
      const c = x < cx ? flags[0] : flags[1];
      poles.push(`M${r1(x + 2 * k)} ${r1(y - 6 * k)}V${r1(y - 16 * k)}`);
      (fl[c] = fl[c] || []).push(`M${r1(x + 2 * k)} ${r1(y - 16 * k)}h${r1(5 * k)}v${r1(3.6 * k)}h-${r1(5 * k)}z`);
    }
  }
  return (
    <g>
      <path d={poles.join('')} stroke="#050B1D" strokeWidth={r1(0.6 * s)} />
      {Object.entries(fl).map(([c, ds]) => <path key={c} d={ds.join('')} fill={c} />)}
      <path d={bodies.join('')} fill="#050B1D" />
    </g>
  );
}

/** A string of pennants hanging along a sagging line. */
export function Bunting({ a, b, sag, colors, n, size = 1 }: { a: Pt; b: Pt; sag: number; colors: string[]; n: number; size?: number }) {
  const cx = (a[0] + b[0]) / 2;
  const cy = (a[1] + b[1]) / 2 + sag;
  const pt = (t: number): Pt => [
    (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * cx + t * t * b[0],
    (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * cy + t * t * b[1],
  ];
  const byColor: Record<string, string[]> = {};
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const [x, y] = pt(t);
    const c = colors[i % colors.length];
    (byColor[c] = byColor[c] || []).push(`M${r1(x - 5 * size)} ${r1(y)}h${r1(10 * size)}l-${r1(5 * size)} ${r1(13 * size)}z`);
  }
  return (
    <g>
      <path d={`M${a[0]} ${a[1]}Q${cx} ${cy} ${b[0]} ${b[1]}`} fill="none" stroke="#0A1430" strokeWidth="1.2" />
      {Object.entries(byColor).map(([c, ds]) => (
        <path key={c} d={ds.join('')} fill={c} opacity="0.92" />
      ))}
    </g>
  );
}

/** A painted tap-tap, side view facing right. Origin = rear wheel ground line, left end. */
export function TapTap({ x, y, s, p, lit }: { x: number; y: number; s: number; p: string; lit: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="92" cy="2" rx="104" ry="7" fill="#02060F" opacity="0.55" />
      {lit && <ellipse cx="226" cy="-22" rx="56" ry="14" fill={`url(#${p}lamp)`} />}
      <rect x="-2" y="-84" width="122" height="6" rx="2" fill="#13265A" />
      <path d="M8 -84v-4h6v4M52 -84v-4h6v4M100 -84v-4h6v4" stroke="#13265A" strokeWidth="2" fill="none" />
      <rect x="0" y="-78" width="118" height="62" fill="#2459BE" />
      <rect x="6" y="-72" width="106" height="24" fill="#071230" />
      <rect x="6" y="-72" width="106" height="24" fill={C.win} opacity="0.12" />
      <path d="M26 -72v24M46 -72v24M66 -72v24M86 -72v24" stroke="#2459BE" strokeWidth="4" />
      <path d="M0 -46h118v4H0z" fill={C.win} />
      <path d="M0 -42h118v6H0z" fill="#2FB3A0" />
      <path d="M0 -36h118v18H0z" fill={C.coral} />
      <text x="59" y="-22.5" textAnchor="middle" fontSize="12" fontWeight="800" letterSpacing="3" fill="#FFF3DC" fontFamily="system-ui, sans-serif">KOURAJ</text>
      <path d="M4 -80l6-6 6 6M108 -80l6-6 6 6" fill={C.win} opacity="0.9" />
      <path d="M118 -16V-64h32l18 24 18 4v20z" fill={C.coral} />
      <path d="M150 -60l14 18h-14z" fill="#0A1636" />
      <path d="M153 -56l4 6" stroke="#9CB4E8" strokeWidth="1.2" opacity="0.6" />
      <path d="M122 -60h24v18h-24z" fill="#0A1636" />
      <path d="M118 -40h68v3h-68z" fill="#FFF3DC" opacity="0.85" />
      <rect x="-4" y="-18" width="194" height="8" rx="2" fill="#0A1430" />
      <circle cx="183" cy="-30" r="3.6" fill="#FFF4D6" />
      <rect x="-3" y="-34" width="3" height="6" fill="#E0413A" />
      <circle cx="32" cy="-10" r="12" fill="#03070F" />
      <circle cx="32" cy="-10" r="4.5" fill="#3A4C78" />
      <circle cx="152" cy="-10" r="12" fill="#03070F" />
      <circle cx="152" cy="-10" r="4.5" fill="#3A4C78" />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* The stadium — the focal point of every composition                  */
/* ------------------------------------------------------------------ */

type StadiumProps = {
  cx: number; cy: number; rx: number; ry: number; depth: number;
  occ: Occasion; a: string; b: string; p: string; seed: number;
  front: number; back: number; arches?: number;
};

const TROPHY =
  'M-.34-1H.34C.34-.6.2-.47.07-.43V-.27L.2-.19V-.11H-.2V-.19L-.07-.27V-.43C-.2-.47-.34-.6-.34-1Z';
const HANDLES = 'M-.32-.9C-.56-.9-.54-.6-.2-.56M.32-.9C.56-.9.54-.6.2-.56';

export function Stadium({ cx, cy, rx, ry, depth, occ, a, b, p, seed, front, back, arches = 9 }: StadiumProps) {
  const lit = occ !== 'everyday';
  const champ = occ === 'championship';
  const R = rng(seed);
  const rxi = rx * 0.8;
  const ryi = ry * 0.66;
  const off = ry * 0.2;
  const lowY = (x: number) => cy + ry * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2));

  // Towers: [baseX, baseY, height, tilt]
  const backT: [number, number, number, number][] = [
    [cx - rx * 0.6, cy - ry * 0.55, back, 6],
    [cx + rx * 0.6, cy - ry * 0.55, back, -6],
  ];
  const frontT: [number, number, number, number][] = [
    [cx - rx * 0.985, cy + depth * 0.92, front, 10],
    [cx + rx * 0.985, cy + depth * 0.92, front, -10],
  ];
  const towerLit = (i: number, isBack: boolean) => lit || (isBack && i === 0);

  const tower = ([tx, ty, h, tilt]: [number, number, number, number], i: number, isBack: boolean) => {
    const w = h * 0.035;
    const on = towerLit(i, isBack);
    const dim = !lit;
    const hw = h * 0.085;
    const hh = h * 0.06;
    const hy = ty - h;
    // lattice zigzag
    let z = `M${r1(tx - w)} ${ty}`;
    const steps = 9;
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const ww = w * (1 - t * 0.65);
      z += `L${r1(tx + (k % 2 ? ww : -ww))} ${r1(ty - h * t)}`;
    }
    const lamps: string[] = [];
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 4; col++) {
        const lx = -hw + hw * 0.25 + (col * (hw * 1.5)) / 3;
        const ly = -hh + hh * 0.2 + (row * hh * 0.6) / 2;
        lamps.push(`M${r1(lx)} ${r1(ly)}h${r1(hw * 0.3)}v${r1(hh * 0.22)}h-${r1(hw * 0.3)}z`);
      }
    return (
      <g key={`${isBack ? 'b' : 'f'}${i}`}>
        <path d={`M${r1(tx - w)} ${ty}L${r1(tx - w * 0.35)} ${r1(hy)}H${r1(tx + w * 0.35)}L${r1(tx + w)} ${ty}Z`} fill="none" stroke="#0A1638" strokeWidth={Math.max(1.4, w * 0.35)} />
        <path d={z} fill="none" stroke="#0A1638" strokeWidth={Math.max(0.8, w * 0.18)} />
        {on && <circle className="aw-hum" cx={tx} cy={hy - hh * 0.4} r={h * (dim ? 0.18 : 0.34)} fill={`url(#${p}flood)`} opacity={dim ? 0.55 : 1} />}
        <g transform={`translate(${r1(tx)} ${r1(hy)}) rotate(${tilt})`}>
          <rect x={r1(-hw * 1.08)} y={r1(-hh * 1.1)} width={r1(hw * 2.16)} height={r1(hh * 1.2)} rx="1.5" fill="#0A1638" />
          <path d={lamps.join('')} fill={on ? C.flood : '#25386A'} opacity={on ? (dim ? 0.7 : 1) : 1} />
        </g>
      </g>
    );
  };

  // Crowd in the back stands, home colour on the left, visitors on the right.
  const crowd: Record<string, string[]> = {};
  const nCrowd = lit ? 170 : 30;
  for (let i = 0; i < nCrowd; i++) {
    const th = Math.PI + R() * Math.PI;
    const t = 0.12 + R() * 0.8;
    const x = cx + Math.cos(th) * (rxi + t * (rx - rxi));
    const y = cy + off * (1 - t) + Math.sin(th) * (ryi + t * (ry - ryi));
    let col = '#5D74A8';
    if (lit) col = R() < (champ ? 0.16 : 0.08) ? C.flood : x < cx ? a : b;
    const s = r1(rx * 0.009 + 0.6);
    (crowd[col] = crowd[col] || []).push(`M${r1(x)} ${r1(y)}h${s}v${s}h-${s}z`);
  }

  // Arches on the facade, banners between them.
  const archEls: string[] = [];
  const bannerEls: Record<string, string[]> = { a: [], b: [] };
  const crestDots: string[] = [];
  for (let i = 0; i < arches; i++) {
    const t = -0.82 + (1.64 * i) / (arches - 1);
    const x = cx + rx * t;
    const big = i === (arches - 1) / 2;
    const w = rx * (big ? 0.1 : 0.066);
    const h = depth * (big ? (champ ? 0.6 : 0.46) : 0.48);
    const bot = lowY(x) + depth - depth * 0.08;
    archEls.push(`M${r1(x - w / 2)} ${r1(bot)}V${r1(bot - h + w / 2)}A${r1(w / 2)} ${r1(w / 2)} 0 0 1 ${r1(x + w / 2)} ${r1(bot - h + w / 2)}V${r1(bot)}Z`);
    if (i < arches - 1) {
      const t2 = -0.82 + (1.64 * (i + 0.5)) / (arches - 1);
      const bx = cx + rx * t2;
      if (Math.abs(t2) < 0.12) continue;
      const top = lowY(bx) + depth * 0.06;
      const bw = rx * 0.045;
      const bh = depth * 0.66;
      bannerEls[bx < cx ? 'a' : 'b'].push(`M${r1(bx - bw / 2)} ${r1(top)}h${r1(bw)}v${r1(bh)}l-${r1(bw / 2)} -${r1(bw * 0.45)}l-${r1(bw / 2)} ${r1(bw * 0.45)}z`);
      const cr = r1(bw * 0.24);
      crestDots.push(`M${r1(bx - cr)} ${r1(top + bh * 0.3)}a${cr} ${cr} 0 1 0 ${r1(cr * 2)} 0a${cr} ${cr} 0 1 0 -${r1(cr * 2)} 0`);
    }
  }

  const front0 = cy + ry; // facade top at centre
  const S = ry * (champ ? 1.3 : 1);

  return (
    <g>
      {/* light dome over the bowl */}
      <ellipse cx={cx} cy={cy - ry * 0.4} rx={rx * 1.55} ry={ry * 3.6} fill={`url(#${p}dome)`} opacity={lit ? (champ ? 1 : 0.8) : 0.3} />
      {champ && <ellipse cx={cx} cy={front0 - S * 0.5} rx={rx * 0.55} ry={rx * 0.55} fill={`url(#${p}gold)`} className="aw-glow" />}

      {/* championship beams */}
      {champ &&
        [...backT, ...frontT].map(([tx, ty, h, tilt], i) => {
          const L = rx * 2.6;
          const ang = [-14, 14, -34, 34][i];
          return (
            <g key={`beam${i}`} transform={`translate(${r1(tx)} ${r1(ty - h)}) rotate(${ang})`}>
              <path className={`aw-beam aw-beam${i}`} d={`M-4 0L4 0L${r1(L * 0.13)} ${r1(-L)}L${r1(-L * 0.13)} ${r1(-L)}Z`} fill={`url(#${p}beam)`} />
            </g>
          );
        })}
      {champ && <ellipse cx={cx} cy={front0 - S - rx * 0.5} rx={rx * 0.1} ry={rx * 1.1} fill={`url(#${p}gold)`} className="aw-glow" />}

      {backT.map((t, i) => tower(t, i, true))}

      {/* roof canopy over the back stands */}
      <path
        d={`M${cx - rx * 1.03} ${cy + 2}A${rx * 1.03} ${ry * 1.12} 0 0 1 ${cx + rx * 1.03} ${cy + 2}L${cx + rx * 0.99} ${cy + 4}A${rx * 0.99} ${ry * 1.02} 0 0 0 ${cx - rx * 0.99} ${cy + 4}Z`}
        fill="#0A1840"
      />
      {/* back stands */}
      <path
        d={`M${cx - rx} ${cy}A${rx} ${ry} 0 0 1 ${cx + rx} ${cy}L${cx + rxi} ${cy + off}A${rxi} ${ryi} 0 0 0 ${cx - rxi} ${cy + off}Z`}
        fill={`url(#${p}stands)`}
      />
      <path
        d={`M${cx - rx * 0.93} ${cy + off * 0.3}A${rx * 0.93} ${ry * 0.88} 0 0 1 ${cx + rx * 0.93} ${cy + off * 0.3}M${cx - rx * 0.86} ${cy + off * 0.6}A${rx * 0.86} ${ry * 0.77} 0 0 1 ${cx + rx * 0.86} ${cy + off * 0.6}`}
        fill="none"
        stroke="#0E2152"
        strokeWidth="1.2"
        opacity="0.8"
      />
      {Object.entries(crowd).map(([c, ds]) => (
        <path key={c} d={ds.join('')} fill={c} opacity={lit ? 0.85 : 0.45} />
      ))}
      {lit && (
        <path
          d={`M${cx - rx * 0.99} ${cy + 3}A${rx * 0.99} ${ry * 1.02} 0 0 1 ${cx + rx * 0.99} ${cy + 3}`}
          fill="none"
          stroke={C.flood}
          strokeWidth="1.6"
          strokeDasharray="2 5"
          opacity="0.75"
        />
      )}

      {/* track + pitch */}
      <ellipse cx={cx} cy={cy + off} rx={rxi} ry={ryi} fill={lit ? '#2A3A70' : '#172650'} />
      <ellipse cx={cx} cy={cy + off} rx={rxi * 0.86} ry={ryi * 0.8} fill={`url(#${p}${lit ? 'field' : 'fieldDim'})`} />
      <g fill="none" stroke="#EAF2FF" strokeWidth="1" opacity={lit ? 0.45 : 0.18}>
        <ellipse cx={cx} cy={cy + off} rx={rxi * 0.74} ry={ryi * 0.66} />
        <ellipse cx={cx} cy={cy + off} rx={rxi * 0.13} ry={ryi * 0.16} />
        <path d={`M${cx} ${cy + off - ryi * 0.66}V${cy + off + ryi * 0.66}`} />
      </g>
      {lit && <ellipse cx={cx} cy={cy + off} rx={rxi * 0.95} ry={ryi * 0.95} fill={`url(#${p}flood)`} opacity="0.4" />}

      {/* front stands (tops of seats) */}
      <path
        d={`M${cx - rx} ${cy}A${rx} ${ry} 0 0 0 ${cx + rx} ${cy}L${cx + rxi} ${cy + off}A${rxi} ${ryi} 0 0 1 ${cx - rxi} ${cy + off}Z`}
        fill="#112558"
      />
      {/* facade */}
      <path
        d={`M${cx - rx} ${cy}A${rx} ${ry} 0 0 0 ${cx + rx} ${cy}L${cx + rx} ${cy + depth}A${rx} ${ry} 0 0 1 ${cx - rx} ${cy + depth}Z`}
        fill={`url(#${p}facade)`}
      />
      <path d={`M${cx - rx} ${cy}A${rx} ${ry} 0 0 0 ${cx + rx} ${cy}`} fill="none" stroke={lit ? C.flood : C.rim} strokeWidth="1.6" opacity={lit ? 0.6 : 0.5} />
      <path
        d={`M${cx - rx} ${cy + depth * 0.22}A${rx} ${ry} 0 0 0 ${cx + rx} ${cy + depth * 0.22}`}
        fill="none"
        stroke="#0B1A45"
        strokeWidth="1.2"
      />
      <path d={archEls.join('')} fill={C.sodium} opacity={lit ? 0.95 : 0.6} />
      {lit && (
        <>
          <path d={bannerEls.a.join('')} fill={a} />
          <path d={bannerEls.b.join('')} fill={b} />
          <path d={crestDots.join('')} fill="#FFF7E6" opacity="0.9" />
        </>
      )}

      {/* centre: crest (everyday / match) or the trophy (championship) */}
      {!champ && (
        <g transform={`translate(${cx} ${front0 + depth * 0.1}) scale(0.8)`}>
          <path d={`M${-ry * 0.32} ${-ry * 0.3}h${ry * 0.64}v${ry * 0.3}q0 ${ry * 0.3} ${-ry * 0.32} ${ry * 0.42}q${-ry * 0.32} ${-ry * 0.12} ${-ry * 0.32} ${-ry * 0.42}z`} fill={lit ? a : '#1F3B7E'} stroke="#EAF2FF" strokeOpacity={lit ? 0.85 : 0.4} strokeWidth="1.3" />
          {lit && <path d={`M0 ${-ry * 0.3}h${ry * 0.32}v${ry * 0.3}q0 ${ry * 0.3} ${-ry * 0.32} ${ry * 0.42}z`} fill={b} />}
        </g>
      )}

      {frontT.map((t, i) => tower(t, i, false))}

      {champ && (
        <g>
          <path d={`M${cx - S * 0.5} ${front0 + 2}h${S}l${-S * 0.08} ${-S * 0.1}h${-S * 0.84}z`} fill="#0B1A45" />
          <path d={`M${cx - S * 0.5} ${front0 + 2}h${S}`} stroke={C.gold} strokeWidth="1.4" opacity="0.8" />
          <g transform={`translate(${cx} ${front0 - S * 0.1}) scale(${S})`}>
            <path d={HANDLES} fill="none" stroke={`url(#${p}trophy)`} strokeWidth={0.07} />
            <path d={TROPHY} fill={`url(#${p}trophy)`} />
            <path d="M-.22-.94C-.22-.7-.14-.56-.04-.5" fill="none" stroke="#FFF6D8" strokeWidth=".035" opacity=".85" />
            <rect x="-.27" y="-.11" width=".54" height=".11" fill="#7A4A0C" />
          </g>
        </g>
      )}
    </g>
  );
}
