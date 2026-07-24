/**
 * ProgressRing — a compact circular progress indicator (conic-style) drawn with
 * react-native-svg, since RN has no conic-gradient. Used on the Dashboard course
 * rows to show completion % at a glance. Reduce-motion aware: the arc sweeps in
 * on mount unless the user prefers reduced motion, in which case it snaps.
 */

import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useAnimatedProps, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { useColors } from '../../theme/theme';
import { useReduceMotion } from '../../utils/motion';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface ProgressRingProps {
  /** 0–100 */
  value: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  /** Show the percentage in the center. Default true. */
  showLabel?: boolean;
}

export default function ProgressRing({
  value,
  size = 46,
  strokeWidth = 5,
  color,
  showLabel = true,
}: ProgressRingProps) {
  const colors = useColors();
  const reduceMotion = useReduceMotion();
  const fill = color ?? colors.azure;
  const clamped = Math.max(0, Math.min(100, Math.round(value)));

  // viewBox is a fixed 100×100 space; the SVG scales to `size`.
  const R = 44;
  const CIRC = 2 * Math.PI * R;
  const target = (clamped / 100) * CIRC;

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = reduceMotion
      ? target
      : withTiming(target, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [target, progress, reduceMotion]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDasharray: `${progress.value} ${CIRC}`,
  }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Circle cx={50} cy={50} r={R} fill="none" stroke={colors.hairline} strokeWidth={strokeWidth} />
        <AnimatedCircle
          cx={50}
          cy={50}
          r={R}
          fill="none"
          stroke={fill}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          rotation="-90"
          origin="50, 50"
          animatedProps={animatedProps}
        />
      </Svg>
      {showLabel && (
        <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: size * 0.26, fontWeight: '800', color: clamped > 0 ? fill : colors.faint, letterSpacing: -0.3 }}>
            {clamped}
            <Text style={{ fontSize: size * 0.17, fontWeight: '700' }}>%</Text>
          </Text>
        </View>
      )}
    </View>
  );
}
