/**
 * Jeu de la semaine — one arcade game rotates weekly at ×2 XP.
 * Keyed on the same ISO week id as the leaderboard so the rotation flips at
 * the exact moment the board resets (Monday), giving the reset a second hook.
 */
import { weekId, weekNumber } from '../services/leaderboardService';

/** Rotation order — the five non-trivia arcade games. */
export const WEEKLY_GAME_ROTATION = ['vrai-faux', 'memoire', 'mo-kache', 'calcul', 'suites'] as const;

export type WeeklyGameId = (typeof WEEKLY_GAME_ROTATION)[number];

/** XP multiplier applied to the featured game's rounds. */
export const WEEKLY_GAME_XP_MULTIPLIER = 2;

/** The featured arcade game for the week containing `date`. */
export function weeklyGameId(date = new Date()): WeeklyGameId {
  const n = weekNumber(weekId(date));
  const idx = Number.isFinite(n) ? Math.abs(n) % WEEKLY_GAME_ROTATION.length : 0;
  return WEEKLY_GAME_ROTATION[idx];
}

/** True when `gameId` is this week's featured game. */
export function isWeeklyGame(gameId: string, date = new Date()): boolean {
  return gameId === weeklyGameId(date);
}
