/**
 * DEV-ONLY FIXTURE — /profile?preview=signed-in (and ?preview=school-card).
 *
 * The signed-in profile can't be reached by an automated browser (sign-in is
 * Google / e-mail), so this is the screenshot harness, like the workspace's
 * /dashboard?preview=. Profile.tsx reads it only when NODE_ENV !== 'production'.
 *
 * Every value below is FICTIONAL but real-shaped: the same documents the page
 * reads in production (trivia profile, streak doc, weekly board entries,
 * school race standings, per-course progress docs, the shared mastery map,
 * the review map). Nothing here is ever written anywhere.
 */
import { normalizeName, schoolRace, type GroupRanking } from '../../../shared/leaderboardAgg';
import type { ProgressMap } from '../../../shared/mastery';
import type { ReviewMap } from '../../utils/review';

export const PREVIEW_UID = 'preview-student';
const SCHOOL = 'Collège Dominique Savio';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Active on each day of this week up to today, minus one gap (fictional). */
function fixtureActiveDays(now = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < 9; i++) {
    if (i === 6) continue;
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    out.push(ymd(d));
  }
  return out;
}

const lessonRange = (prefix: string, units: number[], perUnit: number) =>
  units.flatMap((u) => Array.from({ length: perUnit }, (_, i) => `${prefix}-U${u}-L${i + 1}`));

const member = (uid: string, name: string, xp: number) => ({ uid, displayName: name, xp });
const group = (label: string, xps: number[]): GroupRanking => ({
  key: normalizeName(label),
  label,
  members: xps.length,
  totalXp: xps.reduce((a, b) => a + b, 0),
  topMembers: xps.map((xp, i) => member(`${label}-${i}`, `Élève ${i + 1}`, xp)),
} as any);

export function buildProfilePreview() {
  const user = { uid: PREVIEW_UID, name: 'Élève Aperçu', email: 'apercu@exemple.invalid' };
  const leaderboard = { optedIn: true, displayName: 'Aperçu', school: SCHOOL, city: 'Pétion-Ville', department: 'Ouest' };
  const profile = { xp: 1240, totalQuestions: 180, totalCorrect: 141, leaderboard };
  const level = { level: 6, xp: 1240, xpToNext: 160, progressPct: 72 };
  const streak = { currentStreak: 5, longestStreak: 12, milestones: ['streak_3'], activeDays: fixtureActiveDays() };

  const entries = [
    { id: 'p1', rank: 1, xp: 2210, displayName: 'Jean P.', school: 'Institution Saint-Louis de Gonzague' },
    { id: 'p2', rank: 2, xp: 1980, displayName: 'Mika D.', school: SCHOOL },
    { id: 'p3', rank: 3, xp: 1610, displayName: 'Rose A.', school: 'Collège Saint-Louis de Bourdon' },
    { id: PREVIEW_UID, rank: 4, xp: 1240, displayName: 'Aperçu', school: SCHOOL },
    { id: 'p5', rank: 5, xp: 1105, displayName: 'Didi L.', school: SCHOOL },
  ];

  const race = schoolRace([
    group('Institution Saint-Louis de Gonzague', [2210, 1400, 1200, 900, 700, 300]),
    group('Collège Saint-Louis de Bourdon', [1610, 1300, 1000, 800, 650]),
    group(SCHOOL, [1980, 1240, 1105, 600, 420, 200]),
    group('Collège Marie Dominique Mazzarello', [900, 600, 300]),
  ]);

  const allProgress = [
    { courseId: 'chem-ns1', completedLessons: lessonRange('CHEM-NSI', [1, 2], 6), totalPoints: 420 },
    { courseId: 'math-ns1', completedLessons: lessonRange('MATH-NSI', [1], 8), totalPoints: 260 },
    { courseId: 'econ-ns1', completedLessons: lessonRange('ECON-NSI', [1], 3) },
  ];

  const mastery: ProgressMap = {};
  lessonRange('CHEM-NSI', [1], 7).forEach((id, i) => { mastery[id] = { completed: true, bestPct: 80 + i, ...(i < 4 ? { masteredAt: 1 } : {}) } as any; });
  lessonRange('MATH-NSI', [1], 3).forEach((id) => { mastery[id] = { completed: true, bestPct: 75 } as any; });
  mastery['MATH-NSI-U1-L4'] = { completed: true, bestPct: 92, masteredAt: 1 } as any;

  const review: ReviewMap = {
    r1: { missedAt: 5, subjectCode: 'MATH-NSI', unitNo: 2 },
    r2: { missedAt: 6, subjectCode: 'MATH-NSI', unitNo: 2 },
    r3: { missedAt: 7, subjectCode: 'CHEM-NSI', unitNo: 3 },
  } as any;

  return {
    user,
    profile,
    level,
    streak,
    entries,
    myRank: 4,
    race,
    allProgress,
    mastery,
    review,
    studyPrefs: { studyGoal: 'bac', studyMinutes: 30 },
    grade: 'NS1',
  };
}

export type ProfilePreview = ReturnType<typeof buildProfilePreview>;
