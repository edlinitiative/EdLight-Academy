/**
 * PopIn — springs its children in from slightly small + faded, once on mount.
 * The default entrance for reward badges (XP chips, level-up pills) and answer
 * feedback so a win "pops" instead of appearing flat.
 *
 * Respects reduce-motion: when reduced, children render immediately at their
 * final state with no animation.
 */

import React, { useEffect } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useReduceMotion } from '../../utils/motion';

interface PopInProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Delay before the pop, ms. */
  delay?: number;
  /** Scale to start from. */
  from?: number;
}

export default function PopIn({ children, style, delay = 0, from = 0.7 }: PopInProps) {
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withDelay(delay, withSpring(1, { damping: 11, stiffness: 170, mass: 0.6 }));
  }, [reduceMotion, delay, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 1 : withTiming(progress.value, { duration: 120 }),
    transform: [{ scale: from + (1 - from) * progress.value }],
  }));

  return <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>;
}
