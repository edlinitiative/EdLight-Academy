import React from 'react';
import { G, Rect, Path, Ellipse } from 'react-native-svg';
import {
  C, Occasion, Pt, Ridge, Fortress, HillLights, CityRow, Stars, Moon, Clouds,
  Stadium, Lamp, Palm, Mango, Bunting, TapTap, People, GingerbreadArt, CottageArt, type HouseTone,
} from './parts';

/**
 * The TALL (900 x 1400, ≈ 9:14) phone composition of the Arène night world,
 * ported from the web's scenes.tsx. Static: the web's ambient CSS motion
 * (cloud drift, twinkles, floodlight sweep) is not reproduced on the phone.
 */

type SceneProps = { occ: Occasion; a: string; b: string; p: string };

function Gingerbread({ x, base, w, tone }: { x: number; base: number; w: number; tone: HouseTone; p?: string }) {
  const h = (w * 160) / 120;
  return <GingerbreadArt x={x} y={base - h} w={w} tone={tone} />;
}
function Cottage({ x, base, w, tone }: { x: number; base: number; w: number; tone: HouseTone; p?: string }) {
  const h = (w * 92) / 100;
  return <CottageArt x={x} y={base - h} w={w} tone={tone} />;
}

const FG: HouseTone = { b: '#0A1638', r: '#060D24', t: '#1E3570', w: '#F4C783' };
const MIDT: HouseTone = { b: '#10224F', r: '#0B1838', t: '#2A4686', w: '#FFD9A0' };

function bunt(occ: Occasion, a: string, b: string) {
  return occ === 'championship' ? [C.gold, a, '#F4F1E8', b] : [a, '#F4F1E8', b];
}

const T_FAR: Pt[] = [[0, 612], [90, 584], [190, 566], [300, 572], [400, 540], [470, 506], [520, 478], [546, 462], [574, 470], [640, 500], [720, 512], [800, 530], [900, 540]];
const T_MID: Pt[] = [[0, 680], [110, 652], [220, 634], [330, 652], [450, 644], [560, 624], [680, 610], [780, 630], [900, 614]];
const T_NEAR: Pt[] = [[0, 770], [200, 756], [450, 760], [700, 752], [900, 758]];

export function TallScene({ occ, a, b, p }: SceneProps) {
  const lit = occ !== 'everyday';
  const champ = occ === 'championship';
  return (
    <G>
      <Rect width="900" height="1400" fill={`url(#${p}sky)`} />
      <Stars n={60} w={900} h={560} seed={17} />
      <Moon x={196} y={196} r={30} p={p} />
      <Clouds items={[[300, 300, 190, 10], [380, 316, 90, 6], [690, 240, 160, 9]]} />
      <Rect y="460" width="900" height="560" fill={`url(#${p}haze)`} />
      {champ && <Rect y="320" width="900" height="700" fill={`url(#${p}hazeG)`} />}

      <Ridge pts={T_FAR} bottom={900} fill={C.far} rim="#33569E" />
      <Fortress x={547} y={476} s={0.92} p={p} />
      <Ridge pts={T_MID} bottom={900} fill={C.mid} rim="#24438C" rimOp={0.5} />
      <HillLights pts={T_MID} ranges={[[0, 900]]} depth={110} n={150} seed={23} />
      <Ridge pts={T_NEAR} bottom={1400} fill={C.near} />
      <CityRow p={p} x0={-4} x1={904} base={784} scale={1.1} seed={31} fill={C.city} lit={0.5} flick={3} />

      <Path d="M0 902Q450 884 900 902V1220H0Z" fill={C.district} />
      <Stadium cx={450} cy={790} rx={332} ry={74} depth={96} occ={occ} a={a} b={b} p={p} seed={41} front={318} back={226} arches={7} />

      <Ellipse cx="450" cy="944" rx="360" ry="44" fill={`url(#${p}pool)`} opacity={lit ? 1 : 0.6} />
      <CityRow p={p} x0={-6} x1={906} base={1010} scale={2.1} seed={33} fill="#12285F" lit={0.55} flick={2} />
      <Cottage x={316} base={1150} w={170} tone={MIDT} p={p} />
      <Cottage x={500} base={1140} w={120} tone={MIDT} p={p} />
      <Mango x={640} base={1170} s={0.95} fill="#060E26" />

      <People cx={450} cy={956} rx={300} ry={22} n={occ === 'everyday' ? 7 : champ ? 40 : 26} s={1.9} seed={61} flags={lit ? [a, b] : undefined} />

      {/* street */}
      <Rect y="1210" width="900" height="190" fill={`url(#${p}street)`} />
      <Rect y="1210" width="900" height="9" fill="#12224C" />
      <Path d="M0 1300h900" stroke="#1A2C5C" strokeWidth="2.5" strokeDasharray="40 36" opacity="0.6" />

      <Gingerbread x={-56} base={1226} w={300} tone={FG} p={p} />
      <Lamp x={310} base={1218} h={250} p={p} />
      <Palm x={872} base={1224} tx={806} ty={424} size={150} p={p} seed={9} />

      <TapTap x={392} y={1312} s={1.18} p={p} lit />

      {lit && <Bunting a={[150, 1004]} b={[340, 1006]} sag={30} colors={bunt(occ, a, b)} n={8} size={1.3} />}
      {lit && <Bunting a={[340, 1006]} b={[836, 960]} sag={60} colors={bunt(occ, a, b)} n={17} size={1.3} />}
      {champ && <Bunting a={[123, 560]} b={[777, 560]} sag={70} colors={[C.gold, a, '#F4F1E8', b]} n={22} size={1.2} />}
      <Rect y="1330" width="900" height="70" fill="#02060F" opacity="0.3" />
    </G>
  );
}
