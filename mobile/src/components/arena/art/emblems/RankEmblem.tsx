import React from 'react';
import Svg, {
  Path, G, Rect, Circle, Ellipse, Defs, ClipPath, LinearGradient, RadialGradient, Stop, Pattern, Text as SvgText,
} from 'react-native-svg';
import { schoolColors } from '../crest/SchoolCrest';
import { EMBLEM_TIERS, emblemForLevel, emblemLabel, type EmblemTier } from './tiers';

export { EMBLEM_TIERS, emblemForLevel, emblemLabel };
export type { EmblemTier };

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
function svgA11y(title?: string) {
  return title
    ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: title }
    : { accessible: false, importantForAccessibility: 'no-hide-descendants' as const };
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
    <SvgText x="32" y={y + fs * 0.36} textAnchor="middle" fontSize={fs} fontWeight="800" fill={ink}>
      {level}
    </SvgText>
  );
}

export default function RankEmblem({ level, size = 32, title }: { level: number; size?: number; title?: string }) {
  const lvl = Math.max(1, Math.floor(level || 1));
  const tier = emblemForLevel(lvl);
  const compact = size < 28;
  const id = useSvgId('emb');
  const g = (k: string) => `${id}${k}`;
  const u = (k: string) => `url(#${id}${k})`;
  const a11y = svgA11y(title);

  let art: React.ReactNode;
  let defs: React.ReactNode;

  if (tier.id === 'bronze') {
    defs = (
      <RadialGradient id={g('m')} cx="0.35" cy="0.3" r="0.8">
        <Stop offset="0" stopColor="#D08C55" />
        <Stop offset="1" stopColor="#94552B" />
      </RadialGradient>
    );
    art = (
      <>
        <Circle cx="32" cy="32" r="29.5" fill="#5E3318" />
        <Circle cx="32" cy="32" r="27" fill={u('m')} />
        {!compact && <Circle cx="32" cy="32" r="23.5" fill="none" stroke="#6E3D1C" strokeWidth="1.2" strokeDasharray="1.6 2.4" />}
        <Circle cx="32" cy="32" r={compact ? 21 : 19} fill="#2E1A0E" />
        <LevelNumber level={lvl} compact={compact} ink="#F8E2CC" />
      </>
    );
  } else if (tier.id === 'silver') {
    defs = (
      <>
        <LinearGradient id={g('m')} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#F4F7FA" />
          <Stop offset="0.35" stopColor="#B5C0CD" />
          <Stop offset="0.52" stopColor="#EEF2F6" />
          <Stop offset="0.75" stopColor="#A2AEBC" />
          <Stop offset="1" stopColor="#D9E0E8" />
        </LinearGradient>
        <Pattern id={g('b')} width="64" height="2.2" patternUnits="userSpaceOnUse">
          <Rect width="64" height="0.7" fill="#FFFFFF" opacity="0.28" />
        </Pattern>
      </>
    );
    art = (
      <>
        <Path d={HEX_OUT} fill="#6F7C8C" />
        <Path d={poly(32, 32, 28, 6, -Math.PI / 2)} fill={u('m')} />
        {!compact && <Path d={poly(32, 32, 28, 6, -Math.PI / 2)} fill={u('b')} />}
        {!compact && <Path d={HEX_IN} fill="none" stroke="#7D8A99" strokeWidth="1" />}
        <Path d={compact ? poly(32, 32, 22, 6, -Math.PI / 2) : HEX_PLATE} fill="#1C2735" />
        <LevelNumber level={lvl} compact={compact} ink="#F5F8FF" />
      </>
    );
  } else if (tier.id === 'gold') {
    defs = (
      <LinearGradient id={g('m')} x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor="#FFF0B8" />
        <Stop offset="0.35" stopColor="#E7B144" />
        <Stop offset="0.55" stopColor="#FFE38F" />
        <Stop offset="1" stopColor="#A86E17" />
      </LinearGradient>
    );
    art = (
      <>
        <Path d={ROSETTE} fill="#7A4E10" transform="translate(32 32) scale(1.0) translate(-32 -32)" />
        <Path d={ROSETTE} fill={u('m')} transform="translate(32 32) scale(0.93) translate(-32 -32)" />
        {!compact && <Circle cx="32" cy="32" r="21.5" fill="none" stroke="#A86E17" strokeWidth="1.2" />}
        <Circle cx="32" cy="32" r={compact ? 20 : 18} fill="#33210A" />
        {!compact && <Path d="M13.2 25A20.5 20.5 0 0 1 25 12.6" fill="none" stroke="#FFFFFF" strokeOpacity="0.7" strokeWidth="2" strokeLinecap="round" />}
        <LevelNumber level={lvl} compact={compact} ink="#FFE7A3" />
      </>
    );
  } else if (tier.id === 'diamond') {
    defs = null;
    art = (
      <>
        <Path d={GEM} fill="#1E5F93" stroke="#1E5F93" strokeWidth="3" strokeLinejoin="round" />
        {GEM_FACETS.map(([d, c]) => <Path key={d} d={d} fill={c} />)}
        {!compact && <Path d={GEM} fill="none" stroke="#E9FCFF" strokeOpacity="0.55" strokeWidth="0.8" strokeLinejoin="round" />}
        <Path d={poly(32, 27, compact ? 15 : 13, 6, 0)} fill="#0E2A47" />
        {!compact && <Path d="M52 9L53.2 12.8L57 14L53.2 15.2L52 19L50.8 15.2L47 14L50.8 12.8Z" fill="#FFFFFF" />}
        <LevelNumber level={lvl} compact={compact} y={27} ink="#E9FCFF" scale={compact ? 0.9 : 0.86} />
      </>
    );
  } else {
    defs = (
      <>
        <LinearGradient id={g('m')} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFF0B8" />
          <Stop offset="0.4" stopColor="#E3A93A" />
          <Stop offset="0.6" stopColor="#FFE38F" />
          <Stop offset="1" stopColor="#A4690F" />
        </LinearGradient>
        <RadialGradient id={g('e')} cx="0.4" cy="0.35" r="0.75">
          <Stop offset="0" stopColor="#3B2A7A" />
          <Stop offset="1" stopColor="#160F38" />
        </RadialGradient>
        <LinearGradient id={g('s')} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
        <ClipPath id={g('c')}>
          <Path d={WING_L} /><Path d={WING_R} /><Path d={CROWN} /><Circle cx="32" cy="34" r="19" />
        </ClipPath>
      </>
    );
    art = (
      <>
        <Path d={WING_L} fill={u('m')} stroke="#7A4E10" strokeWidth="0.8" strokeLinejoin="round" />
        <Path d={WING_R} fill={u('m')} stroke="#7A4E10" strokeWidth="0.8" strokeLinejoin="round" />
        <Path d={CROWN} fill={u('m')} stroke="#7A4E10" strokeWidth="0.8" strokeLinejoin="round" />
        <Circle cx="32" cy="34" r="19" fill={u('m')} />
        <Circle cx="32" cy="34" r="16" fill={u('e')} />
        {!compact && <Circle cx="32" cy="34" r="16" fill="none" stroke="#FFE38F" strokeOpacity="0.5" strokeWidth="0.8" />}
        {!compact && (
          <G clipPath={u('c')}>
            <Rect x="-30" y="-10" width="16" height="84" fill={u('s')} transform="skewX(-18)" />
          </G>
        )}
        <LevelNumber level={lvl} compact={compact} y={34} ink="#FFE7A3" scale={compact ? 0.82 : 0.86} />
      </>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" {...a11y}>
      {defs && <Defs>{defs}</Defs>}
      {art}
    </Svg>
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
  const a11y = svgA11y(title);
  const flag = 'M17 9L58 22.5L17 36Z';
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" {...a11y}>
      <Defs>
        <LinearGradient id={`${id}p`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#7D8A99" />
          <Stop offset="0.5" stopColor="#F4F7FA" />
          <Stop offset="1" stopColor="#9AA6B4" />
        </LinearGradient>
        <ClipPath id={`${id}c`}><Path d={flag} /></ClipPath>
      </Defs>
      {/* Base: a small stand, so the pennant reads as planted, not waved. */}
      <Ellipse cx="15" cy="57" rx="11" ry="3.5" fill="#365171" />
      <Rect x="12" y="5" width="5" height="52" rx="2.5" fill={`url(#${id}p)`} />
      <Circle cx="14.5" cy="5.5" r="3.5" fill={`url(#${id}p)`} />
      <Path d={flag} fill={primary} stroke={secondary} strokeWidth={compact ? 3 : 2} strokeLinejoin="round" />
      <G clipPath={`url(#${id}c)`}>
        <Path d="M17 9H25V36H17Z" fill={secondary} />
        {!compact && <Path d="M17 9L58 22.5L17 22.5Z" fill="#FFFFFF" opacity="0.1" />}
      </G>
      <Path d="M37 18.2L38.4 21.1L41.6 21.5L39.3 23.7L39.9 26.9L37 25.4L34.1 26.9L34.7 23.7L32.4 21.5L35.6 21.1Z" fill={secondary} />
    </Svg>
  );
}
