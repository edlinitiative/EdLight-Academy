import React, { useEffect, useState } from 'react';
import { Text, type TextStyle } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, useAnimatedReaction, withSequence, withSpring, withTiming, runOnJS,
} from 'react-native-reanimated';
import { spring } from '../../theme/motion';
import { useReduceMotion } from '../../utils/motion';

/**
 * The live score, counting rather than jumping.
 *
 * A number that changes from 6 to 7 between frames is information. The same
 * number counting up, with the badge kicking once as it lands, is a reward —
 * and it is the only moment in a trivia round where the score is looked at, so
 * it is worth the few lines.
 *
 * The count runs on the UI thread and reports each integer back with runOnJS,
 * which is cheap here because a trivia score moves by one: at most a handful of
 * hops per question, not a per-frame stream.
 */
export default function ScoreCounter({ value, style }: { value: number; style?: TextStyle }) {
  const reduceMotion = useReduceMotion();
  const [shown, setShown] = useState(value);
  const count = useSharedValue(value);
  const kick = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) {
      count.value = value;
      setShown(value);
      return;
    }
    // 240ms regardless of distance: a +1 and a +5 should both read as one beat.
    count.value = withTiming(value, { duration: 240 });
    kick.value = withSequence(withSpring(1.22, spring.select), withSpring(1, spring.press));
  }, [value, reduceMotion, count, kick]);

  useAnimatedReaction(
    () => Math.round(count.value),
    (next, previous) => {
      if (next !== previous) runOnJS(setShown)(next);
    },
    [],
  );

  const animated = useAnimatedStyle(() => ({ transform: [{ scale: kick.value }] }));

  return (
    <Animated.View style={animated}>
      <Text style={style}>{shown}</Text>
    </Animated.View>
  );
}
