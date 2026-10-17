import React from 'react';
import Svg, {
  Path, G, Rect, Circle, Defs, ClipPath, LinearGradient, Stop, Text as SvgText,
} from 'react-native-svg';
import { crestSpec, type CrestSpec } from './crestSpec';
import { METALS } from './palette';
import { SHIELDS, DIVISIONS, CHARGES, BANNERS, BANNER_DIVISIONS, chargeCentre } from './geometry';

/**
 * School crests — a generative enamel crest system.
 *
 * Every school gets a crest derived from its name alone: a shield silhouette,
 * a field division, an original charge (book, torch, star, palm, lambi, mòn,
 * quill, rising sun, lamp, tanbou) and a curated colour pair, rimmed in gold
 * or silver like a cloisonné pin. The name is normalised first, so spellings
 * of one school share one crest. Nothing here reproduces a real school's
 * crest or the national arms.
 *
 * Three levels of detail, chosen by size:
 *   < 32px  compact — silhouette, field, charge, heavy rim
 *   < 56px  standard — + cloisonné division lines
 *   ≥ 56px  full — + ribbon with the school's initials, fine charge detail
 */
export interface SchoolColors { primary: string; secondary: string }

/** Two colours derived deterministically from a school's name (field, charge). */
export function schoolColors(name: string): SchoolColors {
  const { palette } = crestSpec(name);
  return { primary: palette.field, secondary: palette.charge };
}

export { crestSpec };

function useSvgId(prefix: string): string {
  const raw = React.useId();
  return `${prefix}${raw.replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

function shade(hex: string, amount: number): string {
  // amount < 0 darkens toward ink, > 0 lightens toward white.
  const h = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const target = amount < 0 ? [10, 18, 32] : [255, 255, 255];
  const a = Math.abs(amount);
  return `#${ch.map((c, i) => Math.round(c + (target[i] - c) * a).toString(16).padStart(2, '0')).join('')}`;
}

function MetalGradient({ id, metal }: { id: string; metal: CrestSpec['palette']['metal'] }) {
  const [light, mid, deep] = METALS[metal];
  return (
    <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
      <Stop offset="0" stopColor={light} />
      <Stop offset="0.38" stopColor={mid} />
      <Stop offset="0.55" stopColor={light} />
      <Stop offset="1" stopColor={deep} />
    </LinearGradient>
  );
}

function ChargeMark({ spec, x, y, scale, detail }: {
  spec: CrestSpec; x: number; y: number; scale: number; detail: boolean;
}) {
  const art = CHARGES[spec.charge];
  const { charge, field } = spec.palette;
  return (
    <G transform={`translate(${x - 24 * scale} ${y - 24 * scale}) scale(${scale})`}>
      <Path d={art.body} fill={charge} />
      {art.strokes && <Path d={art.strokes} fill="none" stroke={charge} strokeWidth={2.4} strokeLinecap="round" />}
      {detail && art.cuts && (
        <Path d={art.cuts} fill="none" stroke={field} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      )}
    </G>
  );
}

function CrestBody({ spec, size, ids }: { spec: CrestSpec; size: number; ids: Record<string, string> }) {
  const compact = size < 32;
  const full = size >= 56;
  const { field, tone, charge } = spec.palette;
  const shield = SHIELDS[spec.shape];
  const division = DIVISIONS[spec.division];
  const c = chargeCentre(spec.division, spec.shape);
  const metal = `url(#${ids.metal})`;
  const ribbonShade = shade(charge, -0.28);
  const letters = spec.monogram.length;
  const fontSize = letters >= 4 ? 9.5 : letters === 3 ? 10.5 : 11.5;

  return (
    <>
      <G transform={full ? 'translate(8 1) scale(0.84)' : undefined}>
        <Path d={shield} fill={field} />
        <G clipPath={`url(#${ids.clip})`}>
          {spec.division === 'bordure' ? (
            <Path d={shield} fill="none" stroke={tone} strokeWidth={compact ? 0 : 18} />
          ) : division ? (
            <Path d={division} fill={tone} stroke={compact ? 'none' : metal} strokeWidth={1.6} />
          ) : null}
          {spec.division === 'bordure' && !compact && (
            <Path d={shield} fill="none" stroke={metal} strokeWidth={1.4}
              transform="translate(50 50) scale(0.82) translate(-50 -50)" />
          )}
          <ChargeMark
            spec={spec}
            x={compact ? 50 : c.x}
            y={compact ? (spec.shape === 'fronton' ? 54 : 48) : c.y}
            scale={compact ? 1.12 : 1}
            detail={full}
          />
          {/* Enamel: one specular highlight, one soft base shadow. */}
          <Path d="M6 4H64C46 12 30 28 21 54L6 64Z" fill="#FFFFFF" opacity={0.14} />
          <Rect x="0" y="0" width="100" height="100" fill={`url(#${ids.depth})`} />
        </G>
        <Path d={shield} fill="none" stroke={metal} strokeWidth={compact ? 8 : 5} strokeLinejoin="round" />
        {!compact && (
          <Path d={shield} fill="none" stroke="#0A1220" strokeOpacity={0.35} strokeWidth={0.8}
            transform="translate(50 50) scale(0.93) translate(-50 -50)" />
        )}
      </G>
      {full && (
        <G>
          <Path d="M15 79L3 81L8.5 87.5L3 94L15 92Z" fill={ribbonShade} />
          <Path d="M85 79L97 81L91.5 87.5L97 94L85 92Z" fill={ribbonShade} />
          <Path d="M12 77Q50 70 88 77V91Q50 84 12 91Z" fill={charge} stroke={metal} strokeWidth={1.1} />
          <SvgText
            x="50" y={84.3 + fontSize * 0.36} textAnchor="middle" fontSize={fontSize}
            fontWeight="800" letterSpacing={0.4}
            fill={field}
          >
            {spec.monogram}
          </SvgText>
        </G>
      )}
    </>
  );
}

function BannerBody({ spec, size, ids }: { spec: CrestSpec; size: number; ids: Record<string, string> }) {
  const compact = size < 40;
  const { field, tone, charge } = spec.palette;
  const cloth = BANNERS[spec.bannerCut];
  const bannerDivision = BANNER_DIVISIONS[spec.division];
  const metal = `url(#${ids.metal})`;
  const letters = spec.monogram.length;
  const fontSize = letters >= 4 ? 13 : 15;
  return (
    <>
      <Path d={cloth} fill={field} />
      <G clipPath={`url(#${ids.clip})`}>
        {spec.division === 'bordure' ? (
          <Path d={cloth} fill="none" stroke={tone} strokeWidth={16} />
        ) : bannerDivision ? (
          <Path d={bannerDivision} fill={tone} stroke={compact ? 'none' : metal} strokeWidth={1.4} />
        ) : null}
        <ChargeMark spec={spec} x={50} y={compact ? 64 : 54} scale={compact ? 1.4 : 1.12} detail={!compact} />
        {!compact && (
          <SvgText x="50" y="100" textAnchor="middle" fontSize={fontSize} fontWeight="800" letterSpacing={0.4} fill={charge}>
            {spec.monogram}
          </SvgText>
        )}
        {/* Cloth folds — matte, one light from the upper left. */}
        <Rect x="0" y="0" width="100" height="140" fill={`url(#${ids.folds})`} />
      </G>
      <Path d={cloth} fill="none" stroke={metal} strokeWidth={compact ? 4 : 2.4} strokeLinejoin="round" />
      {/* The rod and its finials. */}
      <Rect x="6" y="6" width="88" height="6" rx="3" fill={metal} />
      <Circle cx="6" cy="9" r="4.5" fill={metal} />
      <Circle cx="94" cy="9" r="4.5" fill={metal} />
    </>
  );
}

export default function SchoolCrest({ name, size = 48, variant = 'crest', title }: {
  name: string; size?: number; variant?: 'crest' | 'banner'; title?: string;
}) {
  const spec = crestSpec(name);
  const base = useSvgId('crest');
  const ids = { clip: `${base}c`, metal: `${base}m`, depth: `${base}d`, folds: `${base}f` };
  const banner = variant === 'banner';
  return (
    <Svg
      width={size}
      height={banner ? Math.round(size * 1.4) : size}
      viewBox={banner ? '0 0 100 140' : '0 0 100 100'}
      accessible={!!title}
      accessibilityRole={title ? 'image' : undefined}
      accessibilityLabel={title}
      importantForAccessibility={title ? 'yes' : 'no-hide-descendants'}
    >
      <Defs>
        <ClipPath id={ids.clip}><Path d={banner ? BANNERS[spec.bannerCut] : SHIELDS[spec.shape]} /></ClipPath>
        <MetalGradient id={ids.metal} metal={spec.palette.metal} />
        <LinearGradient id={ids.depth} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0.55" stopColor="#0A1220" stopOpacity="0" />
          <Stop offset="1" stopColor="#0A1220" stopOpacity="0.22" />
        </LinearGradient>
        <LinearGradient id={ids.folds} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#0A1220" stopOpacity="0.22" />
          <Stop offset="0.28" stopColor="#0A1220" stopOpacity="0" />
          <Stop offset="0.42" stopColor="#FFFFFF" stopOpacity="0.08" />
          <Stop offset="0.62" stopColor="#0A1220" stopOpacity="0.06" />
          <Stop offset="0.8" stopColor="#FFFFFF" stopOpacity="0.04" />
          <Stop offset="1" stopColor="#0A1220" stopOpacity="0.24" />
        </LinearGradient>
      </Defs>
      {banner ? <BannerBody spec={spec} size={size} ids={ids} /> : <CrestBody spec={spec} size={size} ids={ids} />}
    </Svg>
  );
}
