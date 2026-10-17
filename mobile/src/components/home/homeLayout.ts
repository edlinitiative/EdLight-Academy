/**
 * homeLayout — the pure decisions behind the Accueil tab's Stitch layout
 * (DIRECTION §1/§2). State in, display facts out; no React, no i18n beyond
 * the (fr, ht) pairs the callers pass through `t`.
 *
 * Honesty rules it encodes (founder): every number shown is a real count from
 * the store / catalogue, every date is a real tournament date, and when there
 * is nothing to say the copy says so ("Aucun championnat prévu"), never a
 * placeholder.
 */
import type { ProgressMap } from '../../utils/mastery';
import { GRADE_TO_LEVEL, summarizeCourse, type EvidenceSummary } from '../journey/home/homeJourney';
import type { ArenaTournament, ArenaRegistration } from '../../services/arenaService';

type T = (fr: string, ht: string) => string;

// ---------------------------------------------------------------------------
// Ta progression — three totals over every course with evidence
// ---------------------------------------------------------------------------

export type ProgressTotals = { completed: number; practised: number; mastered: number };

/**
 * Lesson-level facts summed across courses. Each is still one independent
 * statement ("8 terminées", "2 maîtrisées") over distinct lessons — lesson ids
 * are globally unique — so summing per-course counts never double-counts.
 */
export function progressTotals(rows: { summary: EvidenceSummary }[]): ProgressTotals {
  return rows.reduce<ProgressTotals>(
    (acc, r) => ({
      completed: acc.completed + r.summary.completed,
      practised: acc.practised + r.summary.practised,
      mastered: acc.mastered + r.summary.mastered,
    }),
    { completed: 0, practised: 0, mastered: 0 },
  );
}

export const hasEvidence = (p: ProgressTotals) => p.completed + p.practised + p.mastered > 0;

// ---------------------------------------------------------------------------
// Mes cours — the rail
// ---------------------------------------------------------------------------

export type RailCourse = { course: any; summary: EvidenceSummary };

/**
 * The courses the rail shows, in order: enrolled, then any course with saved
 * evidence, then the rest of the student's class (so a student who has not
 * enrolled yet still sees their subjects). "Coming soon" courses never appear.
 * Without a class, only enrolled / worked-in courses — never a guessed level.
 */
export function railCourses(input: {
  courses: any[] | null | undefined;
  enrolledIds: string[];
  mastery: ProgressMap;
  completedByCourse?: Map<string, Set<string>>;
  grade?: string | null;
  limit?: number;
}): RailCourse[] {
  const level = input.grade ? GRADE_TO_LEVEL[input.grade] : undefined;
  const live = (input.courses || []).filter((c) => c && c.id && !c.comingSoon);
  const enrolled = new Set(input.enrolledIds);
  const rows = live.map((course) => ({
    course,
    summary: summarizeCourse(course, input.mastery, input.completedByCourse?.get(course.id)),
  }));
  const worked = (r: RailCourse) => r.summary.completed + r.summary.practised + r.summary.mastered;
  const rank = (r: RailCourse) => {
    if (enrolled.has(r.course.id)) return 0;
    if (worked(r) > 0) return 1;
    if (level && r.course.level === level) return 2;
    return 9;
  };
  return rows
    .filter((r) => rank(r) < 9)
    // Stable within a rank: the catalogue's own order (subject order).
    .map((r, i) => ({ r, i, k: rank(r) }))
    .sort((a, b) => a.k - b.k || (a.k === 1 ? worked(b.r) - worked(a.r) : 0) || a.i - b.i)
    .map((x) => x.r)
    .slice(0, input.limit ?? 6);
}

/** "4/24 leçons" once work exists, "24 leçons" before; null with no lessons. */
export function railMeta(s: EvidenceSummary, t: T): string | null {
  if (s.total <= 0) return null;
  const unit = s.total > 1 ? t('leçons', 'leson') : t('leçon', 'leson');
  return s.completed > 0 ? `${s.completed}/${s.total} ${unit}` : `${s.total} ${unit}`;
}

// ---------------------------------------------------------------------------
// Arène tile
// ---------------------------------------------------------------------------

export type ArenaTileTarget =
  | { screen: 'ArenaLobby'; tournamentId: string }
  | { screen: 'ArenaLive'; tournamentId: string }
  | { screen: 'ArenaResult'; tournamentId: string }
  | { screen: 'ArenaHub' };

/**
 * What the Arène tile says and where it goes. Same branches as
 * ArenaAnnounceCard (open for sign-up → lobby; registered and mid-event →
 * live; provisional results → result), plus the honest empty state: no event
 * open → "Aucun championnat prévu" and the hub. A start date already behind
 * us is never printed.
 */
export function arenaTile(input: {
  open: ArenaTournament | null | undefined;
  active: ArenaTournament | null | undefined;
  myRegistration: ArenaRegistration | null | undefined;
  now: number;
  t: T;
  formatDate: (ms: number) => string;
}): { line: string; target: ArenaTileTarget; live: boolean; title?: string } {
  const { open, active, myRegistration, now, t } = input;
  const reentry = !open && active && myRegistration ? active : null;
  if (reentry) {
    if (reentry.state === 'provisional') {
      return { title: reentry.title, line: t('Tes résultats sont prêts', 'Rezilta ou yo pare'), target: { screen: 'ArenaResult', tournamentId: reentry.id }, live: false };
    }
    return { title: reentry.title, line: t('En cours, reviens dans l’Arène', 'Li ap fèt, retounen nan Arèn nan'), target: { screen: 'ArenaLive', tournamentId: reentry.id }, live: true };
  }
  if (open) {
    if (open.state === 'doors') {
      return { title: open.title, line: t('Les portes sont ouvertes', 'Pòt yo louvri'), target: { screen: 'ArenaLobby', tournamentId: open.id }, live: true };
    }
    let date = '';
    if (open.startsAt && open.startsAt > now) {
      try { date = input.formatDate(open.startsAt); } catch { date = ''; }
    }
    return {
      title: open.title,
      line: date ? t(`Championnat le ${date}`, `Chanpyona ${date}`) : t('Inscriptions ouvertes', 'Enskripsyon louvri'),
      target: { screen: 'ArenaLobby', tournamentId: open.id },
      live: false,
    };
  }
  return { line: t('Aucun championnat prévu', 'Pa gen chanpyona pwograme'), target: { screen: 'ArenaHub' }, live: false };
}

// ---------------------------------------------------------------------------
// Weekly goal row
// ---------------------------------------------------------------------------

/** 0–100, clamped; a goal of 0 never divides. */
export function goalPercent(done: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((done / goal) * 100)));
}
