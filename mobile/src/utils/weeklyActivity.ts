/**
 * Weekly activity math shared by the Dashboard goal card and the Jeux flow
 * (finishing the weekly goal earns a streak freeze).
 */

/** Weekly quiz target for the goal ring / streak-freeze reward. */
export const WEEKLY_QUIZ_GOAL = 5;

/** Quiz attempts this ISO week (Monday 00:00 local onward). */
export function countQuizzesThisWeek(attempts: any[], now = new Date()): number {
  const daysSinceMonday = (now.getDay() + 6) % 7; // Mon=0 … Sun=6
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday).getTime();
  return attempts.filter((a) => typeof a?.date === 'number' && a.date >= monday).length;
}
