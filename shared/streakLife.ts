/**
 * streakLife — is a stored streak still alive?
 *
 * `currentStreak` is written by streakService.recordActivity and then never
 * touched again, so the stored number outlives the streak it describes. A real
 * account read `currentStreak: 3` with `lastActivityDate: 2026-07-28`, forty
 * days later; the navbar had been reporting that dead 3 for weeks.
 *
 * ONE source of truth, shared by client and server, because there were already
 * two rules that disagreed:
 *   - the web app decayed on read using local dates and honoured freezes
 *   - api/_lib/emailPersonalization.aliveStreak used UTC and ignored freezes
 * So the app could show a live streak while the reminder e-mail treated it as
 * dead, and vice versa.
 *
 * The rule matches recordActivity's own continuity logic, which is what will
 * actually happen when the student next does something:
 *   gap 0 or 1 day          -> alive (today extends it)
 *   gap of exactly 2 days   -> alive only while a freeze can bridge it;
 *                              recordActivity spends one for exactly this case
 *   anything longer         -> gone
 */

/**
 * Local YYYY-MM-DD.
 *
 * Never `toISOString().slice(0, 10)`: that is UTC, and Haiti is UTC-5. Between
 * 19:00 and midnight local, UTC has already rolled over, so a student who
 * studied "yesterday" reads as two days stale and their live streak is
 * declared dead. `lastActivityDate` is written from the client's local clock,
 * so it has to be compared against a local date.
 */
export function localDayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Whole days between two YYYY-MM-DD strings, order-independent. */
export function daysBetweenKeys(a: string, b: string): number {
  const parse = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  };
  return Math.round(Math.abs(parse(b) - parse(a)) / 86_400_000);
}

export interface StreakLifeInput {
  currentStreak?: unknown;
  lastActivityDate?: unknown;
  streakFreezes?: unknown;
}

/**
 * The streak as it actually stands today: the stored count if still alive,
 * otherwise 0. Never throws on malformed input — a missing or junk field is
 * treated as no streak.
 *
 * @param now Defaults to the current time. Pass one in for deterministic tests.
 */
export function liveStreakCount(streak: StreakLifeInput | null | undefined, now: Date = new Date()): number {
  const stored = typeof streak?.currentStreak === 'number' ? streak.currentStreak : 0;
  const last = streak?.lastActivityDate;
  if (stored <= 0 || typeof last !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(last)) return 0;

  const gap = daysBetweenKeys(last, localDayKey(now));
  if (gap <= 1) return stored;

  const freezes = typeof streak?.streakFreezes === 'number' ? streak.streakFreezes : 0;
  if (gap === 2 && freezes > 0) return stored;

  return 0;
}

/** True when the streak is still going. */
export function isStreakAlive(streak: StreakLifeInput | null | undefined, now: Date = new Date()): boolean {
  return liveStreakCount(streak, now) > 0;
}
