/**
 * QuizResultHero — the single "Aurora Depth" victory surface shared by every
 * results screen in the app (Trivia, the practice-quiz bank, and the arcade
 * GameOverCard). It owns the celebratory scaffolding so all three feel like one
 * product:
 *
 *   • a deep gradient ground (brand aurora by default, accent-tinted per game)
 *   • soft aurora glows in the corners
 *   • an iridescent, count-up ScoreRing that draws on mount
 *   • confetti above a caller-chosen threshold
 *   • glass content (stat chips, reward blocks) + Button-style CTAs
 *
 * Callers supply the middle content (`children`) and the CTA stack (`footer`),
 * plus per-surface accents — so the layout stays flexible without every screen
 * re-implementing the gradient/ring/confetti plumbing.
 *
 * Accessibility: the SVG ring is decorative and hidden from assistive tech; the
 * score is exposed once, as a single spoken value ("8 sur 10, 80 pour cent").
 */

import React, { useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Circle, Defs, Stop, LinearGradient as SvgLinearGradient,
} from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedProps, withTiming, Easing,
} from 'react-native-reanimated';
import { typeScale } from '../../theme/theme';
import { useCountUp } from '../../hooks/useCountUp';
import { useReduceMotion } from '../../utils/motion';
import { success } from '../../utils/haptics';
import PressableScale from '../ui/PressableScale';
import Confetti from '../ui/Confetti';
import PopIn from '../ui/PopIn';

const CIRC = 327; // 2 * π * 52
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Unique gradient id per mounted ring so two rings never collide on their <Defs>.
let ringSeq = 0;

/** Shared translucent "glass" surface — reads on any deep gradient ground. */
export const glass = {
  backgroundColor: 'rgba(255,255,255,0.12)',
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.2)',
} as const;

// ── colour helpers (derive an accent-tinted aurora from one hex) ───────────────

function clamp(n: number) { return Math.max(0, Math.min(255, Math.round(n))); }

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`;
}

/** Linear blend of two hex colours; t=0 → a, t=1 → b. */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

export const DEEP = '#0A1F52'; // the aurora's darkest note — every ground lands here

// ── ScoreRing ──────────────────────────────────────────────────────────────────

function ScoreRing({
  score, total, from, to, label,
}: {
  score: number;
  total: number;
  from: string;
  to: string;
  label: string;
}) {
  const pct = total > 0 ? score / total : 0;
  const pctInt = total > 0 ? Math.round(pct * 100) : 0;
  const fill = pct * CIRC;
  const reduceMotion = useReduceMotion();
  const shownScore = useCountUp(score, 900);
  const shownPct = useCountUp(pctInt, 900);
  const gradId = useMemo(() => `heroRing${ringSeq++}`, []);

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = reduceMotion
      ? fill
      : withTiming(fill, { duration: 950, easing: Easing.out(Easing.cubic) });
  }, [fill, progress, reduceMotion]);
  const animatedProps = useAnimatedProps(() => ({
    strokeDasharray: `${progress.value} ${CIRC}`,
  }));

  return (
    <View
      className="items-center justify-center"
      style={{ width: 150, height: 150, shadowColor: '#9dc3ff', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.55, shadowRadius: 22 }}
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      {/* Decorative arc — hidden from assistive tech (value is announced above). */}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Svg width={150} height={150} viewBox="0 0 120 120">
          <Defs>
            <SvgLinearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={from} />
              <Stop offset="1" stopColor={to} />
            </SvgLinearGradient>
          </Defs>
          <Circle cx={60} cy={60} r={52} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth={11} />
          <AnimatedCircle
            cx={60}
            cy={60}
            r={52}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={11}
            animatedProps={animatedProps}
            strokeLinecap="round"
            rotation="-90"
            origin="60, 60"
          />
        </Svg>
        <View className="absolute items-center justify-center" style={{ width: 150, height: 150 }}>
          <Text style={{ fontSize: 30, fontFamily: typeScale.num.fontFamily, color: '#fff', letterSpacing: -0.5 }}>
            {shownScore}<Text style={{ fontSize: 18, color: 'rgba(255,255,255,0.5)' }}>/{total}</Text>
          </Text>
          <Text style={{ fontSize: 12, color: to, fontFamily: typeScale.overline.fontFamily, letterSpacing: 0.5 }}>
            {shownPct}%
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── HeroButton — the shared CTA on the deep ground ──────────────────────────────

type HeroButtonVariant = 'glass' | 'solid' | 'ghost';

/**
 * A CTA styled for the aurora ground — glass (translucent), solid (a filled
 * colour), or ghost (text only). Built on PressableScale so every results CTA
 * shares one press feel + a proper button role/label for VoiceOver.
 */
export function HeroButton({
  label,
  onPress,
  variant = 'glass',
  color,
  icon,
  accessibilityLabel,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: HeroButtonVariant;
  /** Fill colour for the 'solid' variant. */
  color?: string;
  icon?: React.ReactNode;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const base: ViewStyle = {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 16,
  };
  const variantStyle: ViewStyle =
    variant === 'solid'
      ? { backgroundColor: color ?? '#22C55E' }
      : variant === 'ghost'
        ? { paddingVertical: 14 }
        : { ...glass };
  const fg = variant === 'ghost' ? 'rgba(255,255,255,0.78)' : '#ffffff';

  return (
    <PressableScale
      onPress={onPress}
      pressedScale={0.97}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[base, variantStyle, style]}
    >
      {icon}
      <Text style={[typeScale.title, { color: fg, fontSize: variant === 'ghost' ? 14 : 15 }]}>{label}</Text>
    </PressableScale>
  );
}

// ── QuizResultHero ──────────────────────────────────────────────────────────────

export interface QuizResultHeroProps {
  score: number;
  total: number;
  isCreole: boolean;
  /** Big headline under the ring (e.g. "Excellent !"). */
  title: string;
  /** Per-surface accent. When set, the ground/ring/glows tint toward it. */
  accent?: string;
  /** Show the confetti burst. Defaults to a strong round (pct ≥ 80). */
  showConfetti?: boolean;
  /** Fire a success haptic once on mount for a strong round. */
  celebrateHaptic?: boolean;
  celebrateThreshold?: number;
  /** Glass content between the title and the CTAs (stat chips, reward blocks). */
  children?: React.ReactNode;
  /** The CTA stack, pinned under the content. */
  footer?: React.ReactNode;
  /** Explicit overrides (Trivia keeps the canonical iridescent look). */
  gradient?: readonly [string, string, string];
  ringFrom?: string;
  ringTo?: string;
  glowA?: string;
  glowB?: string;
}

export default function QuizResultHero({
  score,
  total,
  isCreole,
  title,
  accent,
  showConfetti,
  celebrateHaptic = false,
  celebrateThreshold = 80,
  children,
  footer,
  gradient,
  ringFrom,
  ringTo,
  glowA,
  glowB,
}: QuizResultHeroProps) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;

  // Resolve the palette: explicit overrides win, then an accent-derived tint,
  // then the canonical brand aurora (the Trivia gold standard).
  const ground: readonly [string, string, string] =
    gradient ?? (accent ? [mix(accent, DEEP, 0.08), mix(accent, DEEP, 0.6), DEEP] : ['#2E6FE6', '#123A86', DEEP]);
  const rFrom = ringFrom ?? (accent ? mix(accent, '#ffffff', 0.5) : '#7EE7FF');
  const rTo = ringTo ?? (accent ? accent : '#C9A6FF');
  const gA = glowA ?? (accent ? accent : '#3B82F6');
  const gB = glowB ?? (accent ? mix(accent, '#ffffff', 0.25) : '#7C3AED');

  const celebrate = showConfetti ?? pct >= celebrateThreshold;

  // Fire the celebration haptic once for a strong round (opt-in; screens that
  // already fire their own haptic pass celebrateHaptic={false}).
  useEffect(() => {
    if (celebrateHaptic && pct >= celebrateThreshold) success();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // "8 sur 10, 80 pour cent" — a single spoken value for the ring.
  const ringLabel = isCreole
    ? `${score} sou ${total}, ${pct} pousan`
    : `${score} sur ${total}, ${pct} pour cent`;

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={ground} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ flex: 1 }}>
        {/* Aurora glows */}
        <View pointerEvents="none" style={{ position: 'absolute', top: -50, left: -40, width: 210, height: 210, borderRadius: 105, backgroundColor: gA, opacity: 0.3 }} />
        <View pointerEvents="none" style={{ position: 'absolute', bottom: -40, right: -30, width: 210, height: 210, borderRadius: 105, backgroundColor: gB, opacity: 0.26 }} />
        {celebrate && <Confetti />}

        <ScrollView
          contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 24, paddingTop: 56, paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
        >
          <PopIn from={0.6}>
            <ScoreRing score={score} total={total} from={rFrom} to={rTo} label={ringLabel} />
          </PopIn>

          <Text
            style={{ fontSize: 26, fontFamily: typeScale.num.fontFamily, color: '#fff', marginTop: 22, letterSpacing: -0.5, textAlign: 'center' }}
          >
            {title}
          </Text>

          {children}

          {footer ? <View style={{ width: '100%', marginTop: 24 }}>{footer}</View> : null}
        </ScrollView>
      </LinearGradient>
    </View>
  );
}
