import React from 'react';
import useStore from '../../contexts/store';
import Avatar, { AvatarMood } from '../avatars/Avatar';
import { useReducedMotion } from './tokens';

export interface MotionPlayer {
  name: string;
  school: string;
  colors: { primary: string; secondary: string };
  seed: string;
}

export function useT() {
  const isCreole = useStore((s) => s.language) === 'ht';
  return (fr: string, ht: string) => (isCreole ? ht : fr);
}

/** Prop override wins; otherwise the OS setting. */
export function useReduced(override?: boolean): boolean {
  const os = useReducedMotion();
  return override ?? os;
}

/**
 * Player portrait — the Arène's original avatar set (src/arena-art/avatars).
 * Falls back to nothing exotic: the avatar is pure SVG, seeded, offline-safe.
 */
export function Portrait({ player, size, mood = 'idle', still }: {
  player: MotionPlayer; size: number; mood?: AvatarMood; still?: boolean;
}) {
  return <Avatar seed={player.seed} size={size} mood={mood} colors={player.colors} still={still} />;
}

/** School colours as CSS vars for a scoped subtree. */
export function schoolVars(p: MotionPlayer, prefix = 'c'): React.CSSProperties {
  return { [`--${prefix}1`]: p.colors.primary, [`--${prefix}2`]: p.colors.secondary } as React.CSSProperties;
}
