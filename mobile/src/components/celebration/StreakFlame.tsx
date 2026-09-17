import React, { useEffect } from 'react';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, withSpring, Easing,
} from 'react-native-reanimated';
import { useColors } from '../../theme/theme';
import { spring as springs } from '../../theme/motion';
import { useReduceMotion } from '../../utils/motion';

/**
 * The streak flame.
 *
 * This is the one animation that is on screen for as long as a screen is open,
 * which is the case Expo's own benchmarking singles out as genuinely costly —
 * long-running effects, not short transitions. So it is deliberately the
 * cheapest thing here: ONE looping transform on a single wrapper view, over a
 * static two-path SVG. No per-frame path recalculation, no particles, nothing
 * that scales with time.
 *
 * It is a line-art flame in the brand's vocabulary rather than a realistic
 * fire, and it breathes slowly: a flame that flickers hard next to text is
 * noise, and noise beside a number is what makes a UI feel cheap rather than
 * alive.
 */
export default function StreakFlame({
  size = 28,
  /** False when the streak is broken — desaturated and still. */
  alive = true,
  /** Change this when the streak increments to trigger one leap. */
  leapKey,
}: { size?: number; alive?: boolean; leapKey?: string | number }) {
  const colors = useColors();
  const reduceMotion = useReduceMotion();

  const breath = useSharedValue(0);
  const leap = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion || !alive) {
      breath.value = 0;
      return;
    }
    // 2s seamless loop, reversing — no keyframe bookkeeping, no restart seam.
    breath.value = withRepeat(
      withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [alive, reduceMotion, breath]);

  useEffect(() => {
    if (leapKey == null || reduceMotion || !alive) return;
    leap.value = withSequence(
      withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) }),
      withSpring(0, springs.celebrate),
    );
  }, [leapKey, alive, reduceMotion, leap]);

  const style = useAnimatedStyle(() => ({
    // Scale only on Y so the flame stretches upward as it breathes rather than
    // pulsing as a blob — the difference between a flame and a heartbeat.
    transform: [
      { scaleY: 1 + breath.value * 0.08 + leap.value * 0.22 },
      { scaleX: 1 - breath.value * 0.02 },
      { translateY: -leap.value * 2 },
    ],
  }));

  const hot = alive ? '#FF7043' : colors.faint;
  const cool = alive ? '#FFC65C' : colors.border;

  return (
    <Animated.View style={style} accessibilityElementsHidden importantForAccessibility="no">
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Defs>
          <LinearGradient id="flameFill" x1="0" y1="1" x2="0" y2="0">
            <Stop offset="0%" stopColor={hot} stopOpacity={alive ? 0.9 : 0.35} />
            <Stop offset="100%" stopColor={cool} stopOpacity={alive ? 0.95 : 0.35} />
          </LinearGradient>
        </Defs>
        {/* Outer flame */}
        <Path
          d="M12 2c0 3.5-4 5-4 9a4 4 0 0 0 8 0c0-1.6-.8-2.8-1.6-3.9C13.8 6.3 13 4.4 12 2z"
          fill="url(#flameFill)"
        />
        {/* Inner core — a second, brighter tongue gives depth without a second animation */}
        <Path
          d="M12 10.5c0 1.6-1.7 2.2-1.7 4a1.8 1.8 0 0 0 3.5 0c0-1.3-1.2-2-1.8-4z"
          fill={alive ? '#FFF1CC' : colors.surfaceAlt}
          opacity={alive ? 0.95 : 0.5}
        />
      </Svg>
    </Animated.View>
  );
}
