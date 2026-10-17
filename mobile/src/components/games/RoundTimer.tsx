/**
 * Shared round-timer kit for the 60-second arcade games. VraiFaux and Calcul
 * each re-implemented the same countdown + urgent-at-10s rule + time bar; this
 * is the single source for all three so the games can't drift apart.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View, type AppStateStatus } from 'react-native';
import {
  startTimer, remainingMs, isExpired, pauseTimer, resumeTimer, onBackground, onForeground,
  type BackgroundPolicy, type DeadlineTimer,
} from '../../utils/deadlineTimer';
import { useColors } from '../../theme/theme';

/** Seconds left at which the HUD flips to the danger colour. */
export const URGENT_AT_SECONDS = 10;

/**
 * A deadline-based countdown — see utils/deadlineTimer.ts for THE TIMING
 * POLICY. Remaining time is re-derived from `Date.now()` on every tick, so a
 * suspended interval (background, lock screen) can never make it drift.
 *
 * - `policy: 'pause'` (default; solo practice) freezes the clock while the app
 *   is in the background and resumes with exactly what was left.
 * - `policy: 'run'` (scored duels) keeps the deadline running; coming back
 *   after it passed fires `onExpire` immediately.
 * - `paused` is an explicit freeze (game over, answer confirmed…).
 * - bump `resetKey` to restart a fresh countdown at `seconds`.
 */
export function useDeadlineCountdown(
  seconds: number,
  {
    policy = 'pause',
    paused = false,
    resetKey = 0,
    onExpire,
    tickMs = 250,
  }: {
    policy?: BackgroundPolicy;
    paused?: boolean;
    resetKey?: number | string;
    onExpire?: () => void;
    tickMs?: number;
  },
) {
  const timer = useRef<DeadlineTimer>(startTimer(seconds * 1000, policy, Date.now()));
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef(false);
  const backgrounded = useRef(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const check = useCallback(() => {
    const n = Date.now();
    setNow(n);
    if (!fired.current && !pausedRef.current && isExpired(timer.current, n)) {
      fired.current = true;
      onExpireRef.current?.();
    }
  }, []);

  // Fresh countdown.
  useEffect(() => {
    const n = Date.now();
    timer.current = startTimer(seconds * 1000, policy, n);
    if (pausedRef.current || backgrounded.current) timer.current = pauseTimer(timer.current, n);
    fired.current = false;
    setNow(n);
  }, [resetKey, seconds, policy]);

  // Explicit pause / resume.
  useEffect(() => {
    const n = Date.now();
    if (paused) timer.current = pauseTimer(timer.current, n);
    else if (!backgrounded.current || policy === 'run') timer.current = resumeTimer(timer.current, n);
    setNow(n);
  }, [paused, policy]);

  // App lifecycle — the policy decides what leaving the app means.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const n = Date.now();
      if (next === 'active') {
        backgrounded.current = false;
        if (!pausedRef.current) timer.current = onForeground(timer.current, n);
        check();
      } else {
        backgrounded.current = true;
        timer.current = onBackground(timer.current, n);
      }
    });
    return () => sub.remove();
  }, [check]);

  // The tick only re-reads the clock; it never counts.
  useEffect(() => {
    if (paused) return undefined;
    const id = setInterval(check, tickMs);
    return () => clearInterval(id);
  }, [paused, tickMs, check, resetKey]);

  const ms = remainingMs(timer.current, now);
  return { timeLeft: Math.ceil(ms / 1000), remainingMs: ms };
}

/**
 * Countdown that calls `onExpire` once when it reaches 0 — the arcade games'
 * 60-second round. Solo practice, so it uses the 'pause' policy: a phone
 * call mid-round does not cost the round.
 */
export function useRoundTimer(
  seconds: number,
  { paused = false, resetKey = 0, onExpire }: { paused?: boolean; resetKey?: number; onExpire: () => void },
) {
  const { timeLeft } = useDeadlineCountdown(seconds, { policy: 'pause', paused, resetKey, onExpire });
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
