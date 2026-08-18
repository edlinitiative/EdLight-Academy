import React, { useEffect, useMemo } from 'react';
import { View, Text } from 'react-native';
import Svg, {
  Circle, Defs, Stop, LinearGradient as SvgLinearGradient,
} from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedProps, withTiming, withDelay, Easing,
} from 'react-native-reanimated';
import { typeScale } from '../theme/theme';
import { useCountUp } from '../hooks/useCountUp';
import { useReduceMotion } from '../utils/motion';
import { MASTERY_ORDER, type MasteryLevel } from '../utils/mastery';

/**
 * MasteryArc — the signature object of the Cours experience.
 *
 * Four arc segments, one per rung of the ladder, drawn on the aurora ground.
 * It is deliberately NOT the QuizResultHero ScoreRing: that ring is one
 * continuous stroke because a quiz score is continuous, while mastery is four
 * discrete things you earned. Segments with real gaps between them say "rungs",
 * a solid ring says "percentage" — the distinction is the whole point of the
 * model, so it has to survive into the geometry.
 *
 * Earned segments carry the iridescent gradient and a glow; unearned ones stay
 * as a faint track. Each earned segment draws in on mount, staggered, so a
 * level-up is visible rather than merely true.
 */

const R = 52;
const CIRC = 2 * Math.PI * R; // ≈ 326.7
const GAP = 13; // arc-length of the space between segments
const SEG = (CIRC - GAP * 4) / 4;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Unique gradient id per mount so two arcs never collide on their <Defs>.
let arcSeq = 0;

function Segment({
  index, earned, gradId, delay, reduceMotion,
}: {
  index: number;
  earned: boolean;
  gradId: string;
  delay: number;
  reduceMotion: boolean;
}) {
  const drawn = useSharedValue(earned && reduceMotion ? SEG : 0);

  useEffect(() => {
    if (!earned) { drawn.value = withTiming(0, { duration: 200 }); return; }
    drawn.value = reduceMotion
      ? SEG
      : withDelay(delay, withTiming(SEG, { duration: 520, easing: Easing.out(Easing.cubic) }));
  }, [earned, delay, drawn, reduceMotion]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDasharray: `${drawn.value} ${CIRC - drawn.value}`,
    // A zero-length dash with a ROUND cap still paints a dot. Without this an
    // unearned segment left a bright bead at its start point, so an empty arc
    // showed four mystery dots at the cardinal points.
    opacity: drawn.value > 0.5 ? 1 : 0,
  }));

  // Each segment starts where the previous one's gap ends.
  const offset = -(index * (SEG + GAP));

  return (
    <AnimatedCircle
      cx={60}
      cy={60}
      r={R}
      fill="none"
      stroke={`url(#${gradId})`}
      strokeWidth={10}
      strokeLinecap="round"
      strokeDashoffset={offset}
      animatedProps={animatedProps}
      rotation="-90"
      origin="60, 60"
    />
  );
}

export default function MasteryArc({
  level,
  points,
  caption,
  size = 168,
  from = '#7EE7FF',
  to = '#C9A6FF',
  /** Center label under the number (usually the level name). */
  label,
}: {
  level: MasteryLevel;
  points: number;
  caption?: string;
  size?: number;
  from?: string;
  to?: string;
  label?: string;
}) {
  const reduceMotion = useReduceMotion();
  const earned = MASTERY_ORDER.indexOf(level); // 0…4
  const gradId = useMemo(() => `masteryArc${arcSeq++}`, []);
  const shown = useCountUp(points, 900);

  return (
    <View
      style={{
        width: size, height: size, alignItems: 'center', justifyContent: 'center',
        shadowColor: '#9dc3ff', shadowOffset: { width: 0, height: 0 },
        shadowOpacity: earned > 0 ? 0.5 : 0, shadowRadius: 22,
      }}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${points} / 100${label ? `, ${label}` : ''}`}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Svg width={size} height={size} viewBox="0 0 120 120">
          <Defs>
            <SvgLinearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={from} />
              <Stop offset="1" stopColor={to} />
            </SvgLinearGradient>
          </Defs>

          {/* Track: all four rungs, always visible, so the ladder shows how far
              there is left to go even at zero. */}
          {[0, 1, 2, 3].map((i) => (
            <Circle
              key={`t${i}`}
              cx={60}
              cy={60}
              r={R}
              fill="none"
              stroke="rgba(255,255,255,0.16)"
              strokeWidth={10}
              strokeLinecap="round"
              strokeDasharray={`${SEG} ${CIRC - SEG}`}
              strokeDashoffset={-(i * (SEG + GAP))}
              rotation="-90"
              origin="60, 60"
            />
          ))}

          {[0, 1, 2, 3].map((i) => (
            <Segment
              key={`s${i}`}
              index={i}
              earned={i < earned}
              gradId={gradId}
              delay={140 * i}
              reduceMotion={reduceMotion}
            />
          ))}
        </Svg>

        {/* The arc is a fixed-diameter circle, so its centre text cannot scale
            without limit — at 200% Dynamic Type it would spill over the stroke.
            Capped, not disabled: it still grows for students who need it. */}
        <View style={{
          position: 'absolute', width: size, height: size,
          alignItems: 'center', justifyContent: 'center', paddingHorizontal: size * 0.22,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text
              maxFontSizeMultiplier={1.3}
              style={{ fontSize: 34, fontFamily: typeScale.num.fontFamily, color: '#fff', letterSpacing: -0.8 }}
            >
              {shown}
            </Text>
            <Text
              maxFontSizeMultiplier={1.3}
              style={{ fontSize: 15, fontFamily: typeScale.label.fontFamily, color: 'rgba(255,255,255,0.8)' }}
            >
              /100
            </Text>
          </View>
          {label ? (
            <Text
              maxFontSizeMultiplier={1.2}
              numberOfLines={1}
              style={{
                fontSize: 11, fontFamily: typeScale.overline.fontFamily, letterSpacing: 0.7,
                textTransform: 'uppercase', color: to, marginTop: 3,
              }}
            >
              {label}
            </Text>
          ) : null}
          {caption ? (
            <Text
              maxFontSizeMultiplier={1.2}
              numberOfLines={2}
              style={{ fontSize: 11, color: 'rgba(255,255,255,0.84)', marginTop: 4, textAlign: 'center' }}
            >
              {caption}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}
