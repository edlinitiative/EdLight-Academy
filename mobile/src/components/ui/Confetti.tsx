/**
 * Confetti — a lightweight celebratory burst for big wins (exam pass, level-up,
 * milestone). No new dependency: it's a handful of reanimated Views that fall,
 * drift and fade once on mount. Purely decorative and non-interactive.
 *
 * Respects reduce-motion: when the user asks the OS to reduce motion, the burst
 * renders nothing (the caller still shows its success message + fires haptics).
 */

import React, { useEffect } from 'react';
import { View, useWindowDimensions, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { useReduceMotion } from '../../utils/motion';

const COLORS = ['#1B6FE0', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#0857A6'];
const PIECE_COUNT = 14;

interface PieceConfig {
  left: number;      // 0–1 fraction of width
  delay: number;     // ms
  drift: number;     // px horizontal travel
  size: number;
  color: string;
  rounded: boolean;
  duration: number;
}

// Deterministic-ish spread so pieces cover the width without clustering.
function buildPieces(count: number): PieceConfig[] {
  return Array.from({ length: count }, (_, i) => ({
    left: (i + 0.5) / count + (Math.random() - 0.5) * 0.08,
    delay: Math.random() * 240,
    drift: (Math.random() - 0.5) * 90,
    size: 7 + Math.random() * 6,
    color: COLORS[i % COLORS.length],
    rounded: i % 2 === 0,
    duration: 1400 + Math.random() * 700,
  }));
}

function Piece({ cfg, height }: { cfg: PieceConfig; height: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      cfg.delay,
      withTiming(1, { duration: cfg.duration, easing: Easing.out(Easing.quad) }),
    );
  }, [cfg, progress]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: progress.value * (height * 0.9) },
      { translateX: progress.value * cfg.drift },
      { rotate: `${progress.value * 540}deg` },
    ],
    opacity: progress.value < 0.15 ? progress.value / 0.15 : 1 - (progress.value - 0.15) / 0.85,
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: -20,
          left: `${cfg.left * 100}%`,
          width: cfg.size,
          height: cfg.size,
          borderRadius: cfg.rounded ? cfg.size / 2 : 2,
          backgroundColor: cfg.color,
        },
        style,
      ]}
    />
  );
}

interface ConfettiProps {
  /** Bump this to re-fire the burst (e.g. on replay). */
  fireKey?: number | string;
  count?: number;
}

export default function Confetti({ fireKey = 0, count = PIECE_COUNT }: ConfettiProps) {
  const { height } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  // `fireKey` is intentionally a dep: bumping it rebuilds the pieces so the
  // burst re-fires (e.g. on replay), even though buildPieces only reads `count`.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pieces = React.useMemo(() => buildPieces(count), [count, fireKey]);

  if (reduceMotion) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((cfg, i) => (
        <Piece key={`${fireKey}-${i}`} cfg={cfg} height={height} />
      ))}
    </View>
  );
}
