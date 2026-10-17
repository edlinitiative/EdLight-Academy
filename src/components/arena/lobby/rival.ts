/**
 * The lobby's rival — "the student just above you on this week's board".
 *
 * Rule (roadmap #10, kept deliberately small and honest):
 *   1. Among the students AHEAD of you on the weekly board, the closest one
 *      from YOUR school is your rival.
 *   2. If nobody from your school is ahead, the closest student nationally is.
 *   3. If we cannot see who is just ahead (you are below the fetched page and
 *      the page is full), there is NO rival — we never guess, and never put a
 *      made-up opponent on screen.
 *
 * "Ahead" is the board's own order (rank), so the XP gap is always >= 0.
 * Pure: the lobby passes in exactly what useLeaderboard returned.
 */
import { normalizeName } from '../../../../shared/leaderboardAgg';

export interface WeeklyEntry {
  id: string;
  rank: number;
  xp: number;
  displayName?: string | null;
  school?: string | null;
  level?: number | null;
}

export type RivalPick =
  | { status: 'rival'; entry: WeeklyEntry; scope: 'school' | 'national'; gap: number }
  /** Nobody is ahead of you this week. */
  | { status: 'leader' }
  /** We cannot see who is just ahead of you — show no one. */
  | { status: 'unknown' };

export function pickRival({
  entries, uid, myXp, myRank, school, pageSize,
}: {
  entries: WeeklyEntry[];
  uid: string | null;
  /** Your XP this week (0 when you have no entry). */
  myXp: number;
  /** Your exact weekly rank when known (from the count lookup), else null. */
  myRank: number | null;
  school: string | null;
  /** How many entries were requested: a page this full may be truncated. */
  pageSize: number;
}): RivalPick {
  if (!uid) return { status: 'unknown' };
  const meIdx = entries.findIndex((e) => e.id === uid);
  let ahead: WeeklyEntry[] | null;
  if (meIdx >= 0) {
    ahead = entries.slice(0, meIdx);
  } else {
    // You are not on the page. Everyone on it is ahead of you only when the
    // page holds the whole board, or when you sit right below its last row.
    const complete = entries.length < pageSize;
    const rightBelow = myRank != null && myRank === entries.length + 1;
    ahead = complete || rightBelow ? entries.filter((e) => (Number(e.xp) || 0) >= myXp) : null;
  }
  if (ahead === null) return { status: 'unknown' };
  if (ahead.length === 0) return meIdx === 0 ? { status: 'leader' } : { status: 'unknown' };

  const mine = school ? normalizeName(school) : '';
  const mates = mine ? ahead.filter((e) => e.school && normalizeName(e.school) === mine) : [];
  const scope: 'school' | 'national' = mates.length ? 'school' : 'national';
  const entry = (mates.length ? mates : ahead)[(mates.length ? mates : ahead).length - 1];
  return { status: 'rival', entry, scope, gap: Math.max(0, Math.round((Number(entry.xp) || 0) - myXp)) };
}

/** This week's board, restricted to one school, in board order. */
export function schoolLadder(entries: WeeklyEntry[], school: string | null): WeeklyEntry[] {
  if (!school) return [];
  const key = normalizeName(school);
  return entries.filter((e) => e.school && normalizeName(e.school) === key);
}

/*
 * Duel stakes, as the server pays them. They live in api/challenges/accept.ts
 * (WIN_XP / TIE_XP) and api/challenges/create.ts (TTL_MS), which import the
 * Admin SDK and cannot be bundled; the lobby test reads those files and fails
 * if these drift.
 */
export const DUEL_WIN_XP = 20;
export const DUEL_TIE_XP = 10;
export const DUEL_TTL_DAYS = 7;
/** Seconds per duel question (the app's round — utils/duels.ts DUEL_ROUND). */
export const DUEL_SECONDS_PER_QUESTION = 15;
