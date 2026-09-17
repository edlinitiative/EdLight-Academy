import React, { useEffect } from 'react';
import { Image, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedStyle, withDelay, withSpring, withTiming,
} from 'react-native-reanimated';
import { spring as springs, duration as durations, easing as easings } from '../../theme/motion';
import { useReduceMotion } from '../../utils/motion';

/**
 * The champion medallion — a laurel ring around the EdLight mark, in gold.
 *
 * Two jobs, which is why it is a component rather than an animation:
 *
 *  1. STATIC, inside the exported share card. That card is captured to a PNG,
 *     so animating it there would be meaningless — the still is the artifact
 *     people post. It also replaces the 👑 emoji that stood in before, which
 *     was the one piece of the card still relying on a system glyph.
 *  2. ANIMATED, in the app, at the moment a student learns they are champion.
 *
 * The reveal has weight rather than bounce: rays settle, the ring draws, the
 * mark lands. An award should not feel like a party popper.
 */

const SIZE = 240;
const C = SIZE / 2;

export default function ChampionMedallion({
  size = SIZE,
  /** Static (share card) vs animated (in-app reveal). */
  animate = false,
  /** Change to replay the reveal. */
  playKey,
}: { size?: number; animate?: boolean; playKey?: string | number }) {
  const reduceMotion = useReduceMotion();
  const ring = useSharedValue(animate ? 0 : 1);
  const mark = useSharedValue(animate ? 0 : 1);
  const rays = useSharedValue(animate ? 0 : 1);

  useEffect(() => {
    if (!animate || reduceMotion) {
      ring.value = 1; mark.value = 1; rays.value = 1;
      return;
    }
    rays.value = 0; ring.value = 0; mark.value = 0;
    // Order carries the meaning: light arrives, the ring closes around it, the
    // mark lands last and holds.
    rays.value = withTiming(1, { duration: durations.slow, easing: easings.emphasis });
    ring.value = withDelay(140, withSpring(1, springs.settle));
    mark.value = withDelay(320, withSpring(1, springs.select));
  }, [animate, playKey, reduceMotion, ring, mark, rays]);

  const raysStyle = useAnimatedStyle(() => ({
    opacity: rays.value * 0.85,
    transform: [{ scale: 0.7 + rays.value * 0.3 }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ring.value,
    transform: [{ scale: 0.86 + ring.value * 0.14 }],
  }));
  const markStyle = useAnimatedStyle(() => ({
    opacity: mark.value,
    transform: [{ scale: 0.7 + mark.value * 0.3 }],
  }));

  const s = size;
  const scale = s / SIZE;

  return (
    <View
      style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* Rays */}
      <Animated.View style={[{ position: 'absolute' }, raysStyle]}>
        <Svg width={s} height={s} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <Defs>
            <LinearGradient id="cmRay" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#FFE6B0" stopOpacity="0.85" />
              <Stop offset="100%" stopColor="#C9A05A" stopOpacity="0.05" />
            </LinearGradient>
          </Defs>
          <G>
            {Array.from({ length: 16 }, (_, i) => {
              const a = (i / 16) * Math.PI * 2;
              const w = 0.012 * Math.PI * 2;
              const inner = SIZE * 0.34;
              const outer = SIZE * 0.5;
              const x1 = C + Math.cos(a - w) * inner, y1 = C + Math.sin(a - w) * inner;
              const x2 = C + Math.cos(a) * outer, y2 = C + Math.sin(a) * outer;
              const x3 = C + Math.cos(a + w) * inner, y3 = C + Math.sin(a + w) * inner;
              return <Path key={i} d={`M${x1},${y1} L${x2},${y2} L${x3},${y3} Z`} fill="url(#cmRay)" />;
            })}
          </G>
        </Svg>
      </Animated.View>

      {/* Laurel ring */}
      <Animated.View style={[{ position: 'absolute' }, ringStyle]}>
        <Svg width={s} height={s} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <Defs>
            <LinearGradient id="cmGold" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#FFF3D6" />
              <Stop offset="38%" stopColor="#E8C98A" />
              <Stop offset="68%" stopColor="#A87B36" />
              <Stop offset="100%" stopColor="#F6E4BC" />
            </LinearGradient>
          </Defs>
          <Circle cx={C} cy={C} r={SIZE * 0.33} fill="none" stroke="url(#cmGold)" strokeWidth={3 * scale + 2} />
          <Circle cx={C} cy={C} r={SIZE * 0.30} fill="none" stroke="#E8C98A" strokeWidth={1} opacity={0.5} />
          {/* Laurel leaves around the lower half */}
          {Array.from({ length: 14 }, (_, i) => {
            const a = Math.PI * 0.25 + (i / 13) * Math.PI * 1.5;
            const r = SIZE * 0.33;
            const x = C + Math.cos(a) * r;
            const y = C + Math.sin(a) * r;
            const rot = (a * 180) / Math.PI + 90;
            return (
              <G key={i} transform={`translate(${x}, ${y}) rotate(${rot})`}>
                <Path d="M0,0 q5,-4 0,-11 q-5,7 0,11 z" fill="#E8C98A" opacity={0.85} />
              </G>
            );
          })}
        </Svg>
      </Animated.View>

      {/* The REAL mark, not a traced one. The laurel and rays around it are
          ornament and can be drawn; the logo itself cannot — a hand-traced
          approximation never matches the file's proportions or stroke weights,
          and it reads as an imitation. */}
      <Animated.View style={[{ position: 'absolute' }, markStyle]}>
        <Image
          source={require('../../../assets/splash-dark.png')}
          style={{ width: s * 0.38, height: s * 0.38 }}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );
}
