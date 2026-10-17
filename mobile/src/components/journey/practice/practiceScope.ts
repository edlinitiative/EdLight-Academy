/**
 * practiceScope — turns a practice handoff (LJ-06) into a scope the quiz bank
 * can actually serve, or into an honest reason it cannot. Mobile port of the
 * web's src/components/journey/practice/practiceScope.ts, same rules:
 *
 *   • `lesson` is attribution only. Bank rows carry a chapter number
 *     (`Chapter_Number` → unitNo) but no reliable lesson link, so practice
 *     opened from a lesson is ALWAYS labelled chapter-wide; the lesson only
 *     names where the student came from.
 *   • A unit that does not exist, or exists with no questions, is reported as
 *     such — never silently widened to the whole course or another subject.
 *     Whole-course practice is an explicit choice (`COURSE_WIDE`).
 *
 * Pure, and computed from data the screen already loaded (the course catalog
 * and the flattened bank), so the confirmation renders in the same frame the
 * data arrives and never flashes "0 questions".
 */
import { isGradable, type SessionItem } from './session';

export const COURSE_WIDE = '*';

export interface UnitOption {
  /** `U{n}` — or the module id when the unit has no number. */
  value: string;
  label: string;
  moduleId: string;
  no: number | null;
}

export interface LessonRef {
  id: string;
  title: string;
}

export type ScopeStatus = 'ok' | 'course-only' | 'unknown-course' | 'unknown-unit' | 'empty-unit';

export interface ResolvedScope {
  status: ScopeStatus;
  requested: { course: string; unit?: string; lesson?: string };
  course?: any;
  /** Bank subject code, e.g. "CHEM-NSI". */
  courseCode?: string;
  unit?: UnitOption;
  /** 1-based chapter position, for "Chapitre 3". */
  unitIndex?: number;
  /** Every question in the unit — what open practice draws from. */
  poolCount: number;
  /** Distinct gradable questions — what a scored quiz can hold. */
  quizCount: number;
  courseQuizCount: number;
  coursePoolCount: number;
  lesson?: LessonRef;
  nextLesson?: LessonRef;
}

const ROMAN: Record<string, string> = { '1': 'I', '2': 'II', '3': 'III', '4': 'IV' };

/** "chem-ns1", "CHEM-NSI", "chem_ns_1" → "CHEM-NSI". */
export function normalizeCourseCode(raw: string): string {
  const t = String(raw || '').trim().toUpperCase().replace(/_/g, '-').replace(/\s+/g, '');
  const m = t.match(/^([A-Z]+)-?NS-?(IV|III|II|I|[1-4])$/);
  if (m) return `${m[1]}-NS${ROMAN[m[2]] || m[2]}`;
  return t;
}

export function findCourse(courses: any[], raw: string): any | undefined {
  if (!raw || !Array.isArray(courses)) return undefined;
  const want = normalizeCourseCode(raw);
  const lower = raw.trim().toLowerCase();
  return courses.find((c) => String(c?.id || '').toLowerCase() === lower)
    || courses.find((c) => normalizeCourseCode(c?.code || '') === want)
    || courses.find((c) => normalizeCourseCode(c?.id || '') === want);
}

export function courseCodeOf(course: any): string {
  return String(course?.code || normalizeCourseCode(course?.id || ''));
}

/** The course's units in chapter order. */
export function unitOptionsFor(course: any): UnitOption[] {
  const modules = Array.isArray(course?.modules) ? course.modules : [];
  return [...modules]
    .sort((a, b) => (a?.order || 0) - (b?.order || 0))
    .map((m) => {
      const n = Number(m?.unit_no || m?.order);
      const ok = Number.isFinite(n) && n > 0;
      return {
        value: ok ? `U${n}` : String(m?.id || ''),
        label: String(m?.title || m?.id || ''),
        moduleId: String(m?.id || ''),
        no: ok ? n : null,
      };
    });
}

/** Accepts "U2", "u2", "2", the module id or the unit title. */
export function matchUnit(options: UnitOption[], raw?: string): UnitOption | undefined {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return undefined;
  const asNo = v.match(/^u?\s*(\d{1,2})$/);
  return options.find((o) => o.value.toLowerCase() === v)
    || options.find((o) => o.moduleId.toLowerCase() === v)
    || (asNo ? options.find((o) => o.no === Number(asNo[1])) : undefined)
    || options.find((o) => o.label.trim().toLowerCase() === v);
}

/** The lesson, the unit it sits in, and the lesson after it (course order). */
export function locateLesson(course: any, lessonId?: string): { lesson: LessonRef; moduleId: string; next?: LessonRef } | null {
  if (!lessonId || !course) return null;
  const modules = [...(course.modules || [])].sort((a, b) => (a?.order || 0) - (b?.order || 0));
  const flat: { lesson: any; moduleId: string }[] = [];
  for (const m of modules) {
    const lessons = [...(m?.lessons || [])].sort((a, b) => (a?.order || 0) - (b?.order || 0));
    for (const l of lessons) flat.push({ lesson: l, moduleId: String(m?.id || '') });
  }
  const i = flat.findIndex((x) => String(x.lesson?.id) === lessonId);
  if (i < 0) return null;
  const ref = (l: any): LessonRef => ({ id: String(l.id), title: String(l.title || l.id) });
  const nxt = flat[i + 1];
  return { lesson: ref(flat[i].lesson), moduleId: flat[i].moduleId, next: nxt ? ref(nxt.lesson) : undefined };
}

/** Items a scope draws from. `COURSE_WIDE` is the explicit whole-course choice. */
export function poolItems(items: SessionItem[], courseCode: string, unitNo: number | typeof COURSE_WIDE | null): SessionItem[] {
  if (!courseCode || !Array.isArray(items)) return [];
  const code = normalizeCourseCode(courseCode);
  return items.filter((it) => {
    if (!it.subjectCode || normalizeCourseCode(it.subjectCode) !== code) return false;
    if (unitNo === COURSE_WIDE) return true;
    return unitNo != null && it.unitNo === unitNo;
  });
}

/** Distinct gradable questions — the most a fixed quiz can hold. */
export function countQuizzable(items: SessionItem[]): number {
  const seen = new Set<string>();
  let n = 0;
  for (const it of items) {
    if (!isGradable(it)) continue;
    if (it.id && seen.has(it.id)) continue;
    if (it.id) seen.add(it.id);
    n += 1;
  }
  return n;
}

function distinctCount(items: SessionItem[]): number {
  const ids = new Set<string>();
  let anon = 0;
  for (const it of items) { if (it.id) ids.add(it.id); else anon += 1; }
  return ids.size + anon;
}

export function resolvePracticeScope(
  handoff: { course: string; unit?: string; lesson?: string } | null,
  courses: any[],
  items: SessionItem[],
): ResolvedScope | null {
  if (!handoff) return null;
  const requested = { course: handoff.course, unit: handoff.unit, lesson: handoff.lesson };
  const base: ResolvedScope = { status: 'unknown-course', requested, poolCount: 0, quizCount: 0, courseQuizCount: 0, coursePoolCount: 0 };
  const course = findCourse(courses, handoff.course);
  if (!course) return base;

  const courseCode = courseCodeOf(course);
  const courseRows = poolItems(items, courseCode, COURSE_WIDE);
  const withCourse: ResolvedScope = {
    ...base,
    status: 'course-only',
    course,
    courseCode,
    coursePoolCount: distinctCount(courseRows),
    courseQuizCount: countQuizzable(courseRows),
  };

  const options = unitOptionsFor(course);
  const located = locateLesson(course, handoff.lesson);
  if (located) {
    withCourse.lesson = located.lesson;
    withCourse.nextLesson = located.next;
  }
  // The unit named in the handoff wins; a lesson alone implies its own unit.
  let unit = matchUnit(options, handoff.unit);
  if (!handoff.unit && located) unit = options.find((o) => o.moduleId === located.moduleId);

  if (!handoff.unit && !unit) return withCourse;
  if (!unit) return { ...withCourse, status: 'unknown-unit' };

  const rows = unit.no != null ? poolItems(items, courseCode, unit.no) : [];
  const scoped: ResolvedScope = {
    ...withCourse,
    unit,
    unitIndex: options.indexOf(unit) + 1,
    poolCount: distinctCount(rows),
    quizCount: countQuizzable(rows),
  };
  return { ...scoped, status: rows.length > 0 ? 'ok' : 'empty-unit' };
}

/** Whole-course scope, only ever reached by an explicit tap. */
export function courseWideScope(scope: ResolvedScope): ResolvedScope {
  return {
    ...scope,
    status: 'ok',
    unit: { value: COURSE_WIDE, label: String(scope.course?.name || scope.courseCode || ''), moduleId: '', no: null },
    unitIndex: undefined,
    poolCount: scope.coursePoolCount,
    quizCount: scope.courseQuizCount,
  };
}

/** The pool behind a resolved scope. */
export function itemsForScope(scope: ResolvedScope, items: SessionItem[]): SessionItem[] {
  if (!scope.courseCode || !scope.unit) return [];
  if (scope.unit.value === COURSE_WIDE) return poolItems(items, scope.courseCode, COURSE_WIDE);
  return poolItems(items, scope.courseCode, scope.unit.no);
}

// ── General browse: Subject → Level → Chapter, chapters from real units ─────

export interface BrowseChapter {
  key: string;
  subjectCode: string;
  unitNo: number | null;
  title: string;
  items: SessionItem[];
}

/**
 * Chapters for one bank subject code. The grouped bank keys rows on a `unit`
 * title that most migrated courses never set, so a whole course used to show
 * up as one "Général" chapter of 165 questions. Here rows are regrouped by
 * their chapter number and titled from the course's own unit, when the course
 * is known; rows with no number keep their original group.
 */
export function chaptersFor(
  subjectCode: string,
  quizzes: Array<{ id: string; unit?: string; title?: string; items: SessionItem[] }>,
  course?: any,
): BrowseChapter[] {
  const options = course ? unitOptionsFor(course) : [];
  const byKey = new Map<string, BrowseChapter>();
  const order: string[] = [];
  const push = (key: string, make: () => BrowseChapter, it: SessionItem) => {
    let ch = byKey.get(key);
    if (!ch) { ch = make(); byKey.set(key, ch); order.push(key); }
    if (!it.id || !ch.items.some((x) => x.id === it.id)) ch.items.push(it);
  };
  for (const q of quizzes) {
    const groupTitle = String(q.unit || q.title || '').trim();
    for (const it of q.items) {
      const no = it.unitNo ?? null;
      // Only regroup when the group itself is not a real chapter title, i.e.
      // the "Général" catch-all — named chapters stay as authored.
      const generic = !q.unit || /^g[ée]n[ée]ral$/i.test(String(q.unit).trim());
      if (no != null && generic) {
        const opt = options.find((o) => o.no === no);
        push(`${subjectCode}|U${no}`, () => ({
          key: `${subjectCode}|U${no}`,
          subjectCode,
          unitNo: no,
          title: opt?.label || groupTitle,
          items: [],
        }), it);
      } else {
        push(`${subjectCode}|g:${q.id}`, () => ({
          key: `${subjectCode}|g:${q.id}`,
          subjectCode,
          unitNo: null,
          title: groupTitle,
          items: [],
        }), it);
      }
    }
  }
  return order
    .map((k) => byKey.get(k)!)
    .sort((a, b) => {
      if (a.unitNo != null && b.unitNo != null) return a.unitNo - b.unitNo;
      if (a.unitNo != null) return -1;
      if (b.unitNo != null) return 1;
      return a.title.localeCompare(b.title, 'fr');
    });
}

/** A scope for a chapter the student picked by hand (no lesson attribution). */
export function scopeForChapter(ch: BrowseChapter, courses: any[], all: SessionItem[]): ResolvedScope {
  const course = findCourse(courses, ch.subjectCode);
  const courseRows = poolItems(all, ch.subjectCode, COURSE_WIDE);
  const options = course ? unitOptionsFor(course) : [];
  const opt = ch.unitNo != null ? options.find((o) => o.no === ch.unitNo) : undefined;
  return {
    status: ch.items.length > 0 ? 'ok' : 'empty-unit',
    requested: { course: ch.subjectCode, unit: ch.unitNo != null ? `U${ch.unitNo}` : undefined },
    course,
    courseCode: ch.subjectCode,
    unit: { value: ch.unitNo != null ? `U${ch.unitNo}` : ch.key, label: ch.title, moduleId: opt?.moduleId || '', no: ch.unitNo },
    unitIndex: opt ? options.indexOf(opt) + 1 : undefined,
    poolCount: distinctCount(ch.items),
    quizCount: countQuizzable(ch.items),
    coursePoolCount: distinctCount(courseRows),
    courseQuizCount: countQuizzable(courseRows),
  };
}
