/**
 * Tournament standings — the competitive framing over the weekly school board.
 *
 * The growth design (docs/superpowers/specs/2026-09-16-growth-engine-design.md)
 * picked a SCHOOL tournament as the headline engine for one reason: it is the
 * only mechanic in the app where a student benefits from recruiting people who
 * are not close friends. Your school cannot win if only you play.
 *
 * That only works if recruiting is visibly rational. "You are 340 XP behind" is
 * a fact a student can do nothing with; "two more players closes it" is a reason
 * to send the invite. This module does that arithmetic.
 *
 * Deliberately built on the collective aggregation that already exists
 * (`useCollectives('school','week')`) and the existing weekly window
 * (`weekId`/`timeToWeekEnd`) — no new Firestore collection, so no rules change
 * and no deploy, and the whole tournament ships over the air.
 */

export interface TournamentGroup {
  key: string;
  name: string;
  xp: number;
  memberCount: number;
}

export interface Standing {
  rank: number;
  xp: number;
  memberCount: number;
  name: string;
  /** The school directly above, and how far. Null at rank 1. */
  ahead: { name: string; gap: number } | null;
  /** The school directly below, and its lead over them. Null at the bottom. */
  behind: { name: string; lead: number } | null;
}

/** Where a school sits, and who it is chasing. Groups need not be pre-sorted. */
export function standing(
  groups: TournamentGroup[],
  myKey: string | null | undefined,
): Standing | null {
  if (!myKey || !Array.isArray(groups) || groups.length === 0) return null;
  const sorted = [...groups].sort((a, b) => (b.xp ?? 0) - (a.xp ?? 0));
  const i = sorted.findIndex((g) => g.key === myKey);
  if (i === -1) return null;

  const me = sorted[i];
  const above = i > 0 ? sorted[i - 1] : null;
  const below = i < sorted.length - 1 ? sorted[i + 1] : null;

  return {
    rank: i + 1,
    xp: me.xp ?? 0,
    memberCount: me.memberCount ?? 0,
    name: me.name,
    ahead: above ? { name: above.name, gap: (above.xp ?? 0) - (me.xp ?? 0) } : null,
    behind: below ? { name: below.name, lead: (me.xp ?? 0) - (below.xp ?? 0) } : null,
  };
}

/**
 * How many additional players, scoring at this school's current average, would
 * close `gap`.
 *
 * Returns null rather than a guess when the school has no scoring history to
 * average — promising "3 players" off a divide-by-zero would be worse than
 * saying nothing.
 */
export function playersNeeded(
  gap: number,
  schoolXp: number,
  memberCount: number,
): number | null {
  if (gap <= 0) return 0;
  if (!memberCount || memberCount <= 0 || !schoolXp || schoolXp <= 0) return null;
  const avg = schoolXp / memberCount;
  if (!Number.isFinite(avg) || avg <= 0) return null;
  return Math.max(1, Math.ceil(gap / avg));
}

export type Urgency = 'defending' | 'close' | 'climbing';

/**
 * Which story to tell. A leader is defending, a school within striking distance
 * is chasing, and a distant one is climbing — the same invite button, but the
 * reason to press it differs, and a generic "invite friends" converts nobody.
 */
export function recruitUrgency({
  rank,
  gapAhead,
}: { rank: number; gapAhead: number | null }): Urgency {
  if (rank === 1 || gapAhead == null) return 'defending';
  return gapAhead <= 500 ? 'close' : 'climbing';
}
