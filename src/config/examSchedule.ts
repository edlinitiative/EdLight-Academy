/**
 * Exam Schedule
 * ─────────────
 * National-exam sessions, used for the countdown a student sees on their
 * dashboard.
 *
 * WHAT WAS WRONG HERE, AND WHY IT MATTERED
 * The original entries modelled the Bac as two parts a fortnight apart
 * ("1ʳᵉ partie" / "2ᵉ partie"). That is the OLD structure. Students on the
 * Nouveau Secondaire — the programme this whole app teaches — sit a single
 * end-of-NS4 exam, the "bac unique". The dates were wrong too: the 2026 Bac
 * ran 13–16 July, not 6 July. So the countdown was telling an NS4 student
 * about two exams they will never sit, on dates a week out.
 *
 * SOURCES for the 2026 calendar, published by the MENFP in mid-May 2026 and
 * reported consistently by Ted'Actu (2026-05-16), Le Quotidien 509, KARIBINFO
 * and hpninfo: 9ᵉ A.F. 29 June – 2 July; Bac (Secondaire 4) 13–16 July, a
 * single session, 118 090 candidates, in the four series this app knows
 * (SVT, LLA, SMP, SES). The traditional Bac (Philo) still runs in parallel
 * for the outgoing system — it is NOT what our students sit, so it is not
 * listed here.
 *
 * ⚠️  `confirmed: false` means the date is OUR ESTIMATE, not the MENFP's
 * calendar. The ministry publishes each year's dates around mid-May, so an
 * estimate is what we can honestly offer for the rest of the year. Anything
 * rendering these dates must say so — see ExamCountdown, which only drops its
 * "date indicative" caveat once a session is marked confirmed. When the real
 * calendar is published: set the dates and flip the flag. That is the whole
 * maintenance job, and it is why these live in one file.
 */

export interface ExamSession {
  id: string;
  /** URL level segment used by the /exams routes. */
  level: 'terminale' | '9e' | 'university';
  label: string;
  labelHt: string;
  /** First day of the session. ISO date (YYYY-MM-DD), local. */
  dateISO: string;
  /** Last day, when the session runs over several days. Defaults to dateISO. */
  endISO?: string;
  /** True only when these dates come from the published MENFP calendar. */
  confirmed?: boolean;
}

export const EXAM_SESSIONS: ExamSession[] = [
  // ── 2026: published, and now past. Kept so the record is right. ──────────
  { id: '9e-2026',  level: '9e',        label: 'Examen 9ᵉ A.F.', labelHt: 'Egzamen 9yèm A.F.', dateISO: '2026-06-29', endISO: '2026-07-02', confirmed: true },
  { id: 'ns4-2026', level: 'terminale', label: 'Bac — fin du Nouveau Secondaire', labelHt: 'Bak — fen Nouvo Segondè', dateISO: '2026-07-13', endISO: '2026-07-16', confirmed: true },

  // ── 2027: NOT ANNOUNCED. Estimated by carrying the 2026 weekdays forward
  //    (the 9ᵉ opens the last Monday of June, the Bac the second Monday of
  //    July). Replace with the real dates when the MENFP publishes them. ────
  { id: '9e-2027',  level: '9e',        label: 'Examen 9ᵉ A.F.', labelHt: 'Egzamen 9yèm A.F.', dateISO: '2027-06-28', endISO: '2027-07-01', confirmed: false },
  { id: 'ns4-2027', level: 'terminale', label: 'Bac — fin du Nouveau Secondaire', labelHt: 'Bak — fen Nouvo Segondè', dateISO: '2027-07-12', endISO: '2027-07-15', confirmed: false },
];

/** Midnight (local) for an ISO date string. */
function startOfDay(dateISO: string): Date {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Midnight (local) for a Date. */
function midnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole calendar days from `from` until an exam date (negative if past). */
export function daysUntil(dateISO: string, from: Date = new Date()): number {
  const target = startOfDay(dateISO).getTime();
  const base = midnight(from).getTime();
  return Math.round((target - base) / 86_400_000);
}

/**
 * The next future exam session. Optionally prefer sessions matching a given
 * URL level (e.g. a Terminale learner sees the Bac, not the 9ᵉ exam).
 * Falls back to the soonest upcoming session of any level.
 */
export function getNextExamSession(
  level?: string | null,
  from: Date = new Date(),
): (ExamSession & { daysRemaining: number }) | null {
  const upcoming = EXAM_SESSIONS
    .map((s) => ({
      ...s,
      daysRemaining: daysUntil(s.dateISO, from),
      // A session stays current until its LAST day. Filtering on the start
      // date meant that on day 2 of a four-day exam the countdown skipped to
      // next year's — telling a student sitting the Bac that morning that
      // their Bac was in 360 days.
      daysUntilOver: daysUntil(s.endISO || s.dateISO, from),
    }))
    .filter((s) => s.daysUntilOver >= 0)
    .sort((a, b) => a.daysRemaining - b.daysRemaining);

  if (upcoming.length === 0) return null;

  if (level) {
    const match = upcoming.find((s) => s.level === level);
    if (match) return match;
  }
  return upcoming[0];
}

/** Map a Bac track / onboarding choice to a preferred exam level (best-effort). */
export function preferredLevelForTrack(track?: string | null): string | null {
  if (!track) return null;
  if (track === 'PREFAC') return 'university';
  // All Bac tracks (SVT/SMP/SES/LET/ARTS) are Terminale-level.
  return 'terminale';
}

// ─── Seasonal plan mode ─────────────────────────────────────────────────────
// Once the Bac is over, a Bac-centric study plan is the wrong default — students
// pivot to concours d'admission ("préfac"). We surface the Bac plan only when a
// Bac session is within this many days; otherwise the default is préfac.
const BAC_SEASON_DAYS = 150; // ~5 months out

export type PlanSeason = 'bac' | 'prefac';

/**
 * Which study-plan mode is in season right now. 'bac' when the next Bac session
 * is within BAC_SEASON_DAYS; otherwise 'prefac'. Drives the default plan mode so
 * the Bac plan auto-returns as the next Bac cycle approaches — no code change.
 */
export function currentPlanSeason(from: Date = new Date()): PlanSeason {
  const nextBac = EXAM_SESSIONS
    .map((s) => ({
      ...s,
      daysRemaining: daysUntil(s.dateISO, from),
      daysUntilOver: daysUntil(s.endISO || s.dateISO, from),
    }))
    .filter((s) => s.level === 'terminale' && s.daysUntilOver >= 0)
    .sort((a, b) => a.daysRemaining - b.daysRemaining)[0];
  if (nextBac && nextBac.daysRemaining <= BAC_SEASON_DAYS) return 'bac';
  return 'prefac';
}
