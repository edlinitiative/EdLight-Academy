/**
 * The Arène's shared motion grammar (brief requirement #7, "Initial timing
 * targets"). One source of truth: TS constants for the state machines, and the
 * same numbers exposed as CSS custom properties (`--mo-*`) on every sequence
 * root via `motionVars`, so CSS and timers can never disagree.
 */
import { useEffect, useState } from 'react';
import type React from 'react';

/** Durations in ms. */
export const DUR = {
  /** Focus / press feedback (brief: 80–160 ms). */
  press: 120,
  /** Component transition (brief: 180–300 ms). */
  component: 240,
  /** Navigation composition (brief: 300–500 ms). */
  navigation: 400,
  /** Routine match introduction (brief: 1–2 s). */
  intro: 1500,
  /** Major victory ceremony (brief: 4–7 s). */
  ceremony: 5500,
  /** Reduced-motion cross-fade — the only motion left when travel is removed. */
  fade: 200,
} as const;

/** Easing curves. */
export const EASE = {
  /** Arrivals: fast out of the gate, long gentle landing. */
  enter: 'cubic-bezier(0.16, 1, 0.3, 1)',
  /** Departures: quick acceleration away, never lingers. */
  exit: 'cubic-bezier(0.7, 0, 0.84, 0)',
  /** Stamps and beats: a small, single overshoot. */
  emphasis: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  /** Coming to rest / ambient: symmetrical and calm. */
  settle: 'cubic-bezier(0.45, 0, 0.25, 1)',
} as const;

export type DurName = keyof typeof DUR;
export type EaseName = keyof typeof EASE;

/** `--mo-dur-press: 120ms; --mo-ease-enter: cubic-bezier(...)` etc. */
export const MOTION_CSS_VARS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(DUR).map(([k, v]) => [`--mo-dur-${k}`, `${v}ms`])),
  ...Object.fromEntries(Object.entries(EASE).map(([k, v]) => [`--mo-ease-${k}`, v])),
};

/** Spread on a sequence root: `<div style={motionVars}>`. */
export const motionVars = MOTION_CSS_VARS as unknown as React.CSSProperties;

const QUERY = '(prefers-reduced-motion: reduce)';

/** Live `prefers-reduced-motion`; false where matchMedia is unavailable. */
export function useReducedMotion(): boolean {
  const get = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia(QUERY).matches;
  const [reduced, setReduced] = useState<boolean>(get);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(QUERY);
    const on = () => setReduced(mq.matches);
    on();
    if (mq.addEventListener) mq.addEventListener('change', on);
    else mq.addListener(on);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', on);
      else mq.removeListener(on);
    };
  }, []);
  return reduced;
}
