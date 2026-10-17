import React from 'react';
import Avatar, { type AvatarMood } from '../arena-art/avatars/Avatar';
import { schoolColors } from '../arena-art/crest/SchoolCrest';
import type { StandingsSnapshot } from '../../shared/arena/events';

/**
 * A student's face on the broadcast: the generated avatar (seeded by uid, so
 * the same student always looks the same) in their school's colours — the
 * same colours as the school's crest, which is seeded by the full label.
 */
export default function PlayerFace({
  uid, schoolKey, schoolName, standings, mood = 'idle', size = 56, still = false,
}: {
  uid: string;
  schoolKey?: string;
  /** Fallback when the school isn't in the standings. */
  schoolName?: string;
  standings?: StandingsSnapshot | null;
  mood?: AvatarMood;
  size?: number;
  still?: boolean;
}) {
  const label = standings?.schools.find((s) => s.key === schoolKey)?.label || schoolName || schoolKey || '';
  return (
    <span className="stage-face" aria-hidden="true">
      <Avatar seed={uid} mood={mood} size={size} still={still} colors={label ? schoolColors(label) : undefined} />
    </span>
  );
}
