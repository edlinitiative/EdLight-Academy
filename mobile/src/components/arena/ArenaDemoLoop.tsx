import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useColors, useTheme, typeScale } from '../../theme/theme';

/**
 * A silent, looping demonstration of one question being played.
 *
 * Shown while a student waits and has not started the warm-up — the empty
 * state behind it, not a thing to sit through. It answers "what is about to
 * happen to me" in about six seconds, without a word of instruction and
 * without a byte of video: on a Haitian mobile connection a demo clip is a
 * download before a tournament, and this is a few shapes moving.
 *
 * Three beats, then it repeats:
 *   1. a question appears
 *   2. the timer drains and a chip is chosen — green while it is still worth
 *      full points, which is the one rule worth teaching before 18:00
 *   3. the points land
 *
 * Reanimated drives it on the UI thread, so it keeps moving while the JS
 * thread is busy with listeners, and it is cancelled on unmount — an animation
 * still looping behind a live question would burn battery for nothing.
 */

const BEAT = 1_600;
const CYCLE = BEAT * 4;

export default function ArenaDemoLoop({ isCreole }: { isCreole: boolean }) {
  const colors = useColors();
  const { radius } = useTheme();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  // One clock from 0→1 across the whole cycle; every element reads a slice of
  // it. Separate timelines would drift apart after a few minutes of looping.
  const clock = useSharedValue(0);

  useEffect(() => {
    clock.value = 0;
    clock.value = withRepeat(
      withSequence(
        withTiming(1, { duration: CYCLE, easing: Easing.linear }),
        withDelay(400, withTiming(1, { duration: 0 })),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(clock);
  }, [clock]);

  const questionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(clock.value, [0, 0.12, 0.9, 1], [0, 1, 1, 0]),
    transform: [{ translateY: interpolate(clock.value, [0, 0.12], [6, 0], 'clamp') }],
  }));

  // Drains across beats 1–2 and colours the way the real tier bar does.
  const barStyle = useAnimatedStyle(() => ({
    width: `${interpolate(clock.value, [0.15, 0.55], [100, 42], 'clamp')}%`,
    backgroundColor: interpolateColor(clock.value, [0.15, 0.55], [colors.success, colors.success]),
  }));

  const chipStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      clock.value, [0.5, 0.58], [colors.border, colors.success],
    ),
    backgroundColor: interpolateColor(
      clock.value, [0.5, 0.58], [colors.bg, colors.successSoft],
    ),
    transform: [{ scale: interpolate(clock.value, [0.5, 0.56, 0.62], [1, 0.97, 1], 'clamp') }],
  }));

  const pointsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(clock.value, [0.6, 0.68, 0.88, 0.95], [0, 1, 1, 0], 'clamp'),
    transform: [{ translateY: interpolate(clock.value, [0.6, 0.95], [8, -10], 'clamp') }],
  }));

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={t(
        'Démonstration : une question apparaît, tu réponds avant douze secondes, tu gagnes mille points.',
        'Demonstrasyon : yon kesyon parèt, ou reponn anvan douz segonn, ou genyen mil pwen.',
      )}
      style={{
        padding: 16, borderRadius: radius.card, gap: 10, overflow: 'hidden',
        backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      }}
    >
      <Text style={[typeScale.overline, { color: colors.muted }]}>
        {t('Comment ça se joue', 'Kijan yo jwe l')}
      </Text>

      <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' }}>
        <Animated.View style={[{ height: '100%', borderRadius: 2 }, barStyle]} />
      </View>

      <Animated.View style={questionStyle}>
        {/* Deliberately not a real question: two grey bars read as "a question"
            in every language, and nobody tries to answer them. */}
        <View style={{ height: 9, borderRadius: 5, backgroundColor: colors.border, width: '88%' }} />
        <View style={{ height: 9, borderRadius: 5, backgroundColor: colors.border, width: '54%', marginTop: 7 }} />
      </Animated.View>

      <View style={{ gap: 7 }}>
        <Animated.View style={[{
          height: 34, borderRadius: radius.card, borderWidth: 1,
        }, chipStyle]} />
        <View style={{
          height: 34, borderRadius: radius.card, borderWidth: 1,
          borderColor: colors.border, backgroundColor: colors.bg,
        }} />
      </View>

      <Animated.Text style={[typeScale.label, { color: colors.success, textAlign: 'right' }, pointsStyle]}>
        +1000
      </Animated.Text>

      <Text style={[typeScale.caption, { color: colors.muted }]}>
        {t(
          'Réponds avant 12 s pour la pleine valeur.',
          'Reponn anvan 12 s pou tout valè a.',
        )}
      </Text>
    </View>
  );
}
