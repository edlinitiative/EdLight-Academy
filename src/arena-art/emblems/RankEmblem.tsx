import React from 'react';
import { schoolColors } from '../crest/SchoolCrest';
import './emblems.css';

/**
 * Rank emblems — one badge family, five tiers.
 *
 * Each tier owns a silhouette that survives at 20px, so a tier is recognised
 * before its colour is read:
 *
 *   Bronze   round medallion      matte cast metal
 *   Argent   hexagon              brushed silver
 *   Or       twelve-point rosette polished gold, one specular
 *   Diamant  cut gem              ice facets, one sparkle
 *   Légende  winged medallion     gold wings, night enamel, slow sheen
 *                                 (the only animated tier; still under
 *                                 prefers-reduced-motion)
 *
 * The level number always sits on a dark enamel plate, so it reads on every
 * material. The emblem never carries meaning alone — callers state the tier
 * and level in text (see `emblemLabel`).
 */
export interface EmblemTier { id: string; nameFr: string; nameHt: string; minLevel: number }

export const EMBLEM_TIERS: EmblemTier[] = [
  { id: 'bronze', nameFr: 'Bronze', nameHt: 'Bwonz', minLevel: 1 },
  { id: 'silver', nameFr: 'Argent', nameHt: 'Ajan', minLevel: 5 },
  { id: 'gold', nameFr: 'Or', nameHt: 'Lò', minLevel: 10 },
  { id: 'diamond', nameFr: 'Diamant', nameHt: 'Dyaman', minLevel: 20 },
  { id: 'legend', nameFr: 'Légende', nameHt: 'Lejand', minLevel: 35 },
];

export function emblemForLevel(level: number): EmblemTier {
  const l = Math.max(1, Math.floor(level || 1));
  return [...EMBLEM_TIERS].reverse().find((t) => l >= t.minLevel) || EMBLEM_TIERS[0];
}

/** Plain-text meaning for an emblem, e.g. "Or · niveau 12" / "Lò · nivo 12". */
export function emblemLabel(level: number, isCreole = false): string {
  const l = Math.max(1, Math.floor(level || 1));
  const tier = emblemForLevel(l);
  return isCreole ? `${tier.nameHt} · nivo ${l}` : `${tier.nameFr} · niveau ${l}`;
}

function useSvgId(prefix: string): string {
  const raw = React.useId();
  return `${prefix}${raw.replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

function poly(cx: number, cy: number, r: number, n: number, rot: number): string {
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i * 2 * Math.PI) / n;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

function rosette(cx: number, cy: number, outer: number, inner: number, n: number): string {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

const HEX_OUT = poly(32, 32, 30, 6, -Math.PI / 2);
const HEX_IN = poly(32, 32, 24.5, 6, -Math.PI / 2);
const HEX_PLATE = poly(32, 32, 19.5, 6, -Math.PI / 2);
const ROSETTE = rosette(32, 32, 31, 25, 12);
const GEM = 'M17 6H47L61 22L32 61L3 22Z';
const GEM_FACETS: Array<[string, string]> = [
  ['M17 6L24 22H3Z', '#BFF1FF'],
  ['M17 6H32L24 22Z', '#E9FCFF'],
  ['M32 6H47L40 22Z', '#9FE3FF'],
  ['M47 6L61 22H40Z', '#5FC2F2'],
  ['M3 22H24L32 61Z', '#7FD3FF'],
  ['M24 22H40L32 61Z', '#B5ECFF'],
  ['M40 22H61L32 61Z', '#3E9BDA'],
];
const WING_L = 'M20 26C14 20 6 18 1 20C3 23 6 24 9 24.5C5 25.5 2.5 27.5 2 30C6 31 10 30.5 13 29.5C10 31.5 8.5 34 8.5 36.5C13 36.5 17 34 20 31Z';
const WING_R = 'M44 26C50 20 58 18 63 20C61 23 58 24 55 24.5C59 25.5 61.5 27.5 62 30C58 31 54 30.5 51 29.5C54 31.5 55.5 34 55.5 36.5C51 36.5 47 34 44 31Z';
const CROWN = 'M22 15L26 7L29.5 12L32 4L34.5 12L38 7L42 15Z';

function LevelNumber({ level, compact, y = 32, ink = '#FFF6E6', scale = 1 }: {
  level: number; compact: boolean; y?: number; ink?: string; scale?: number;
}) {
  const digits = String(level).length;
  const base = compact ? (digits >= 3 ? 17 : digits === 2 ? 23 : 27) : (digits >= 3 ? 14 : digits === 2 ? 19 : 22);
  const fs = base * scale;
  return (
    <text x="32" y={y + fs * 0.36} textAnchor="middle" fontSize={fs} className="emb-num" fill={ink}>
      {level}
    </text>
  );
}

export default function RankEmblem({ level, size = 32, title }: { level: number; size?: number; title?: string }) {
  const lvl = Math.max(1, Math.floor(level || 1));
  const tier = emblemForLevel(lvl);
  const compact = size < 28;
  const id = useSvgId('emb');
  const g = (k: string) => `${id}${k}`;
  const u = (k: string) => `url(#${id}${k})`;
  const a11y = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true as const, focusable: 'false' as const };

  let art: React.ReactNode;
  let defs: React.ReactNode;

  if (tier.id === 'bronze') {
    defs = (
      <radialGradient id={g('m')} cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stopColor="#D08C55" />
        <stop offset="1" stopColor="#94552B" />
      </radialGradient>
    );
    art = (
      <>
        <circle cx="32" cy="32" r="29.5" fill="#5E3318" />
        <circle cx="32" cy="32" r="27" fill={u('m')} />
        {!compact && <circle cx="32" cy="32" r="23.5" fill="none" stroke="#6E3D1C" strokeWidth="1.2" strokeDasharray="1.6 2.4" />}
        <circle cx="32" cy="32" r={compact ? 21 : 19} fill="#2E1A0E" />
        <LevelNumber level={lvl} compact={compact} ink="#F8E2CC" />
      </>
    );
  } else if (tier.id === 'silver') {
    defs = (
      <>
        <linearGradient id={g('m')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F4F7FA" />
          <stop offset="0.35" stopColor="#B5C0CD" />
          <stop offset="0.52" stopColor="#EEF2F6" />
          <stop offset="0.75" stopColor="#A2AEBC" />
          <stop offset="1" stopColor="#D9E0E8" />
        </linearGradient>
        <pattern id={g('b')} width="64" height="2.2" patternUnits="userSpaceOnUse">
          <rect width="64" height="0.7" fill="#FFFFFF" opacity="0.28" />
        </pattern>
      </>
    );
    art = (
      <>
        <path d={HEX_OUT} fill="#6F7C8C" />
        <path d={poly(32, 32, 28, 6, -Math.PI / 2)} fill={u('m')} />
        {!compact && <path d={poly(32, 32, 28, 6, -Math.PI / 2)} fill={u('b')} />}
        {!compact && <path d={HEX_IN} fill="none" stroke="#7D8A99" strokeWidth="1" />}
        <path d={compact ? poly(32, 32, 22, 6, -Math.PI / 2) : HEX_PLATE} fill="#1C2735" />
        <LevelNumber level={lvl} compact={compact} ink="#F5F8FF" />
      </>
    );
  } else if (tier.id === 'gold') {
    defs = (
      <linearGradient id={g('m')} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#FFF0B8" />
        <stop offset="0.35" stopColor="#E7B144" />
        <stop offset="0.55" stopColor="#FFE38F" />
        <stop offset="1" stopColor="#A86E17" />
      </linearGradient>
    );
    art = (
      <>
        <path d={ROSETTE} fill="#7A4E10" transform="translate(32 32) scale(1.0) translate(-32 -32)" />
        <path d={ROSETTE} fill={u('m')} transform="translate(32 32) scale(0.93) translate(-32 -32)" />
        {!compact && <circle cx="32" cy="32" r="21.5" fill="none" stroke="#A86E17" strokeWidth="1.2" />}
        <circle cx="32" cy="32" r={compact ? 20 : 18} fill="#33210A" />
        {!compact && <path d="M13.2 25A20.5 20.5 0 0 1 25 12.6" fill="none" stroke="#FFFFFF" strokeOpacity="0.7" strokeWidth="2" strokeLinecap="round" />}
        <LevelNumber level={lvl} compact={compact} ink="#FFE7A3" />
      </>
    );
  } else if (tier.id === 'diamond') {
    defs = null;
    art = (
      <>
        <path d={GEM} fill="#1E5F93" stroke="#1E5F93" strokeWidth="3" strokeLinejoin="round" />
        {GEM_FACETS.map(([d, c]) => <path key={d} d={d} fill={c} />)}
        {!compact && <path d={GEM} fill="none" stroke="#E9FCFF" strokeOpacity="0.55" strokeWidth="0.8" strokeLinejoin="round" />}
        <path d={poly(32, 27, compact ? 15 : 13, 6, 0)} fill="#0E2A47" />
        {!compact && <path d="M52 9L53.2 12.8L57 14L53.2 15.2L52 19L50.8 15.2L47 14L50.8 12.8Z" fill="#FFFFFF" />}
        <LevelNumber level={lvl} compact={compact} y={27} ink="#E9FCFF" scale={compact ? 0.9 : 0.86} />
      </>
    );
  } else {
    defs = (
      <>
        <linearGradient id={g('m')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFF0B8" />
          <stop offset="0.4" stopColor="#E3A93A" />
          <stop offset="0.6" stopColor="#FFE38F" />
          <stop offset="1" stopColor="#A4690F" />
        </linearGradient>
        <radialGradient id={g('e')} cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#3B2A7A" />
          <stop offset="1" stopColor="#160F38" />
        </radialGradient>
        <linearGradient id={g('s')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.55" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <clipPath id={g('c')}>
          <path d={WING_L} /><path d={WING_R} /><path d={CROWN} /><circle cx="32" cy="34" r="19" />
        </clipPath>
      </>
    );
    art = (
      <>
        <path d={WING_L} fill={u('m')} stroke="#7A4E10" strokeWidth="0.8" strokeLinejoin="round" />
        <path d={WING_R} fill={u('m')} stroke="#7A4E10" strokeWidth="0.8" strokeLinejoin="round" />
        <path d={CROWN} fill={u('m')} stroke="#7A4E10" strokeWidth="0.8" strokeLinejoin="round" />
        <circle cx="32" cy="34" r="19" fill={u('m')} />
        <circle cx="32" cy="34" r="16" fill={u('e')} />
        {!compact && <circle cx="32" cy="34" r="16" fill="none" stroke="#FFE38F" strokeOpacity="0.5" strokeWidth="0.8" />}
        {!compact && (
          <g clipPath={u('c')}>
            <rect className="emb-sheen" x="-30" y="-10" width="16" height="84" fill={u('s')} transform="skewX(-18)" />
          </g>
        )}
        <LevelNumber level={lvl} compact={compact} y={34} ink="#FFE7A3" scale={compact ? 0.82 : 0.86} />
      </>
    );
  }

  return (
    <svg
      className={`emb emb--${tier.id}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      data-tier={tier.id}
      {...(a11y as React.SVGProps<SVGSVGElement>)}
    >
      {title && <title>{title}</title>}
      {defs && <defs>{defs}</defs>}
      {art}
    </svg>
  );
}

/**
 * "A joué pour son école" — for every student who played for their school
 * this week, top five or not (roadmap #13). A pennant in the school's own
 * colours: deliberately NOT a metal and NOT a rank, so it can never be read
 * as championship scoring. Callers state its meaning in text.
 */
export function ParticipationBadge({ school, size = 32, title }: {
  school?: string | null; size?: number; title?: string;
}) {
  const { primary, secondary } = schoolColors(school || '');
  const compact = size < 28;
  const id = useSvgId('embp');
  const a11y = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true as const, focusable: 'false' as const };
  const flag = 'M17 9L58 22.5L17 36Z';
  return (
    <svg className="emb emb--participation" width={size} height={size} viewBox="0 0 64 64" {...(a11y as React.SVGProps<SVGSVGElement>)}>
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={`${id}p`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7D8A99" />
          <stop offset="0.5" stopColor="#F4F7FA" />
          <stop offset="1" stopColor="#9AA6B4" />
        </linearGradient>
        <clipPath id={`${id}c`}><path d={flag} /></clipPath>
      </defs>
      {/* Base: a small stand, so the pennant reads as planted, not waved. */}
      <ellipse cx="15" cy="57" rx="11" ry="3.5" fill="#365171" />
      <rect x="12" y="5" width="5" height="52" rx="2.5" fill={`url(#${id}p)`} />
      <circle cx="14.5" cy="5.5" r="3.5" fill={`url(#${id}p)`} />
      <path d={flag} fill={primary} stroke={secondary} strokeWidth={compact ? 3 : 2} strokeLinejoin="round" />
      <g clipPath={`url(#${id}c)`}>
        <path d="M17 9H25V36H17Z" fill={secondary} />
        {!compact && <path d="M17 9L58 22.5L17 22.5Z" fill="#FFFFFF" opacity="0.1" />}
      </g>
      <path d="M37 18.2L38.4 21.1L41.6 21.5L39.3 23.7L39.9 26.9L37 25.4L34.1 26.9L34.7 23.7L32.4 21.5L35.6 21.1Z" fill={secondary} />
    </svg>
  );
}
