import React from 'react';
import {
  C, Occasion, Pt, Ridge, Fortress, HillLights, CityRow, Stars, Moon, Clouds,
  Stadium, Lamp, Palm, Mango, Bunting, TapTap, People,
} from './parts';

type SceneProps = { occ: Occasion; a: string; b: string; p: string };

type Tone = { b: string; r: string; t: string; w?: string };
const vars = (tone: Tone) =>
  ({ '--b': tone.b, '--r': tone.r, '--t': tone.t, '--w': tone.w || C.win } as React.CSSProperties);

/** Foreground gingerbread house (symbol is 120 x 160). */
function Gingerbread({ x, base, w, tone, p }: { x: number; base: number; w: number; tone: Tone; p: string }) {
  const h = (w * 160) / 120;
  return <use href={`#${p}gb`} x={x} y={base - h} width={w} height={h} style={vars(tone)} />;
}
function Cottage({ x, base, w, tone, p }: { x: number; base: number; w: number; tone: Tone; p: string }) {
  const h = (w * 92) / 100;
  return <use href={`#${p}ct`} x={x} y={base - h} width={w} height={h} style={vars(tone)} />;
}

const FG: Tone = { b: '#0A1638', r: '#060D24', t: '#1E3570', w: '#F4C783' };
const FG2: Tone = { b: '#0D1C46', r: '#08122E', t: '#24407E' };
const MIDT: Tone = { b: '#10224F', r: '#0B1838', t: '#2A4686', w: '#FFD9A0' };

function bunt(occ: Occasion, a: string, b: string) {
  return occ === 'championship' ? [C.gold, a, '#F4F1E8', b] : [a, '#F4F1E8', b];
}

/* ================================================================== */
/* WIDE — 1600 x 700, desktop. Stadium centred, street framed by       */
/* gingerbread houses, Citadelle on the right-hand ridge.              */
/* ================================================================== */

const W_FAR: Pt[] = [[0, 360], [90, 340], [200, 314], [300, 324], [420, 298], [540, 318], [650, 302], [760, 322], [880, 306], [990, 282], [1090, 258], [1160, 238], [1212, 214], [1236, 206], [1262, 214], [1310, 240], [1400, 266], [1500, 286], [1600, 298]];
const W_MID: Pt[] = [[0, 420], [80, 404], [180, 384], [290, 396], [380, 376], [470, 390], [560, 402], [680, 412], [800, 408], [920, 412], [1040, 400], [1130, 384], [1230, 372], [1330, 386], [1440, 372], [1530, 388], [1600, 382]];
const W_NEAR: Pt[] = [[0, 478], [150, 470], [320, 476], [520, 486], [800, 490], [1080, 486], [1280, 474], [1450, 468], [1600, 472]];

export function WideScene({ occ, a, b, p }: SceneProps) {
  const lit = occ !== 'everyday';
  const champ = occ === 'championship';
  return (
    <g>
      <rect width="1600" height="700" fill={`url(#${p}sky)`} />
      <Stars n={70} w={1600} h={300} seed={7} />
      {/* Moon right of centre: the lobby title sits top-left over this scene. */}
      <Moon x={1060} y={92} r={24} p={p} />
      <Clouds items={[[430, 150, 170, 9], [540, 164, 90, 6], [1160, 104, 210, 11], [1290, 121, 120, 7], [820, 70, 120, 5]]} />
      <rect y="240" width="1600" height="320" fill={`url(#${p}haze)`} />
      {champ && <rect y="160" width="1600" height="400" fill={`url(#${p}hazeG)`} />}

      <Ridge pts={W_FAR} bottom={560} fill={C.far} rim="#33569E" />
      <Fortress x={1237} y={218} s={0.82} p={p} />
      <Ridge pts={W_MID} bottom={560} fill={C.mid} rim="#24438C" rimOp={0.5} />
      <HillLights pts={W_MID} ranges={[[0, 560], [1040, 1600]]} depth={70} n={170} seed={11} />
      <Ridge pts={W_NEAR} bottom={700} fill={C.near} />
      <CityRow p={p} x0={-4} x1={540} base={492} scale={0.9} seed={3} fill={C.city} lit={0.55} flick={3} />
      <CityRow p={p} x0={1060} x1={1604} base={488} scale={0.9} seed={5} fill={C.city} lit={0.55} flick={3} />

      <path d="M0 520Q400 506 800 512T1600 516V610H0Z" fill={C.district} />
      <Stadium cx={800} cy={418} rx={272} ry={58} depth={74} occ={occ} a={a} b={b} p={p} seed={21} front={206} back={150} />

      <ellipse cx="800" cy="566" rx="320" ry="34" fill={`url(#${p}pool)`} opacity={lit ? 1 : 0.6} />
      <CityRow p={p} x0={-6} x1={470} base={556} scale={1.5} seed={8} fill="#12285F" lit={0.6} flick={2} />
      <CityRow p={p} x0={1130} x1={1606} base={556} scale={1.5} seed={9} fill="#12285F" lit={0.6} flick={2} />
      <Cottage x={392} base={598} w={120} tone={MIDT} p={p} />
      <Cottage x={1096} base={598} w={116} tone={MIDT} p={p} />

      <People cx={800} cy={574} rx={250} ry={16} n={occ === 'everyday' ? 9 : champ ? 46 : 30} s={1.25} seed={51} flags={lit ? [a, b] : undefined} />

      {/* street */}
      <rect y="596" width="1600" height="104" fill={`url(#${p}street)`} />
      <rect y="596" width="1600" height="7" fill="#12224C" />
      <path d="M0 652h1600" stroke="#1A2C5C" strokeWidth="2" strokeDasharray="34 30" opacity="0.6" />

      <Gingerbread x={168} base={604} w={168} tone={FG2} p={p} />
      <Gingerbread x={-34} base={614} w={226} tone={FG} p={p} />
      <Palm x={318} base={612} tx={352} ty={318} size={118} p={p} seed={4} />
      <Lamp x={520} base={604} h={176} p={p} />
      <Lamp x={1080} base={604} h={176} p={p} />
      <Mango x={1236} base={608} s={1.05} fill="#060E26" />
      <Gingerbread x={1392} base={616} w={236} tone={FG} p={p} />

      <TapTap x={590} y={672} s={0.92} p={p} lit />

      {lit && (
        <>
          <Bunting a={[168, 420]} b={[541, 431]} sag={34} colors={bunt(occ, a, b)} n={14} />
          <Bunting a={[1101, 431]} b={[1430, 414]} sag={34} colors={bunt(occ, a, b)} n={13} />
        </>
      )}
      {champ && <Bunting a={[541, 431]} b={[1101, 431]} sag={46} colors={[C.gold, a, '#F4F1E8', b]} n={26} size={0.9} />}
      <rect y="640" width="1600" height="60" fill="#02060F" opacity="0.25" />
    </g>
  );
}

/* ================================================================== */
/* TALL — 900 x 1400, phone. Composed vertically around the stadium:   */
/* moon top-left, Citadelle top-right, a palm framing the right edge,  */
/* the gingerbread house and a lamp framing the street at the bottom.  */
/* ================================================================== */

const T_FAR: Pt[] = [[0, 612], [90, 584], [190, 566], [300, 572], [400, 540], [470, 506], [520, 478], [546, 462], [574, 470], [640, 500], [720, 512], [800, 530], [900, 540]];
const T_MID: Pt[] = [[0, 680], [110, 652], [220, 634], [330, 652], [450, 644], [560, 624], [680, 610], [780, 630], [900, 614]];
const T_NEAR: Pt[] = [[0, 770], [200, 756], [450, 760], [700, 752], [900, 758]];

export function TallScene({ occ, a, b, p }: SceneProps) {
  const lit = occ !== 'everyday';
  const champ = occ === 'championship';
  return (
    <g>
      <rect width="900" height="1400" fill={`url(#${p}sky)`} />
      <Stars n={60} w={900} h={560} seed={17} />
      <Moon x={196} y={196} r={30} p={p} />
      <Clouds items={[[300, 300, 190, 10], [380, 316, 90, 6], [690, 240, 160, 9]]} />
      <rect y="460" width="900" height="560" fill={`url(#${p}haze)`} />
      {champ && <rect y="320" width="900" height="700" fill={`url(#${p}hazeG)`} />}

      <Ridge pts={T_FAR} bottom={900} fill={C.far} rim="#33569E" />
      <Fortress x={547} y={476} s={0.92} p={p} />
      <Ridge pts={T_MID} bottom={900} fill={C.mid} rim="#24438C" rimOp={0.5} />
      <HillLights pts={T_MID} ranges={[[0, 900]]} depth={110} n={150} seed={23} />
      <Ridge pts={T_NEAR} bottom={1400} fill={C.near} />
      <CityRow p={p} x0={-4} x1={904} base={784} scale={1.1} seed={31} fill={C.city} lit={0.5} flick={3} />

      <path d="M0 902Q450 884 900 902V1220H0Z" fill={C.district} />
      <Stadium cx={450} cy={790} rx={332} ry={74} depth={96} occ={occ} a={a} b={b} p={p} seed={41} front={318} back={226} arches={7} />

      <ellipse cx="450" cy="944" rx="360" ry="44" fill={`url(#${p}pool)`} opacity={lit ? 1 : 0.6} />
      <CityRow p={p} x0={-6} x1={906} base={1010} scale={2.1} seed={33} fill="#12285F" lit={0.55} flick={2} />
      <Cottage x={316} base={1150} w={170} tone={MIDT} p={p} />
      <Cottage x={500} base={1140} w={120} tone={MIDT} p={p} />
      <Mango x={640} base={1170} s={0.95} fill="#060E26" />

      <People cx={450} cy={956} rx={300} ry={22} n={occ === 'everyday' ? 7 : champ ? 40 : 26} s={1.9} seed={61} flags={lit ? [a, b] : undefined} />

      {/* street */}
      <rect y="1210" width="900" height="190" fill={`url(#${p}street)`} />
      <rect y="1210" width="900" height="9" fill="#12224C" />
      <path d="M0 1300h900" stroke="#1A2C5C" strokeWidth="2.5" strokeDasharray="40 36" opacity="0.6" />

      <Gingerbread x={-56} base={1226} w={300} tone={FG} p={p} />
      <Lamp x={310} base={1218} h={250} p={p} />
      <Palm x={872} base={1224} tx={806} ty={424} size={150} p={p} seed={9} />

      <TapTap x={392} y={1312} s={1.18} p={p} lit />

      {lit && <Bunting a={[150, 1004]} b={[340, 1006]} sag={30} colors={bunt(occ, a, b)} n={8} size={1.3} />}
      {lit && <Bunting a={[340, 1006]} b={[836, 960]} sag={60} colors={bunt(occ, a, b)} n={17} size={1.3} />}
      {champ && <Bunting a={[123, 560]} b={[777, 560]} sag={70} colors={[C.gold, a, '#F4F1E8', b]} n={22} size={1.2} />}
      <rect y="1330" width="900" height="70" fill="#02060F" opacity="0.3" />
    </g>
  );
}
