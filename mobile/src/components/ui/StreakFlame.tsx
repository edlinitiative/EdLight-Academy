/**
 * StreakFlame — a lucide Flame that gently flickers forever, so the streak
 * count feels alive. Mirrors the flicker already used on the Trivia results
 * screen (scale 1 → 1.16 → 1, ~620ms each half, easeInOut quad).
 *
 * The flicker is skipped when the OS asks for reduce-motion, and also when the
 * streak `count` is 0/undefined — an idle flame sits still rather than pulsing
 * for a streak the student hasn't started.
 */

import React, { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { Flame } from 'lucide-react-native';
import { useReduceMotion } from '../../utils/motion';

interface Props {
  size?: number;
  color?: string;
  count?: number;
}

export default function StreakFlame({ size = 14, color = '#fecaca', count }: Props) {
  const reduceMotion = useReduceMotion();
  const scale = useSharedValue(1);

  // Only animate a live streak; an idle (0/undefined) flame stays still, as
  // does the flame under reduce-motion.
  const animate = !reduceMotion && !!count;

  useEffect(() => {
    if (!animate) {
      cancelAnimation(scale);
      scale.value = 1;
      return;
    }
    scale.value = withRepeat(
      withSequence(
        withTiming(1.16, { duration: 620, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 620, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(scale);
  }, [animate, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={style}>
      <Flame color={color} size={size} />
    </Animated.View>
  );
}
