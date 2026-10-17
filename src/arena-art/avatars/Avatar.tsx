import React from 'react';
import {
  avatarTraits, AvatarMood, AvatarTraitOverrides, HAIR_COLORS, SKIN_TONES, WRAP_FABRICS,
} from './traits';
import './avatars.css';

export type { AvatarMood } from './traits';
export { avatarTraits } from './traits';

export interface AvatarProps {
  seed: string;
  mood?: AvatarMood;
  size?: number;
  colors?: { primary: string; secondary: string };
  still?: boolean;
  title?: string;
  className?: string;
  /** Explicit trait overrides (hair, skin, glasses…) on top of the seed. */
  traits?: AvatarTraitOverrides;
  /** Draw the round backdrop disc (default true). */
  framed?: boolean;
}

/* ── geometry (viewBox 0 0 100 100) ─────────────────────────────── */

const HEAD = 'M29,43C29,27 38,19 50,19C62,19 71,27 71,43C71,57 62,67 50,67C38,67 29,57 29,43Z';
const CAP = 'M28.4,44C27,26 37,16.6 50,16.6C63,16.6 73,26 71.6,44C70.6,38 68.6,34 66,31.6C61,29.6 56,29.2 50,29.6C44,29.2 39,29.6 34,31.6C31.4,34 29.4,38 28.4,44Z';
const FADE_TOP = 'M31.2,35C30.4,20.5 38.6,13.4 50,13.4C61.4,13.4 69.6,20.5 68.8,35C65.4,30.8 59.6,29.4 50,29.6C40.4,29.4 34.6,30.8 31.2,35Z';
const WRAP = 'M26.6,42C24,19.5 35,7.5 50,7.5C65,7.5 76,19.5 73.4,42C68,33.6 59,30.2 50,30.2C41,30.2 32,33.6 26.6,42Z';

/** Circle with coiled, scalloped edge — afros, puffs, buns. */
function coils(cx: number, cy: number, r: number, n: number): string {
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

const L = (d: string, c: string, w: number, extra: React.SVGProps<SVGPathElement> & { key?: React.Key } = {}) => {
  const { key, ...rest } = extra;
  return <path key={key} d={d} fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" {...rest} />;
};

function hairLayers(style: string, base: string, hi: string, wrap: [string, string]) {
  const back: React.ReactNode[] = [];
  const front: React.ReactNode[] = [];
  switch (style) {
    case 'afro':
      back.push(<path key="b" d={coils(50, 31.5, 28.5, 16)} fill={base} />);
      front.push(<path key="c" d={CAP} fill={base} />);
      front.push(L('M37,14.5q3-2.6 6-1.8M57,12.6q3.4.2 5.4 2.6M68,22q1.8 2.6 1.8 5', hi, 1.3, { key: 'h', opacity: 0.8 }));
      break;
    case 'puffs':
      back.push(<path key="l" d={coils(28.5, 21, 11, 9)} fill={base} />);
      back.push(<path key="r" d={coils(71.5, 21, 11, 9)} fill={base} />);
      front.push(<path key="c" d={CAP} fill={base} />);
      front.push(L('M50,17.2V29', hi, 1, { key: 'p' }));
      front.push(L('M24,16.5q2.4-2.4 5.4-2M66,14.5q3-.6 5.4 1.4', hi, 1.2, { key: 'h', opacity: 0.8 }));
      break;
    case 'cornrows':
      front.push(<path key="c" d={CAP} fill={base} />);
      front.push(L('M35,32.5Q36,22 44,17.6M41.6,30.2Q42.6,21 47.4,17M50,29.6V16.8M58.4,30.2Q57.4,21 52.6,17M65,32.5Q64,22 56,17.6', '#000', 1.1, { key: 'r', opacity: 0.5 }));
      front.push(L('M38.4,30.6Q39.4,21.4 45.6,17.6M46,29.6Q46.4,20.4 48.8,17M54,29.6Q53.6,20.4 51.2,17M61.6,30.6Q60.6,21.4 54.4,17.6', hi, 0.9, { key: 'h', strokeDasharray: '1.6 1.1' }));
      break;
    case 'locs': {
      let d = '';
      [0, 1, 2, 3].forEach((i) => {
        const x = 31.5 - i * 1.4;
        d += `M${x},34L${(x - 3 - i * 1.6).toFixed(1)},${70 + i * 2}`;
        const xr = 100 - x;
        d += `M${xr},34L${(xr + 3 + i * 1.6).toFixed(1)},${70 + i * 2}`;
      });
      back.push(L(d, base, 4.4, { key: 'b' }));
      back.push(L('M27.5,48l-1.2,8M74.5,50l1.2,8M25.6,60l-1,6M75.8,62l.8,5', hi, 0.9, { key: 'bh' }));
      front.push(<path key="c" d={CAP} fill={base} />);
      front.push(L('M36,31Q37.5,22 45,17.8M50,29.6V17M64,31Q62.5,22 55,17.8', hi, 1, { key: 'r', strokeDasharray: '2.2 1.4' }));
      break;
    }
    case 'braids':
      back.push(<path key="bun" d={coils(50, 12.5, 8.2, 9)} fill={base} />);
      front.push(<path key="c" d={CAP} fill={base} />);
      front.push(L('M35,32.5Q38,22 47.6,16.6M42,30.2Q44.4,21.6 49,16.6M58,30.2Q55.6,21.6 51,16.6M65,32.5Q62,22 52.4,16.6', hi, 1, { key: 'r', strokeDasharray: '1.8 1.2' }));
      front.push(L('M45.5,9.5q4.5-2.4 9 0', hi, 1, { key: 'bh' }));
      break;
    case 'fade':
      front.push(<path key="s" d={CAP} fill={base} opacity={0.5} />);
      front.push(<path key="t" d={FADE_TOP} fill={base} />);
      front.push(L('M36,22.5Q50,14.5 64,22.5M33.6,28.6Q50,19.4 66.4,28.6M40,17.4Q50,13.4 60,17.4', hi, 1.3, { key: 'h', strokeDasharray: '0.1 2.3', opacity: 0.9 }));
      break;
    case 'headwrap':
      front.push(<path key="c" d={CAP} fill={base} />);
      front.push(<path key="w" d={WRAP} fill={wrap[0]} />);
      front.push(L('M32.5,22Q50,12.5 67.5,22M29.6,30.6Q50,19.6 70.4,30.6', wrap[1], 1.2, { key: 's1', opacity: 0.75 }));
      front.push(L('M41.6,9.8Q39.6,20 40.8,30.4M50,8V29.6M58.4,9.8Q60.4,20 59.2,30.4', wrap[1], 0.8, { key: 's2', opacity: 0.5 }));
      front.push(L('M36,14Q45,21 43,30.4M30,27.5Q37,25.5 41,30.8', '#000', 1.1, { key: 'f', opacity: 0.18 }));
      front.push(L('M27.6,37.6C33,31.4 41,29 50,29S67,31.4 72.4,37.6', '#000', 1.6, { key: 'band', opacity: 0.18 }));
      front.push(<ellipse key="k1" cx="53" cy="10.4" rx="7" ry="4.2" transform="rotate(-28 53 10.4)" fill={wrap[0]} stroke="#000" strokeOpacity=".22" strokeWidth=".8" />);
      front.push(<ellipse key="k2" cx="61.6" cy="11.4" rx="6" ry="3.8" transform="rotate(38 61.6 11.4)" fill={wrap[0]} stroke="#000" strokeOpacity=".22" strokeWidth=".8" />);
      front.push(L('M50,10.6q3.4-2 6.6-.6M58.6,9.6q2.6.8 4.6 3.4', wrap[1], 1, { key: 'k3', opacity: 0.8 }));
      break;
    case 'crop':
    default:
      front.push(<path key="c" d={CAP} fill={base} />);
      front.push(L('M40,20q5-2 10-1.8', hi, 1.1, { key: 'h', opacity: 0.7 }));
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
const f1 = (n: number) => +n.toFixed(2);

function Face({ mood, t, skin, shade, hair }: {
  mood: AvatarMood; t: ReturnType<typeof avatarTraits>; skin: string; shade: string; hair: string;
}) {
  const s = t.eyeSize;
  const lx = 41 - t.eyeGap * 0.5;
  const rx = 59 + t.eyeGap * 0.5;
  const ey = 46;
  const w = 5.4 + t.smile * 1.1;
  const f = FACE[mood];

  const brow = (cx: number, side: 1 | -1, lift = 0) => {
    const [o, m, i] = f.brows;
    return `M${f1(cx - 3.9 * side)},${f1(o - lift)}Q${f1(cx)},${f1(m - 1.2 - lift)} ${f1(cx + 3.9 * side)},${f1(i - lift)}`;
  };

  const eye = (cx: number) => {
    if (mood === 'celebrating') {
      return L(`M${f1(cx - 3.5)},${ey + 1}Q${f1(cx)},${ey - 3.8} ${f1(cx + 3.5)},${ey + 1}`, INK, 2.2, { key: cx });
    }
    const ex = 3.5 * s;
    const eyy = 3.75 * s;
    const ix = cx + f.gaze[0];
    const iy = ey + f.gaze[1];
    // upper lid edge: ends / centre y, then quadratic control through the centre
    const tEnd = ey - 0.9 * s + f.top * 0.35;
    const tMid = ey - eyy + f.top;
    const tCtl = f1(2 * tMid - tEnd);
    const bEnd = ey + 0.7 * s - f.bottom * 0.2;
    const bMid = ey + eyy - f.bottom;
    const bCtl = f1(2 * bMid - bEnd);
    const x0 = f1(cx - ex - 0.6);
    const x1 = f1(cx + ex + 0.6);
    return (
      <g key={cx}>
        <ellipse cx={cx} cy={ey} rx={ex} ry={eyy} fill="#FFFBF4" />
        <ellipse cx={ix} cy={iy} rx={2.5 * s} ry={3.05 * s} fill={INK} />
        <circle cx={ix + 0.95} cy={iy - 1} r=".95" fill="#fff" />
        <circle cx={ix - 0.8} cy={iy + 1.05} r=".42" fill="#fff" opacity=".8" />
        {f.bottom > 0 && <path d={`M${x0},${f1(bEnd)}Q${f1(cx)},${bCtl} ${x1},${f1(bEnd)}V${ey + 5}H${x0}Z`} fill={skin} />}
        <path d={`M${x0},${f1(tEnd)}Q${f1(cx)},${tCtl} ${x1},${f1(tEnd)}V${ey - 6}H${x0}Z`} fill={skin} />
        {L(`M${f1(cx - ex - 0.3)},${f1(tEnd + 0.2)}Q${f1(cx)},${tCtl} ${f1(cx + ex + 0.3)},${f1(tEnd - 0.2)}`, INK, 1.5)}
      </g>
    );
  };

  let mouth: React.ReactNode;
  switch (mood) {
    case 'ready':
      mouth = L(`M${f1(50 - w - 1.2)},56.2l.9,.8Q50,59.6 ${f1(50 + w + 0.3)},57l.9,-.8`, LIP, 1.9);
      break;
    case 'focused':
      mouth = L('M47.8,58.5Q50.6,57.6 53.2,58.7', LIP, 1.8);
      break;
    case 'celebrating':
      mouth = (
        <>
          <path d={`M${f1(50 - w - 1)},55.4Q50,57 ${f1(50 + w + 1)},55.4Q${f1(50 + w)},64.6 50,64.8Q${f1(50 - w)},64.6 ${f1(50 - w - 1)},55.4Z`} fill="#3A1111" />
          <path d={`M${f1(50 - w + 0.2)},56.1Q50,57.4 ${f1(50 + w - 0.2)},56.1L${f1(50 + w - 1)},58.3Q50,59.3 ${f1(50 - w + 1)},58.3Z`} fill="#FFF8F0" />
          <path d="M46,63.2Q50,60.4 54,63.2Q50,64.9 46,63.2Z" fill="#D9676A" />
        </>
      );
      break;
    case 'recovering':
      mouth = (
        <>
          <path d={`M${f1(50 - w + 0.4)},56.6Q50,58.2 ${f1(50 + w + 0.4)},55.6Q${f1(50 + w - 1)},61.4 50.4,61.5Q${f1(50 - w + 1.4)},61 ${f1(50 - w + 0.4)},56.6Z`} fill="#3A1111" />
          <path d={`M${f1(50 - w + 1)},56.9Q50,58.3 ${f1(50 + w - 0.2)},56L${f1(50 + w - 1)},57.7Q50,59.1 ${f1(50 - w + 1.6)},58.3Z`} fill="#FFF8F0" />
          {L(`M${f1(50 + w + 1)},54.9l.8,1.2`, LIP, 1.1)}
        </>
      );
      break;
    default:
      mouth = L(`M${f1(50 - w)},56.9Q50,${f1(60.4 + t.smile * 0.7)} ${f1(50 + w)},56.9`, LIP, 1.8);
  }

  const blush = mood === 'celebrating' ? 0.36 : mood === 'recovering' ? 0.26 : 0.2;
  const lift = mood === 'recovering' ? 0.9 : 0;
  return (
    <g className="av-face">
      <ellipse cx="36.2" cy="53.8" rx="3.6" ry="2.1" fill="#E5604C" opacity={blush} />
      <ellipse cx="63.8" cy="53.8" rx="3.6" ry="2.1" fill="#E5604C" opacity={blush} />
      <g className="av-eyes">{eye(lx)}{eye(rx)}</g>
      {L(brow(lx, 1) + brow(rx, -1, lift), hair, t.browWeight)}
      {L('M48.5,51.4Q50,53.7 51.5,51.4', shade, 1.5)}
      {mouth}
      {mood === 'recovering' && L('M76.5,25.5l3.2-3.2M78.6,31h4.2M73.4,21.2l.9-4.2', '#F2C230', 1.6, { className: 'av-spark' })}
    </g>
  );
}

const CONFETTI: Array<[number, number, number]> = [
  [-36, -14, 160], [32, -22, -120], [-20, -30, 200], [40, -4, 90],
  [-42, 6, -150], [12, -36, 240], [44, 16, -200], [-8, -40, 130], [24, 4, 180],
];
const CONFETTI_COLORS = ['#F2C230', '#FF7A59', '#5BC0EB', '#7BE0A0'];

function Avatar({
  seed, mood = 'idle', size = 96, colors, still = false, title, className, traits: overrides, framed = true,
}: AvatarProps) {
  const rid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const t = React.useMemo(() => avatarTraits(seed, overrides), [seed, overrides]);
  const c = colors ?? t.colors;
  const [skin, shade] = SKIN_TONES[t.skin % SKIN_TONES.length];
  const [hair, hi] = HAIR_COLORS[t.hairColor % HAIR_COLORS.length];
  const wrap = WRAP_FABRICS[t.wrap % WRAP_FABRICS.length];
  const small = size < 56;
  const pointed = t.uniform !== 'piping';
  const frame = t.wrap % 2 ? '#7A3F22' : '#1C1A24';
  const hl = React.useMemo(() => hairLayers(t.hair, hair, hi, wrap), [t.hair, hair, hi, wrap]);

  const cls = ['av', `av--${mood}`, still && 'av--still', small && 'av--small', className].filter(Boolean).join(' ');
  const a11y = title
    ? { role: 'img', 'aria-labelledby': `${rid}t` }
    : { 'aria-hidden': true as const, focusable: 'false' as const };

  return (
    <svg
      className={cls} width={size} height={size} viewBox="0 0 100 100"
      style={{ '--av-blink': `${t.blinkDelay}s` } as React.CSSProperties}
      {...a11y}
    >
      {title && <title id={`${rid}t`}>{title}</title>}
      <defs>
        <clipPath id={`${rid}c`}><circle cx="50" cy="50" r="50" /></clipPath>
      </defs>
      {framed && (
        <>
          <circle cx="50" cy="50" r="50" fill="#14254A" />
          <circle cx="50" cy="50" r="50" fill={c.primary} opacity=".32" />
          <circle cx="50" cy="38" r="34" fill="#fff" opacity=".07" />
        </>
      )}
      <g clipPath={`url(#${rid}c)`}>
        <g className="av-body">
          <g className="av-pose">
            {/* uniform */}
            <path d="M10,100C10,84 22,75.5 38,73L62,73C78,75.5 90,84 90,100Z" fill={c.primary} />
            <path d="M10,100C10,90 14,84 20,80.5Q18,90 19,100ZM90,100C90,90 86,84 80,80.5Q82,90 81,100Z" fill="#000" opacity=".1" />
            <path d="M42.5,58H57.5V72L50,80.5L42.5,72Z" fill={skin} />
            <path d="M42.5,59.5Q50,67 57.5,59.5V65Q50,71 42.5,65Z" fill={shade} />
            {L('M50,80.5V100', '#000', 0.9, { opacity: 0.2 })}
            <circle cx="50" cy="88" r=".95" fill={c.secondary} />
            <circle cx="50" cy="95" r=".95" fill={c.secondary} />
            <path d="M40.6,70.4Q50,67.8 59.4,70.4L58.4,73.4Q50,71.2 41.6,73.4Z" fill={c.secondary} />
            <path
              d="M40.8,70.6L50,80.5L43.6,87.4L35.2,74.6ZM59.2,70.6L50,80.5L56.4,87.4L64.8,74.6Z"
              fill={pointed ? c.secondary : c.primary}
              stroke={pointed ? '#000' : c.secondary} strokeOpacity={pointed ? 0.15 : 1}
              strokeWidth={pointed ? 0.6 : 1.4} strokeLinejoin="round"
            />
            {t.uniform === 'epaulettes' && (
              <>
                <path d="M16.8,83L33.4,75.6L35.2,78.8L19,86.6ZM83.2,83L66.6,75.6L64.8,78.8L81,86.6Z" fill={c.secondary} />
                <circle cx="31.6" cy="77.9" r="1.05" fill={c.primary} />
                <circle cx="68.4" cy="77.9" r="1.05" fill={c.primary} />
              </>
            )}
            {t.uniform === 'piping' && L('M19,85Q29,77.6 38.6,74.2M81,85Q71,77.6 61.4,74.2', c.secondary, 1.6)}
            <path d="M61.2,86.4H67.2V90.4Q67.2,93.4 64.2,94.6Q61.2,93.4 61.2,90.4Z" fill={c.secondary} stroke="#000" strokeOpacity=".15" strokeWidth=".5" />
            <path d="M64.2,88l.7,1.5 1.6.2-1.2 1 .3 1.6-1.4-.8-1.4.8.3-1.6-1.2-1 1.6-.2Z" fill={c.primary} />

            <g className="av-hpose">
              <g className="av-hanim">
                {hl.back}
                <ellipse cx="29.6" cy="45.5" rx="3.7" ry="5.2" fill={skin} />
                <ellipse cx="70.4" cy="45.5" rx="3.7" ry="5.2" fill={skin} />
                <ellipse cx="29.9" cy="46" rx="1.6" ry="2.9" fill={shade} />
                <ellipse cx="70.1" cy="46" rx="1.6" ry="2.9" fill={shade} />
                <path d={HEAD} fill={skin} />
                {t.earrings && !small && (
                  <>
                    <circle cx="29" cy="51.2" r="1.15" fill="#F2C230" />
                    <circle cx="71" cy="51.2" r="1.15" fill="#F2C230" />
                  </>
                )}
                {hl.front}
                <Face key={mood} mood={mood} t={t} skin={skin} shade={shade} hair={hair} />
                {t.glasses !== 'none' && (
                  <g fill="#fff" fillOpacity=".12" stroke={frame} strokeWidth="1.3">
                    {t.glasses === 'round' ? (
                      <>
                        <circle cx={41 - t.eyeGap * 0.5} cy="46" r="5.5" />
                        <circle cx={59 + t.eyeGap * 0.5} cy="46" r="5.5" />
                      </>
                    ) : (
                      <>
                        <rect x={35.3 - t.eyeGap * 0.5} y="41.6" width="11.4" height="8.8" rx="2.4" />
                        <rect x={53.3 + t.eyeGap * 0.5} y="41.6" width="11.4" height="8.8" rx="2.4" />
                      </>
                    )}
                    <path d="M46.4,45.4Q50,43.8 53.6,45.4M35.4,44.6L30.4,43.4M64.6,44.6L69.6,43.4" fill="none" />
                  </g>
                )}
              </g>
            </g>
          </g>
        </g>
      </g>
      {mood === 'celebrating' && !small && !still && (
        <g className="av-confetti">
          {CONFETTI.map(([dx, dy, rot], i) => {
            const fill = i % 4 === 3 ? c.secondary : CONFETTI_COLORS[i % CONFETTI_COLORS.length];
            const st = { '--dx': `${dx}px`, '--dy': `${dy}px`, '--rot': `${rot}deg`, animationDelay: `${(i % 3) * 40}ms` } as React.CSSProperties;
            return i % 3 === 1
              ? <circle key={i} cx="50" cy="30" r="1.6" fill={fill} style={st} />
              : <rect key={i} x="48.4" y="29.2" width="3.4" height="1.7" rx=".4" fill={fill} style={st} />;
          })}
        </g>
      )}
    </svg>
  );
}

export default React.memo(Avatar);
