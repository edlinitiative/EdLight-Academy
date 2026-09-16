import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop, G } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSpring, withDelay, Easing,
} from 'react-native-reanimated';
import { useColors } from '../../theme/theme';
import { spring as springs, duration as durations, easing as easings } from '../../theme/motion';
import { useReduceMotion } from '../../utils/motion';

/**
 * The celebration burst — light being thrown, not confetti.
 *
 * Written in code rather than commissioned as a Rive or Lottie asset, because
 * this animation is GEOMETRIC: rays, a halo, a few sparks. react-native-svg and
 * Reanimated (both already installed) draw that natively at 60fps, with no new
 * dependency, no native rebuild, and it ships over the air. Rive earns its keep
 * for character rigs and illustrative work; it would be overkill here.
 *
 * Motion runs on TRANSFORMS of plain views wrapping each SVG layer, never on
 * animated SVG attributes: transform and opacity are the two properties the UI
 * thread can drive without a layout pass, which is what keeps this cheap enough
 * to fire on every passed quiz.
 *
 * The mark is the EdLight logo's own motif — a bulb throwing straight rays —
 * enlarged rather than replaced by unrelated decoration.
 */

const SIZE = 320;
const C = SIZE / 2;

/** How loud the burst is. Tier is the only thing that varies — one animation. */
export type CelebrationTier = 0 | 1 | 2; // pass · strong · perfect

export default function RayBurst({
  tier = 0,
  /** Replays when this changes — pass the attempt/score so a retry re-fires. */
  playKey,
}: { tier?: CelebrationTier; playKey?: string | number }) {
  const colors = useColors();
  const reduceMotion = useReduceMotion();

  const rays = useSharedValue(0);
  const halo = useSharedValue(0);
  const sparks = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      // Reduce motion jumps to the resting end state rather than playing —
      // so the end state has to be worth looking at on its own.
      rays.value = 1; halo.value = 1; sparks.value = 1;
      return;
    }
    rays.value = 0; halo.value = 0; sparks.value = 0;
    rays.value = withSpring(1, springs.celebrate);
    halo.value = withTiming(1, { duration: durations.slow, easing: easings.emphasis });
    sparks.value = withDelay(90, withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }));
  }, [playKey, reduceMotion, rays, halo, sparks]);

  // Rays overshoot outward then settle — the spring does the overshoot.
  const raysStyle = useAnimatedStyle(() => ({
    opacity: 0.18 + rays.value * 0.55,
    transform: [{ scale: 0.35 + rays.value * 0.65 }],
  }));

  // The halo blooms past the rays and fades to a faint resting glow.
  const haloStyle = useAnimatedStyle(() => ({
    opacity: (1 - halo.value) * 0.55 + 0.16,
    transform: [{ scale: 0.55 + halo.value * 0.85 }],
  }));

  const sparksStyle = useAnimatedStyle(() => ({
    opacity: (1 - sparks.value) * 0.9,
    transform: [{ scale: 0.4 + sparks.value * 1.15 }],
  }));

  const spokes = tier === 2 ? 20 : tier === 1 ? 14 : 10;
  const accent = tier === 2 ? '#FFC65C' : colors.azure;

  const rayPaths = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < spokes; i += 1) {
      const a = (i / spokes) * Math.PI * 2;
      const w = 0.016 * Math.PI * 2;
      const inner = SIZE * 0.17;
      const outer = SIZE * 0.47;
      const x1 = C + Math.cos(a - w) * inner, y1 = C + Math.sin(a - w) * inner;
      const x2 = C + Math.cos(a) * outer, y2 = C + Math.sin(a) * outer;
      const x3 = C + Math.cos(a + w) * inner, y3 = C + Math.sin(a + w) * inner;
      out.push(`M${x1},${y1} L${x2},${y2} L${x3},${y3} Z`);
    }
    return out;
  }, [spokes]);

  const sparkDots = useMemo(() => {
    // Sparse on purpose — a dozen specks read as light; fifty read as confetti.
    const n = tier === 2 ? 11 : tier === 1 ? 8 : 5;
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + 0.4;
      const r = SIZE * (0.3 + ((i % 3) * 0.06));
      return { cx: C + Math.cos(a) * r, cy: C + Math.sin(a) * r, r: i % 2 ? 3 : 2 };
    });
  }, [tier]);

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View style={[{ position: 'absolute' }, haloStyle]}>
        <Svg width={SIZE} height={SIZE}>
          <Defs>
            <RadialGradient id="rbHalo" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={accent} stopOpacity="0.55" />
              <Stop offset="100%" stopColor={accent} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={C} cy={C} r={SIZE * 0.42} fill="url(#rbHalo)" />
        </Svg>
      </Animated.View>

      <Animated.View style={[{ position: 'absolute' }, raysStyle]}>
        <Svg width={SIZE} height={SIZE}>
          <Defs>
            <RadialGradient id="rbRay" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={accent} stopOpacity="0.9" />
              <Stop offset="100%" stopColor={accent} stopOpacity="0.05" />
            </RadialGradient>
          </Defs>
          <G>
            {rayPaths.map((d, i) => <Path key={i} d={d} fill="url(#rbRay)" />)}
          </G>
        </Svg>
      </Animated.View>

      <Animated.View style={[{ position: 'absolute' }, sparksStyle]}>
        <Svg width={SIZE} height={SIZE}>
          {sparkDots.map((s, i) => (
            <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={accent} opacity={0.85} />
          ))}
        </Svg>
      </Animated.View>
    </View>
  );
}
