import React, { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedStyle, withDelay, withRepeat, withSpring, withTiming, Easing,
} from 'react-native-reanimated';
import { spring as springs, duration as durations, easing as easings } from '../../theme/motion';
import { useReduceMotion } from '../../utils/motion';

/**
 * The EdLight mark, drawn and animated.
 *
 * The launch logo could not animate while it was the NATIVE splash image — a
 * launch screen is a static asset by definition. So the mark is redrawn here as
 * SVG and the JS splash takes over the moment JS can render, which is also why
 * the native splash is now sized to match this rather than filling the screen.
 *
 * The animation is the mark's own idea: a bulb throwing light. The rays reach
 * outward in sequence and then breathe, the bulb settles in under it. Nothing
 * spins, nothing bounces — it is a lamp coming on, not a loader.
 *
 * Kept to transform + opacity on a handful of wrapper views, so it costs
 * nothing while the app is still doing its real startup work behind it.
 */

/** The mark is authored on a 100×100 grid (same geometry as assets/splash.png). */
const VB = 100;

export default function AnimatedLogo({
  size = 140,
  color = '#004AAD',
  /** Loop the breathing after the entrance. Off for a one-shot reveal. */
  breathe = true,
}: { size?: number; color?: string; breathe?: boolean }) {
  const reduceMotion = useReduceMotion();
  const rays = useSharedValue(0);
  const bulb = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      // Resting end state: fully lit. The reduce-motion path must still look
      // like a finished logo, never a half-drawn one.
      rays.value = 1; bulb.value = 1; pulse.value = 0;
      return;
    }
    bulb.value = withSpring(1, springs.settle);
    rays.value = withDelay(120, withTiming(1, { duration: durations.slow, easing: easings.emphasis }));
    if (breathe) {
      pulse.value = withDelay(
        durations.slow,
        withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }), -1, true),
      );
    }
  }, [breathe, reduceMotion, rays, bulb, pulse]);

  const raysStyle = useAnimatedStyle(() => ({
    opacity: 0.25 + rays.value * 0.75 - pulse.value * 0.25,
    transform: [{ scale: 0.82 + rays.value * 0.18 + pulse.value * 0.05 }],
  }));

  const bulbStyle = useAnimatedStyle(() => ({
    opacity: bulb.value,
    transform: [{ scale: 0.86 + bulb.value * 0.14 }],
  }));

  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* Rays — the light being thrown */}
      <Animated.View style={[{ position: 'absolute' }, raysStyle]}>
        <Svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`}>
          <G stroke={color} strokeWidth={4.4} strokeLinecap="round">
            <Path d="M50 4 V17" />
            <Path d="M50 83 V96" />
            <Path d="M4 50 H17" />
            <Path d="M83 50 H96" />
            <Path d="M17.5 17.5 L26.5 26.5" />
            <Path d="M73.5 73.5 L82.5 82.5" />
            <Path d="M17.5 82.5 L26.5 73.5" />
            <Path d="M73.5 26.5 L82.5 17.5" />
          </G>
        </Svg>
      </Animated.View>

      {/* Bulb + cap — the mark itself */}
      <Animated.View style={[{ position: 'absolute' }, bulbStyle]}>
        <Svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`}>
          <G stroke={color} strokeWidth={4.4} fill="none" strokeLinecap="round" strokeLinejoin="round">
            <Circle cx={50} cy={52} r={20} />
            {/* Graduation cap inside the bulb */}
            <Path d="M36 49 L50 44 L64 49 L50 54 Z" />
            <Path d="M41.5 51.5 v6 q8.5 4.5 17 0 v-6" />
          </G>
        </Svg>
      </Animated.View>
    </View>
  );
}
