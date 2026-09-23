/**
 * The profile's "points faibles / points forts", computed from what the
 * account already stores — nothing here is estimated or invented.
 *
 *   weak   = questions the review loop has due again (utils/review.ts), grouped
 *            by the unit they came from. Same source /revision reads, so the
 *            count on a chip is the count the revision session will serve.
 *   strong = lessons the mastery ladder puts at "proficient" or "mastered"
 *            (shared/mastery.ts), grouped by unit from the lesson id
 *            ("MATH-NSI-U1-L3" → unit "MATH-NSI-U1").
 *
 * Kept pure (plus one cached fetch) so the grouping is testable without a
 * Firestore or a router.
 */
import { isDue, type ReviewMap } from '../../utils/review';
import { lessonMastery, type ProgressMap } from '../../../shared/mastery';

export type SkillSpot = {
  /** "MATH-NSI-U1" */
  unitKey: string;
  /** "MATH-NSI" — the quiz bank's subject code. */
  course: string;
  unitNo: number;
  count: number;
};

const UNIT_RE = /^([A-Z]+-NS[IV]+)-U(\d+)/;

/** "MATH-NSI-U1-L3" → { course: "MATH-NSI", unitNo: 1 }, or null. */
export function parseUnit(id?: string | null): { course: string; unitNo: number } | null {
  const m = UNIT_RE.exec(String(id || ''));
  return m ? { course: m[1], unitNo: Number(m[2]) } : null;
}

const bump = (acc: Map<string, SkillSpot>, course: string, unitNo: number) => {
  const unitKey = `${course}-U${unitNo}`;
  const cur = acc.get(unitKey);
  if (cur) cur.count += 1;
  else acc.set(unitKey, { unitKey, course, unitNo, count: 1 });
};

const ranked = (acc: Map<string, SkillSpot>, max: number) =>
  Array.from(acc.values())
    .sort((a, b) => b.count - a.count || a.unitKey.localeCompare(b.unitKey))
    .slice(0, max);

/** Units with review questions due, most first. Entries without a unit are skipped. */
export function weakSpots(map: ReviewMap, max = 4): SkillSpot[] {
  const acc = new Map<string, SkillSpot>();
  for (const e of Object.values(map || {})) {
    if (!e || !isDue(e)) continue;
    if (e.subjectCode && Number.isFinite(e.unitNo)) {
      bump(acc, e.subjectCode, Number(e.unitNo));
      continue;
    }
    const fromLesson = parseUnit(e.lessonId);
    if (fromLesson) bump(acc, fromLesson.course, fromLesson.unitNo);
  }
  return ranked(acc, max);
}

/** Units with lessons at "proficient" or better, most first. */
export function strongSpots(progress: ProgressMap, max = 4): SkillSpot[] {
  const acc = new Map<string, SkillSpot>();
  for (const [lessonId, p] of Object.entries(progress || {})) {
    const level = lessonMastery(p);
    if (level !== 'proficient' && level !== 'mastered') continue;
    const u = parseUnit(lessonId);
    if (u) bump(acc, u.course, u.unitNo);
  }
  return ranked(acc, max);
}

/** The practice page, already filtered to the unit. */
export const practiceHref = (s: Pick<SkillSpot, 'course' | 'unitNo'>) =>
  `/quizzes?course=${encodeURIComponent(s.course)}&unit=U${s.unitNo}`;

const SUBJECT: Record<string, [string, string]> = {
  MATH: ['Maths', 'Matematik'],
  PHYS: ['Physique', 'Fizik'],
  CHEM: ['Chimie', 'Chimi'],
  ECON: ['Économie', 'Ekonomi'],
  BIO: ['SVT', 'SVT'],
  SVT: ['SVT', 'SVT'],
};
const LEVEL: Record<string, string> = { NSI: 'NS1', NSII: 'NS2', NSIII: 'NS3', NSIV: 'NS4' };

/** "MATH-NSI" → "Maths NS1". */
export function courseLabel(course: string, isCreole: boolean): string {
  const [subj, lvl] = course.split('-');
  const name = SUBJECT[subj] ? SUBJECT[subj][isCreole ? 1 : 0] : subj;
  return [name, LEVEL[lvl] || lvl].filter(Boolean).join(' ');
}

/* ── Unit titles, from the committed catalogue snapshot ──────────────────────
 * The same /catalog.json the course pages load first. A chip reads
 * "Grandeurs et Mesures" rather than "U1" when the title is known, and falls
 * back to "Unité 1" when it is not (offline, or a unit the snapshot lacks). */
let titles: Record<string, string> | null = null;
let inflight: Promise<Record<string, string>> | null = null;

export function loadUnitTitles(): Promise<Record<string, string>> {
  if (titles) return Promise.resolve(titles);
  if (inflight) return inflight;
  inflight = fetch('/catalog.json')
    .then((r) => (r.ok ? r.json() : {}))
    .then((c: any) => {
      const out: Record<string, string> = {};
      const courses = Array.isArray(c?.courses) ? c.courses : [];
      for (const course of courses as any[]) {
        for (const u of Array.isArray(course?.units) ? course.units : []) {
          // Only units whose id already names the course ("MATH-NSI-U1").
          // The "chap1"-style ids of some courses carry placeholder titles
          // ("Chapitre 1: …" repeated, English overviews) that would read
          // worse than "Unité 2".
          const id = String(u?.unitId || '');
          const title = String(u?.title || '').trim();
          if (UNIT_RE.test(id) && title && title.length <= 48) out[id] = title;
        }
      }
      titles = out;
      return out;
    })
    .catch(() => ({}))
    .finally(() => { inflight = null; });
  return inflight;
}

/* ── Goal and rhythm ─────────────────────────────────────────────────────────
 * Stored on users/{uid} (studyGoal, studyMinutes) with a merge write — the
 * owner may write any field there except role and the referral fields. */
export const GOALS = [
  { id: 'bac', fr: 'Réussir le Bac', ht: 'Reyisi Bak la' },
  { id: 'grades', fr: 'Améliorer mes notes', ht: 'Amelyore nòt mwen' },
  { id: 'ahead', fr: 'Prendre de l’avance', ht: 'Pran devan' },
  { id: 'curious', fr: 'Apprendre par curiosité', ht: 'Aprann pou konnen' },
] as const;

export const RHYTHMS = [10, 20, 30, 60] as const;

export type StudyPrefs = { studyGoal: string | null; studyMinutes: number | null };

export function readStudyPrefs(doc: any): StudyPrefs {
  const goal = GOALS.some((g) => g.id === doc?.studyGoal) ? String(doc.studyGoal) : null;
  const minutes = (RHYTHMS as readonly number[]).includes(Number(doc?.studyMinutes)) ? Number(doc.studyMinutes) : null;
  return { studyGoal: goal, studyMinutes: minutes };
}
