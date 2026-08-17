/**
 * XpBar — an animated horizontal progress bar for level / XP fills. On mount the
 * fill grows from 0 to `pct`% with an easeOutCubic over ~900ms, then a thin
 * translucent-white highlight sweeps across once to give it a bit of life.
 *
 * Reduce-motion collapses both flourishes: the fill jumps straight to its final
 * width and the shimmer never runs.
 */

import React, { useEffect } from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useReduceMotion } from '../../utils/motion';

interface Props {
  pct: number;
  height?: number;
  trackColor?: string;
  fillColors?: [string, string];
  style?: StyleProp<ViewStyle>;
}

export default function XpBar({
  pct,
  height = 6,
  trackColor = 'rgba(255,255,255,0.22)',
  fillColors = ['#2E86F0', '#7c3aed'],
  style,
}: Props) {
  const reduceMotion = useReduceMotion();
  const clamped = Math.min(100, Math.max(0, pct || 0));

  const fill = useSharedValue(reduceMotion ? clamped : 0);
  const shimmer = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      fill.value = clamped;
      shimmer.value = 0;
      return;
    }
    fill.value = withTiming(clamped, { duration: 900, easing: Easing.out(Easing.cubic) });
    // One gentle sweep shortly after the fill has grown.
    shimmer.value = withDelay(
      700,
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
    );
  }, [clamped, reduceMotion, fill, shimmer]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fill.value}%`,
  }));

  // A thin highlight that translates across the filled portion once.
  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 0.15, 0.85, 1], [0, 0.5, 0.5, 0]),
    left: `${interpolate(shimmer.value, [0, 1], [-30, 100])}%`,
  }));

  const radius = height / 2;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
      style={[
        { height, borderRadius: radius, backgroundColor: trackColor, overflow: 'hidden' },
        style,
      ]}
    >
      <Animated.View style={[{ height, borderRadius: radius, overflow: 'hidden' }, fillStyle]}>
        <LinearGradient
          colors={fillColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1, borderRadius: radius }}
        />
        {!reduceMotion ? (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                top: 0,
                bottom: 0,
                width: 24,
                backgroundColor: 'rgba(255,255,255,0.65)',
              },
              shimmerStyle,
            ]}
          />
        ) : null}
      </Animated.View>
    </View>
  );
}
