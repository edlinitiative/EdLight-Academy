import React, { useEffect } from 'react';
import type { ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming, withSpring } from 'react-native-reanimated';
import { spring, duration, easing, travel, stagger } from '../../theme/motion';
import { useReduceMotion } from '../../utils/motion';

/**
 * A piece of the question arriving.
 *
 * A trivia round is the same screen twenty times over, and the only thing that
 * tells a player a NEW question has started is the text changing. Re-entering
 * the question and its options on every `playKey` turns that into an event: the
 * card lands, then the options follow one after another, and the round gets a
 * rhythm instead of a series of silent swaps.
 *
 * Deliberately short — 14px of travel and a hard decelerate, per the house
 * motion tokens. A timed question cannot afford animation the player has to
 * wait through, so nothing here delays interaction: the options are pressable
 * from the first frame, they simply arrive looking like they were placed.
 */
export default function StageEnter({ children, index = 0, playKey, style, springy = false }: {
  children: React.ReactNode;
  /** Position among staggered siblings. */
  index?: number;
  /** Re-plays the entrance whenever this changes — pass the question index. */
  playKey: string | number;
  style?: ViewStyle;
  /** Springs in rather than eases — for the one element that should feel thrown. */
  springy?: boolean;
}) {
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withDelay(
      stagger(index),
      springy
        ? withSpring(1, spring.settle)
        : withTiming(1, { duration: duration.base, easing: easing.emphasis }),
    );
  }, [playKey, index, reduceMotion, springy, progress]);

  const animated = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * travel.md }],
  }));

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}
