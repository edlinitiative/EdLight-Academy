/**
 * Exam Schedule
 * ─────────────
 * Configurable upcoming national-exam sessions used for the "Upcoming Exam"
 * countdown on the home dashboard ("42 days until Bac I").
 *
 * ⚠️  Dates are placeholders and should be confirmed/updated by an admin each
 * year against the official MENFP calendar. Keeping them here (rather than
 * hard-coded in a component) makes that a one-line edit.
 */

export interface ExamSession {
  id: string;
  /** URL level segment used by the /exams routes. */
  level: 'terminale' | '9e' | 'university';
  label: string;
  labelHt: string;
  /** ISO date (YYYY-MM-DD), local. */
  dateISO: string;
}

export const EXAM_SESSIONS: ExamSession[] = [
  { id: '9e-2026',   level: '9e',        label: 'Examen 9ᵉ A.F.',       labelHt: 'Egzamen 9yèm A.F.',  dateISO: '2026-06-29' },
  { id: 'bac1-2026', level: 'terminale', label: 'Bac — 1ʳᵉ partie',     labelHt: 'Bak — 1ye pati',     dateISO: '2026-07-06' },
  { id: 'bac2-2026', level: 'terminale', label: 'Bac — 2ᵉ partie',      labelHt: 'Bak — 2yèm pati',    dateISO: '2026-07-20' },
  { id: '9e-2027',   level: '9e',        label: 'Examen 9ᵉ A.F.',       labelHt: 'Egzamen 9yèm A.F.',  dateISO: '2027-06-28' },
  { id: 'bac1-2027', level: 'terminale', label: 'Bac — 1ʳᵉ partie',     labelHt: 'Bak — 1ye pati',     dateISO: '2027-07-05' },
  { id: 'bac2-2027', level: 'terminale', label: 'Bac — 2ᵉ partie',      labelHt: 'Bak — 2yèm pati',    dateISO: '2027-07-19' },
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
    .map((s) => ({ ...s, daysRemaining: daysUntil(s.dateISO, from) }))
    .filter((s) => s.daysRemaining >= 0)
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
    .map((s) => ({ ...s, daysRemaining: daysUntil(s.dateISO, from) }))
    .filter((s) => s.level === 'terminale' && s.daysRemaining >= 0)
    .sort((a, b) => a.daysRemaining - b.daysRemaining)[0];
  if (nextBac && nextBac.daysRemaining <= BAC_SEASON_DAYS) return 'bac';
  return 'prefac';
}
