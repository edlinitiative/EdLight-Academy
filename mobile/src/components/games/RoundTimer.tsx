/**
 * Shared round-timer kit for the 60-second arcade games. VraiFaux and Calcul
 * each re-implemented the same countdown + urgent-at-10s rule + time bar; this
 * is the single source for all three so the games can't drift apart.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useColors } from '../../theme/theme';

/** Seconds left at which the HUD flips to the danger colour. */
export const URGENT_AT_SECONDS = 10;

/**
 * Countdown that calls `onExpire` once when it reaches 0.
 * - `paused` freezes the clock (game over, empty question bank…).
 * - bump `resetKey` to restart a fresh round at `seconds`.
 */
export function useRoundTimer(
  seconds: number,
  { paused = false, resetKey = 0, onExpire }: { paused?: boolean; resetKey?: number; onExpire: () => void },
) {
  const [timeLeft, setTimeLeft] = useState(seconds);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    setTimeLeft(seconds);
  }, [resetKey, seconds]);

  useEffect(() => {
    if (paused) return;
    const iv = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(iv);
          onExpireRef.current();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [paused, resetKey, seconds]);

  return { timeLeft, urgent: timeLeft <= URGENT_AT_SECONDS };
}

/** The thin progress bar under the HUD, tinted per game. */
export function TimeBar({ timeLeft, total, color }: { timeLeft: number; total: number; color: string }) {
  const colors = useColors();
  return (
    <View className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: colors.border }}>
      <View
        className="h-1.5 rounded-full"
        style={{ width: `${(timeLeft / Math.max(total, 1)) * 100}%`, backgroundColor: color }}
      />
    </View>
  );
}
