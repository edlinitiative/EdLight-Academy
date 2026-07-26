import React from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';
import { useReduceMotion } from '../../utils/motion';

/**
 * Cascade-in wrapper: each direct child rises + fades in, staggered by `step` ms,
 * so a list (categories, exams, leaderboard rows) assembles itself on mount.
 * Honors reduce-motion (renders children plainly). Use for short, above-the-fold
 * lists — not long scrolling feeds.
 */
export default function Stagger({
  children,
  step = 55,
  duration = 360,
  initialDelay = 0,
  itemStyle,
}: {
  children: React.ReactNode;
  step?: number;
  duration?: number;
  initialDelay?: number;
  itemStyle?: ViewStyle;
}) {
  const reduce = useReduceMotion();
  const items = React.Children.toArray(children);
  return (
    <>
      {items.map((child, i) => (
        <Animated.View
          key={i}
          entering={reduce ? undefined : FadeInDown.duration(duration).delay(initialDelay + i * step)}
          style={itemStyle}
        >
          {child}
        </Animated.View>
      ))}
    </>
  );
}
