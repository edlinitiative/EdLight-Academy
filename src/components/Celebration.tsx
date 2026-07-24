/**
 * Celebration — a tiny, dependency-free confetti burst.
 * ─────────────────────────────────────────────────────
 * Rendered inside a positioned parent (the celebratory card / modal), it drops
 * a handful of brand-coloured pieces that fall + drift + spin, then cleans
 * itself up. No canvas, no libraries — just absolutely-positioned spans driven
 * by the `confetti-fall` keyframes in index.css.
 *
 * Accessibility: entirely decorative (aria-hidden). Users who request reduced
 * motion get NO burst at all — the surrounding win message still shows, so the
 * payoff is never hidden, just its animation. A short optional haptic tap
 * accompanies the burst on supporting devices.
 */

import React, { useEffect, useState } from 'react';
import { buzz, CELEBRATE_PATTERN } from '../utils/haptics';

const COLORS = ['#1B6FE0', '#FF5C39', '#FFB92E', '#17A75C', '#4D8FF0'];

type Piece = {
  id: string;
  left: number;
  delay: number;
  duration: number;
  color: string;
  drift: number;
  spin: number;
  shape: number;
};

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

type CelebrationProps = {
  /** When true, fire (or re-fire, on change) a burst. */
  active?: boolean;
  /** Number of confetti pieces. Kept modest so it reads tasteful, not garish. */
  count?: number;
  /** Auto-clear delay (ms). Slightly longer than the longest piece animation. */
  duration?: number;
  /** Fire a haptic tap alongside the burst (default true). */
  haptic?: boolean;
};

export default function Celebration({
  active = true,
  count = 16,
  duration = 1500,
  haptic = true,
}: CelebrationProps) {
  const [pieces, setPieces] = useState<Piece[]>([]);

  useEffect(() => {
    if (!active || reducedMotion()) {
      setPieces([]);
      return;
    }
    const seed = Date.now();
    const next: Piece[] = Array.from({ length: count }).map((_, i) => ({
      id: `${seed}-${i}`,
      left: Math.random() * 100,
      delay: Math.random() * 0.18,
      duration: 0.95 + Math.random() * 0.55,
      color: COLORS[i % COLORS.length],
      drift: (Math.random() - 0.5) * 140,
      spin: (Math.random() - 0.5) * 720,
      shape: i % 3,
    }));
    setPieces(next);
    if (haptic) buzz(CELEBRATE_PATTERN);

    const timer = window.setTimeout(() => setPieces([]), duration);
    return () => window.clearTimeout(timer);
  }, [active, count, duration, haptic]);

  if (pieces.length === 0) return null;

  return (
    <div className="celebration" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className={`celebration__piece celebration__piece--${p.shape}`}
          style={
            {
              left: `${p.left}%`,
              background: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              '--drift': `${p.drift}px`,
              '--spin': `${p.spin}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
