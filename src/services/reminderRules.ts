/**
 * Reminder decision rules (pure, framework-free).
 * ---------------------------------------------------------------------------
 * The scheduling math behind EdLight's retention nudges, kept free of Firebase,
 * the DOM and the service worker so it can be unit-tested in isolation and so
 * importing it never drags the Firestore SDK into a bundle.
 *
 * The scheduler (reminderScheduler.ts) gathers live state — notification
 * preferences, the user's streak and their daily-challenge status — and hands
 * plain values to `decideEveningReminder`, which returns at most ONE nudge to
 * fire. Capping it to one keeps users from getting several pings in the same
 * evening.
 */

export const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

export type EveningReminderKind = 'streak' | 'daily' | 'study' | 'none';

export interface EveningReminderInput {
  /** Current local time. */
  now: Date;
  /** Today's reminder time (local), derived from prefs.reminderTime. */
  target: Date;
  /** Grace window for the *generic* study nudge so it never pings late at night. */
  graceMs: number;
  /** Weekday names on which the generic study nudge is allowed. */
  reminderDays: string[];
  /** Weekday name for `now` (WEEKDAYS[now.getDay()]). */
  weekday: string;
  /** Current global streak length. */
  streakDays: number;
  /** Whether the streak already counts today (lastActivityDate === today). */
  streakActiveToday: boolean;
  /** Whether the user has prior engagement (a streak or any played trivia round). */
  engaged: boolean;
  /** Whether today's daily challenge is already completed. */
  dailyCompletedToday: boolean;
}

/**
 * Choose the single most relevant evening nudge — or none.
 *
 * Priority (each fires at most once per day, enforced by the caller's stamp):
 *   1. `streak` — an active streak that hasn't been extended today. Most urgent
 *      because it resets at local midnight, so it may fire all evening, any day.
 *   2. `daily`  — today's daily challenge is still open, for already-engaged
 *      users. Also resets at midnight, so it may fire all evening, any day.
 *   3. `study`  — the generic "time to revise" nudge, only on the user's chosen
 *      reminder days and within the grace window (preserves the legacy nudge).
 */
export function decideEveningReminder(i: EveningReminderInput): EveningReminderKind {
  if (i.now < i.target) return 'none'; // before the evening window today

  // 1. Protect a streak that resets tonight — the most time-sensitive case.
  if (i.streakDays >= 1 && !i.streakActiveToday) return 'streak';

  // 2. Nudge engaged users toward an unfinished daily challenge.
  if (i.engaged && !i.dailyCompletedToday) return 'daily';

  // 3. Generic fallback: only on chosen days and not stale (within grace).
  const withinGrace = i.now.getTime() - i.target.getTime() <= i.graceMs;
  if (i.reminderDays.includes(i.weekday) && withinGrace) return 'study';

  return 'none';
}

/**
 * Parse 'HH:MM' (24h) to [hours, minutes], falling back to the given defaults
 * for anything malformed or out of range. Note `Number('')` is 0, so an empty
 * field must be rejected explicitly — hence the strict regex.
 */
export function parseHHMM(value: string | undefined, defHour = 18, defMin = 0): [number, number] {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) return [defHour, defMin];
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  return [hh >= 0 && hh <= 23 ? hh : defHour, mm >= 0 && mm <= 59 ? mm : defMin];
}

export interface RetentionNotification {
  title: string;
  body: string;
  tag: string;
  url: string;
}

/** Build the bilingual notification copy for an actionable reminder kind. */
export function buildRetentionNotification(
  kind: Exclude<EveningReminderKind, 'none'>,
  language: string,
  streakDays = 0,
): RetentionNotification {
  const isHt = language === 'ht';
  switch (kind) {
    case 'streak':
      return {
        title: isHt
          ? `Pa pèdi seri ${streakDays} jou ou a 🔥`
          : `Ne perds pas ta série de ${streakDays} jours 🔥`,
        body: isHt
          ? 'Fè yon ti aktivite jodi a anvan minwi pou kenbe seri a.'
          : 'Fais une activité aujourd’hui avant minuit pour garder ta série.',
        tag: 'streak-risk-nudge',
        url: '/dashboard',
      };
    case 'daily':
      return {
        title: isHt ? 'Defi jou a ap tann ou 🎯' : 'Le défi du jour t’attend 🎯',
        body: isHt
          ? '10 kesyon, jiska 50 XP an plis. Ann ale!'
          : '10 questions, jusqu’à 50 XP bonus. C’est parti !',
        tag: 'daily-challenge-nudge',
        url: '/trivia',
      };
    case 'study':
    default:
      return {
        title: isHt ? 'Lè pou revize ✨' : 'Temps de réviser ✨',
        body: isHt
          ? 'Kontinye aprantisaj ou sou EdLight Academy.'
          : 'Continue ton apprentissage sur EdLight Academy.',
        tag: 'daily-study-nudge',
        url: '/dashboard',
      };
  }
}
