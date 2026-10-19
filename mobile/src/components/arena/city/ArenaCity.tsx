/**
 * The Arène city on the phone — the native twin of the web /arena hero
 * (src/pages/arena/ArenaArcade.tsx + ArenaHome.css "ah-" layers):
 *
 *   sky      a deep night gradient, a moon, two star layers
 *   far      an anonymous far skyline with a few lit windows
 *   mornes   the hills behind the city
 *   street   the real schools of the board as pixel buildings, tallest in
 *            the middle (shared/arena/arcadeCity.cityLineup), your school lit
 *   ticker   the real standings scrolling under the street
 *
 * Cost: every layer is a memoized SVG of a few paths (the far city is TWO
 * paths, a building ~10 — shared paintLayers). Motion is Reanimated on the UI
 * thread only — star twinkle, your building's beacon, the ticker — with no JS
 * per frame. Nothing moves under Reduce Motion or while `animate` is false
 * (the screen is not focused): the city is then a complete still frame.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import { farSkyline, MORNES_PATH, towerTag, type CityTower } from '../../../../../shared/arena/arcadeCity';
import { TEAM_SIZE, type TeamStanding } from '../../../../../shared/leaderboardAgg';
import { useReduceMotion } from '../../../utils/motion';
import { arenaColors as C, arenaType } from '../../../theme/arenaTheme';
import { fonts } from '../../../theme/theme';
import { groupDigits } from '../../games/night';
import SchoolBuilding from './SchoolBuilding';

type T = (fr: string, ht: string) => string;

export const CITY_HEIGHT = 300;
const STREET_H = 26;
const CELL = 4;

/* ── Static art, built once per app run ─────────────────────────────────── */

const FAR = farSkyline();
const FAR_BODY = FAR.map((b) => `M${b.x} ${220 - b.h}h${b.w}v${b.h}h${-b.w}Z`).join('');
const FAR_LIT = FAR.flatMap((b) => b.lit).map((w) => `M${w.x} ${w.y}h4v5h-4Z`).join('');

/** Deterministic stars on a 400 × 220 sky, split in two layers that twinkle out of phase. */
function starPaths(seed = 11): [string, string] {
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  let a = '';
  let b = '';
  for (let i = 0; i < 70; i += 1) {
    const x = Math.round(rnd() * 400);
    const y = Math.round(rnd() * 170);
    const r = rnd() < 0.18 ? 2 : 1;
    const seg = `M${x} ${y}h${r}v${r}h${-r}Z`;
    if (i % 2) a += seg; else b += seg;
  }
  return [a, b];
}
const [STARS_A, STARS_B] = starPaths();

const Sky = React.memo(function Sky() {
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice" pointerEvents="none">
      <Defs>
        <LinearGradient id="cityNight" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#030817" />
          <Stop offset="0.55" stopColor="#0B1A3A" />
          <Stop offset="1" stopColor="#1B2C5C" />
        </LinearGradient>
        <RadialGradient id="cityMoon" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#FFF4D6" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#FFF4D6" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="cityHorizon" cx="0.5" cy="1" r="0.7">
          <Stop offset="0" stopColor="#FF6A45" stopOpacity="0.22" />
          <Stop offset="1" stopColor="#FF6A45" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="400" height="300" fill="url(#cityNight)" />
      <Rect x="0" y="150" width="400" height="150" fill="url(#cityHorizon)" />
      <Circle cx="322" cy="54" r="40" fill="url(#cityMoon)" />
      <Circle cx="322" cy="54" r="15" fill="#FFF1C9" />
      <Circle cx="328" cy="50" r="13" fill="#0E1E42" opacity="0.9" />
    </Svg>
  );
});

const StarLayer = React.memo(function StarLayer({ d }: { d: string }) {
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 400 300" preserveAspectRatio="xMidYMin slice" pointerEvents="none">
      <Path d={d} fill="#DCE6FF" />
    </Svg>
  );
});

const FarCity = React.memo(function FarCity() {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: STREET_H + 40, height: 130 }}>
      <Svg width="100%" height="100%" viewBox="0 0 1600 220" preserveAspectRatio="xMidYMax slice">
        <Path d={FAR_BODY} fill="#0E1B3D" />
        <Path d={FAR_LIT} fill="#F6D776" opacity={0.55} />
      </Svg>
    </View>
  );
});

const Mornes = React.memo(function Mornes() {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: STREET_H, height: 76 }}>
      <Svg width="100%" height="100%" viewBox="0 0 1600 200" preserveAspectRatio="none">
        <Path d={MORNES_PATH} fill="#0A1530" />
      </Svg>
    </View>
  );
});

/* ── Motion helpers (UI thread only) ────────────────────────────────────── */

function useLoop(on: boolean, ms: number) {
  const v = useSharedValue(0);
  useEffect(() => {
    if (on) v.value = withRepeat(withTiming(1, { duration: ms, easing: Easing.inOut(Easing.sin) }), -1, true);
    else { cancelAnimation(v); v.value = 0; }
    return () => cancelAnimation(v);
  }, [on, ms, v]);
  return v;
}

/* ── The street ─────────────────────────────────────────────────────────── */

function Tower({ s, mine, animate, t }: { s: CityTower; mine: boolean; animate: boolean; t: T }) {
  const beat = useLoop(animate && mine, 1400);
  const beacon = useAnimatedStyle(() => ({ opacity: 0.45 + beat.value * 0.55, transform: [{ scale: 0.85 + beat.value * 0.3 }] }));
  const tag = towerTag(s, TEAM_SIZE);
  const label = [
    s.label,
    mine ? t('ton école', 'lekòl ou') : null,
    s.qualified && s.rank > 0
      ? t(`${s.rank}e place`, `${s.rank}yèm plas`)
      : t(`${Math.min(s.members, TEAM_SIZE)} joueurs sur ${TEAM_SIZE}`, `${Math.min(s.members, TEAM_SIZE)} jwè sou ${TEAM_SIZE}`),
    s.qualified ? `${groupDigits(s.teamXp)} XP` : null,
  ].filter(Boolean).join(', ');
  return (
    <View accessible accessibilityLabel={label} style={{ alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
      {mine ? (
        <Animated.View
          testID="city-beacon"
          style={[{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.coral }, animate ? beacon : null]}
        />
      ) : null}
      <View
        style={{
          maxWidth: 112, flexDirection: 'row', alignItems: 'center', gap: 5,
          paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
          backgroundColor: mine ? C.coral : 'rgba(19,36,63,0.92)',
        }}
      >
        <Text maxFontSizeMultiplier={1.5} style={{ fontFamily: fonts.bold, fontSize: 13, color: mine ? C.onCoral : C.gold, fontVariant: ['tabular-nums'] }}>{tag}</Text>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.5} style={{ flexShrink: 1, fontFamily: fonts.medium, fontSize: 13, color: mine ? C.onCoral : C.inkSoft }}>{s.label}</Text>
      </View>
      <SchoolBuilding name={s.label} floors={s.floors} night cell={CELL} />
    </View>
  );
}

export interface ArenaCityProps {
  towers: CityTower[];
  /** The student's school key (normalised), to light their building. */
  myKey: string | null;
  /** The ticker's standings (real board order). */
  standings: TeamStanding[];
  /** False when the screen is not focused: the city holds still. */
  animate?: boolean;
  t: T;
}

function ArenaCity({ towers, myKey, standings, animate = true, t }: ArenaCityProps) {
  const reduce = useReduceMotion();
  const moving = animate && !reduce;
  const twinkle = useLoop(moving, 2600);
  const starsA = useAnimatedStyle(() => ({ opacity: 0.35 + twinkle.value * 0.65 }));
  const starsB = useAnimatedStyle(() => ({ opacity: 1 - twinkle.value * 0.6 }));

  return (
    <View>
      <View style={{ height: CITY_HEIGHT, overflow: 'hidden', backgroundColor: '#050B1A' }}>
        <Sky />
        <Animated.View testID="city-stars" pointerEvents="none" style={[StyleSheet.absoluteFill, moving ? starsA : null]}>
          <StarLayer d={STARS_A} />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, moving ? starsB : null]}>
          <StarLayer d={STARS_B} />
        </Animated.View>
        <FarCity />
        <Mornes />

        <View style={{ position: 'absolute', left: 0, right: 0, bottom: STREET_H - 2, top: 0 }}>
          {towers.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              accessibilityRole="list"
              accessibilityLabel={t('Les écoles en tête', 'Lekòl ki an tèt yo')}
              contentContainerStyle={{ flexGrow: 1, alignItems: 'flex-end', justifyContent: 'center', gap: 14, paddingHorizontal: 16 }}
            >
              {towers.map((s) => <Tower key={s.key} s={s} mine={!!myKey && s.key === myKey} animate={moving} t={t} />)}
            </ScrollView>
          ) : (
            <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 36, paddingHorizontal: 24 }}>
              <Text style={[arenaType.status, { color: C.inkSoft, textAlign: 'center' }]}>
                {t('Les écoles apparaissent ici dès que leurs élèves jouent.', 'Lekòl yo parèt isit la depi elèv yo jwe.')}
              </Text>
            </View>
          )}
        </View>

        {/* The road: asphalt and a dashed centre line. */}
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: STREET_H, backgroundColor: '#0A1022', justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', gap: 14, paddingHorizontal: 6 }}>
            {Array.from({ length: 22 }, (_, i) => <View key={i} style={{ width: 16, height: 3, borderRadius: 2, backgroundColor: '#2A3A5E' }} />)}
          </View>
        </View>
      </View>
      <Ticker standings={standings} moving={moving} />
    </View>
  );
}

/* ── The standings ticker ───────────────────────────────────────────────── */

const Ticker = React.memo(function Ticker({ standings, moving }: { standings: TeamStanding[]; moving: boolean }) {
  const items = useMemo(() => standings.slice(0, 12), [standings]);
  const [runW, setRunW] = useState(0);
  const x = useSharedValue(0);
  useEffect(() => {
    if (moving && runW > 0) {
      x.value = 0;
      x.value = withRepeat(withTiming(-runW, { duration: Math.max(8000, runW * 28), easing: Easing.linear }), -1, false);
    } else {
      cancelAnimation(x);
      x.value = 0;
    }
    return () => cancelAnimation(x);
  }, [moving, runW, x]);
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  if (!items.length) return null;

  const run = (copy: number) => (
    <View
      key={copy}
      onLayout={copy === 0 ? (e) => setRunW(Math.round(e.nativeEvent.layout.width)) : undefined}
      style={{ flexDirection: 'row' }}
    >
      {items.map((s) => (
        <Text key={s.key} maxFontSizeMultiplier={1.3} style={{ fontFamily: fonts.medium, fontSize: 14, color: C.inkSoft, marginRight: 22 }}>
          <Text style={{ fontFamily: fonts.bold, color: C.gold }}>{towerTag(s, TEAM_SIZE)}</Text> {s.label}
          {s.qualified ? <Text style={{ color: C.muted }}>{`  ${groupDigits(s.teamXp)} XP`}</Text> : null}
        </Text>
      ))}
    </View>
  );

  // The ticker repeats the street and the podium below; screen readers get
  // those, so it is hidden from them.
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ height: 40, overflow: 'hidden', justifyContent: 'center', backgroundColor: '#081127' }}
    >
      <Animated.View style={[{ flexDirection: 'row', paddingLeft: 16 }, moving ? slide : null]}>
        {run(0)}
        {moving ? run(1) : null}
      </Animated.View>
    </View>
  );
});

export default React.memo(ArenaCity);
