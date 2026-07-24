/**
 * useCountUp — animate a number from 0 up to its target.
 * ──────────────────────────────────────────────────────
 * Used for gamification payoffs (XP earned, score percentage) so a reward
 * "tallies up" instead of snapping into place. Uses requestAnimationFrame with
 * an ease-out curve. Fully respects `prefers-reduced-motion`: those users get
 * the final value immediately with no animation.
 */

import React, { useEffect, useRef, useState } from 'react';

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function useCountUp(target: number, duration = 850): number {
  const safeTarget = Number.isFinite(target) ? target : 0;
  const [value, setValue] = useState<number>(() => (reducedMotion() ? safeTarget : 0));
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reducedMotion() || safeTarget <= 0) {
      setValue(safeTarget);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      // easeOutCubic — fast then settle
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(safeTarget * eased));
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [safeTarget, duration]);

  return value;
}

type CountUpProps = {
  value: number;
  duration?: number;
  className?: string;
  /** Rendered verbatim after the number, e.g. "%" or " XP". */
  suffix?: React.ReactNode;
  /** Rendered verbatim before the number, e.g. "+". */
  prefix?: React.ReactNode;
};

/** Convenience wrapper so callers can drop a count-up number inline. */
export function CountUp({ value, duration, className, suffix, prefix }: CountUpProps) {
  const n = useCountUp(value, duration);
  return (
    <span className={className}>
      {prefix}
      {n}
      {suffix}
    </span>
  );
}

export default useCountUp;
