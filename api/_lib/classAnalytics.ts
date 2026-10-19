/**
 * Teacher mastery analytics for one class.
 *
 * Reads the ONE shared mastery doc per student (users/{uid}/mastery/lessons,
 * shared/masteryMerge MASTERY_PATH) server-side and returns only aggregates and
 * per-chapter LEVELS: never bestPct, exercise answers, exam answers or Sandra
 * transcripts. Only approved members who accepted the v2 disclosure are read.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { CLASS_CONSENT_VERSION, ClassError, assertTeacher, classId, type ClassAnalytics, type ClassRecord, type LevelCounts, type MasteryLevelName } from '../../shared/classes';
import { MASTERY_ORDER, MASTERY_POINTS, lessonMastery, summarize, type ProgressMap } from '../../shared/mastery';
import { MASTERY_PATH } from '../../shared/masteryMerge';
import { fetchCourseCatalog, type CatalogCourse } from './classCatalog';

const emptyCounts = (): LevelCounts => ({ none: 0, seen: 0, familiar: 0, proficient: 0, mastered: 0 });
const pct = (counts: LevelCounts, total: number): LevelCounts =>
  Object.fromEntries(MASTERY_ORDER.map((l) => [l, total ? Math.round(counts[l] / total * 100) : 0])) as LevelCounts;

/** Pick the course a class most likely follows: its level code in the catalog (NS3 → ns3), else the first. */
export function defaultCourse(courses: CatalogCourse[], grade: string): string | null {
  const m = grade.toUpperCase().replace(/[\s.-]/g, '').match(/NS(IV|III|II|I|[1-4])/);
  const level = m ? `ns${({ I: 1, II: 2, III: 3, IV: 4 } as Record<string, number>)[m[1]] ?? m[1]}` : '';
  return (courses.find((c) => level && c.level === level) || courses[0])?.id ?? null;
}

/** Pure aggregation, kept separate so tests can pin exactly what leaves the server. */
export function buildAnalytics(
  c: ClassRecord, course: CatalogCourse | null, courses: CatalogCourse[],
  mastery: Record<string, ProgressMap>, completions: Record<string, Record<string, { late: boolean }>>,
): ClassAnalytics {
  const members = Object.entries(c.members);
  const shared = members.filter(([uid, m]) => (m.consent || 1) >= CLASS_CONSENT_VERSION && mastery[uid] !== undefined);
  const chapters = (course?.units || []).map((u) => {
    const ids = u.lessons.map((l) => l.id);
    const counts = emptyCounts();
    let points = 0;
    for (const [uid] of shared) {
      const s = summarize(ids, mastery[uid]);
      counts[s.level as MasteryLevelName] += 1;
      points += s.points;
    }
    const lessonRows = u.lessons.map((l) => {
      const lc = emptyCounts();
      for (const [uid] of shared) lc[lessonMastery(mastery[uid][l.id]) as MasteryLevelName] += 1;
      return { id: l.id, title: l.title, counts: lc };
    });
    return { id: u.id, title: u.title, lessons: ids.length, counts, percent: pct(counts, shared.length), avgPoints: shared.length ? Math.round(points / shared.length) : 0, lessonRows };
  });
  const students = shared.map(([uid, m]) => {
    const levels: Record<string, MasteryLevelName> = {};
    let points = 0;
    for (const u of course?.units || []) {
      const s = summarize(u.lessons.map((l) => l.id), mastery[uid]);
      levels[u.id] = s.level as MasteryLevelName;
      points += s.points;
    }
    return { uid, name: m.name, points: chapters.length ? Math.round(points / chapters.length) : 0, levels };
  }).sort((a, b) => a.points - b.points || a.name.localeCompare(b.name));
  const weakest = shared.length ? [...chapters].sort((a, b) => a.avgPoints - b.avgPoints || chapters.indexOf(a) - chapters.indexOf(b))
    .filter((ch) => ch.avgPoints < MASTERY_POINTS.mastered).slice(0, 3).map((ch) => ch.id) : [];
  const roster = members.length;
  const assignments = c.assignments.map((a) => {
    const done = members.filter(([uid]) => completions[uid]?.[a.id]);
    const late = done.filter(([uid]) => completions[uid][a.id].late).length;
    return { id: a.id, title: a.title, dueAt: a.dueAt, completed: done.length, onTime: done.length - late, late, rate: roster ? Math.round(done.length / roster * 100) : 0 };
  });
  return {
    courses: courses.map((x) => ({ id: x.id, name: x.name })), courseId: course?.id ?? null,
    shared: shared.length, notShared: roster - shared.length, chapters, students, weakest, assignments,
  };
}

export async function classAnalytics(db: Firestore, uid: string, id: string, requestedCourse: unknown): Promise<ClassAnalytics> {
  const ref = db.doc(`classes/${classId(id)}`);
  const snap = await ref.get();
  if (!snap.exists) throw new ClassError('not_found');
  const c = snap.data() as ClassRecord;
  // Owner only. Read access to an owned class survives a revoked grant, like the board.
  assertTeacher(c, uid);
  const courses = await fetchCourseCatalog().catch(() => { throw new ClassError('unavailable'); });
  const wanted = typeof requestedCourse === 'string' ? courses.find((x) => x.id === requestedCourse) : undefined;
  const course = wanted || courses.find((x) => x.id === defaultCourse(courses, c.grade)) || null;
  const eligible = Object.entries(c.members).filter(([, m]) => (m.consent || 1) >= CLASS_CONSENT_VERSION).map(([u]) => u);
  const [docs, done] = await Promise.all([
    eligible.length ? db.getAll(...eligible.map((u) => db.doc(`users/${u}/${MASTERY_PATH.collection}/${MASTERY_PATH.doc}`))) : Promise.resolve([]),
    ref.collection('state').doc('completions').get(),
  ]);
  // Only the lesson map is read; any other field on the doc never enters the response.
  const mastery: Record<string, ProgressMap> = Object.fromEntries(eligible.map((u, i) => [u, ((docs[i] as any)?.data?.()?.lessons || {}) as ProgressMap]));
  return buildAnalytics(c, course, courses, mastery, (done.data()?.byUid || {}) as Record<string, Record<string, { late: boolean }>>);
}
