/**
 * Pure scheduling + copy logic for the 6am Haiti daily nudge.
 * ---------------------------------------------------------------------------
 * Kept free of Firestore and network so every decision is unit-testable; the
 * cron endpoint (api/daily-nudge.ts) does the I/O and asks these helpers what
 * to do. Sibling of reengagement.ts's inline logic, which handles the *idle*
 * segments at midday — this one is the every-morning habit nudge.
 *
 * Two things worth knowing about the data:
 *  • Users have no stored timezone. Essentially all of them are in Haiti, so
 *    "6am" means 6am in America/Port-au-Prince, resolved via Intl so the
 *    EDT/EST switch is handled for us instead of hardcoding UTC-4.
 *  • The streak is NOT stored server-side — it lives in the app's local store.
 *    So "streak at risk" is inferred from `lastPlayedDate`: played yesterday,
 *    not yet today. That's why the copy never names a number of days.
 */

const TZ = 'America/Port-au-Prince';

/** `en-CA` gives an ISO-shaped YYYY-MM-DD, which sorts and compares directly. */
const dayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const hourFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hour: '2-digit',
  hour12: false,
});

/** The Haiti-local calendar day for an instant, as `YYYY-MM-DD`. */
export function haitiDateKey(now: Date = new Date()): string {
  return dayFmt.format(now);
}

/** The Haiti-local hour (0–23) for an instant. */
export function haitiHour(now: Date = new Date()): number {
  // en-GB h23 can render midnight as "24"; normalise it to 0.
  return Number(hourFmt.format(now)) % 24;
}

/** The hour we send at, in Haiti local time. */
export const NUDGE_HOUR = 6;

/**
 * True only during the 6am Haiti hour. The cron is scheduled at both 10:00 and
 * 11:00 UTC so one of them is always 6am local across the DST change; this gate
 * makes the other one a no-op.
 */
export function isNudgeHour(now: Date = new Date()): boolean {
  return haitiHour(now) === NUDGE_HOUR;
}

/** The `YYYY-MM-DD` immediately before the given one. */
export function previousDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  // Build at noon UTC so no timezone shift can roll the date over.
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

export type NudgeKind = 'daily' | 'streak-at-risk';

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * What (if anything) to send this user this morning.
 *   • played today already        → nothing; they don't need a nudge
 *   • played yesterday, not today → their streak is on the line
 *   • anything else               → the plain daily nudge
 */
export function classifyNudge(opts: {
  lastPlayedDate?: string | null;
  today: string;
}): NudgeKind | null {
  const { today } = opts;
  const last = typeof opts.lastPlayedDate === 'string' ? opts.lastPlayedDate : '';
  if (!DATE_KEY_RE.test(last)) return 'daily'; // never played, or unparseable
  if (last >= today) return null; // played today (or a clock-skewed future date)
  if (last === previousDateKey(today)) return 'streak-at-risk';
  return 'daily';
}

/** True when a nudge was already sent during the same Haiti day. */
export function alreadyNudgedToday(lastSentIso: string | null | undefined, today: string): boolean {
  if (!lastSentIso) return false;
  const d = new Date(lastSentIso);
  if (Number.isNaN(d.getTime())) return false; // don't let bad data block sends forever
  return haitiDateKey(d) === today;
}

export type NudgeLang = 'fr' | 'ht';

/**
 * Bilingual copy. Deliberately free of any streak count — the server can't see
 * the real number, and a wrong one destroys trust faster than a vague one.
 */
export function nudgeCopy(kind: NudgeKind, lang: NudgeLang, firstName?: string): {
  title: string;
  message: string;
} {
  const name = String(firstName || '').trim();
  const hi = lang === 'ht' ? (name ? `Bonjou ${name}` : 'Bonjou') : name ? `Bonjour ${name}` : 'Bonjour';

  if (kind === 'streak-at-risk') {
    return lang === 'ht'
      ? {
          title: 'Seri ou an danje 🔥',
          message: `${hi} — ou te jwe yè. Fè yon ti quiz jodi a pou w pa pèdi seri ou.`,
        }
      : {
          title: 'Ta série est en jeu 🔥',
          message: `${hi} — tu as joué hier. Fais un quiz aujourd'hui pour ne pas perdre ta série.`,
        };
  }

  return lang === 'ht'
    ? {
        title: 'Quiz maten an ☀️',
        message: `${hi} — 2 minit sou yon quiz pou kòmanse jounen an byen.`,
      }
    : {
        title: 'Ton quiz du matin ☀️',
        message: `${hi} — 2 minutes de quiz pour bien commencer la journée.`,
      };
}
