import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSequence, withTiming, withDelay, Easing,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useColors } from '../../theme/theme';
import { useReduceMotion } from '../../utils/motion';

/**
 * The half-second after a right answer.
 *
 * RayBurst already draws the full celebration, but it is 320px of rays built
 * for the end of a round — firing it on every correct answer would make the
 * biggest moment of the round indistinguishable from its smallest. This is the
 * quiet sibling: one wash of light from behind the answer, gone in 500ms.
 *
 * `pointerEvents="none"` and absolute fill, so it never takes a tap from the
 * options underneath it — the player can move on before the light has faded.
 *
 * Only opacity and scale animate. Both are UI-thread properties that need no
 * layout pass, which is what lets this fire on every question on a cheap phone
 * without touching the frame budget of the timer running beside it.
 */
export default function CorrectFlash({ playKey, streak = 0 }: {
  /** Replays whenever this changes — pass the question index. */
  playKey: string | number;
  /** Consecutive correct answers: more light as the run gets longer. */
  streak?: number;
}) {
  const colors = useColors();
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(0);

  // A run of right answers should feel like it is building, but the top of the
  // scale is reached quickly — the difference between a 6-streak and a 12 is
  // not something a player can see, and pretending otherwise just gets loud.
  const intensity = Math.min(0.28 + streak * 0.07, 0.62);

  useEffect(() => {
    if (reduceMotion) return;
    progress.value = 0;
    progress.value = withSequence(
      withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) }),
      withDelay(60, withTiming(0, { duration: 260, easing: Easing.in(Easing.quad) })),
    );
  }, [playKey, reduceMotion, progress]);

  const animated = useAnimatedStyle(() => ({
    opacity: progress.value * intensity,
    transform: [{ scale: 0.9 + progress.value * 0.25 }],
  }));

  if (reduceMotion) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: 0, right: 0, top: -40, bottom: -40, alignItems: 'center', justifyContent: 'center' }, animated]}
    >
      <View style={{ width: 280, height: 280 }}>
        <Svg width={280} height={280} viewBox="0 0 280 280">
          <Defs>
            <RadialGradient id="cf" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={colors.success} stopOpacity={0.9} />
              <Stop offset="55%" stopColor={colors.success} stopOpacity={0.25} />
              <Stop offset="100%" stopColor={colors.success} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={140} cy={140} r={140} fill="url(#cf)" />
        </Svg>
      </View>
    </Animated.View>
  );
}
