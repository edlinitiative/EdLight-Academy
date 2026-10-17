/**
 * practiceScope — turns a practice handoff (LJ-06) into a scope the quiz bank
 * can actually serve, or into an honest reason it cannot.
 *
 * Everything here is pure and derived from data already loaded by
 * `useAppData()` (the course catalog + the indexed quiz bank), so the receiving
 * page can compute the confirmation synchronously in the same render the data
 * arrives — no effect chain, so no frame that claims "0 questions".
 *
 * Rules (docs/design/2026-10-17-learning-journey-prd.md §LJ-06):
 *   • `lesson` is attribution only. The bank's per-lesson link
 *     (`byVideoId`) falls back to "first video of the unit" when a row has no
 *     exact lesson match (services/quizBank `matchVideoForRow`), so it cannot
 *     prove a question belongs to a lesson. Practice is therefore always
 *     labelled chapter-wide; the lesson only names where the student came from.
 *   • A unit that does not exist, or exists with no questions, is reported as
 *     such — never silently widened to the whole course or another subject.
 */

export const COURSE_WIDE = '*';

export interface UnitOption {
  /** The bank's unit key (`U{n}`), or the module id when no number exists. */
  value: string;
  label: string;
  /** Firestore module id, so a handoff carrying it still resolves. */
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
  /** What the link asked for, for the explanation copy. */
  requested: { course: string; unit?: string; lesson?: string };
  course?: any;
  courseCode?: string;
  unit?: UnitOption;
  /** 1-based position of the unit in the course, for "Chapitre 3". */
  unitIndex?: number;
  /** Rows in the unit (open practice draws from all of them). */
  poolCount: number;
  /** Distinct, auto-gradable questions — what a fixed quiz can hold. */
  quizCount: number;
  /** Whole-course figures, for the explicit "practise the whole course" choice. */
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

/** The course's units in chapter order, keyed the way the bank indexes them. */
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

/**
 * Can this item be marked right or wrong by the page? An essay cannot, and
 * neither can a short answer or a choice question whose key is missing — the
 * old grader compared the student's text with "" and called every answer
 * wrong. Those are shown as "not auto-corrected" instead.
 */
export function isGradable(item: any): boolean {
  if (!item || item.kind === 'essay') return false;
  if (item.kind === 'mcq' || item.kind === 'tf') {
    return Array.isArray(item.options) && item.correctIndex >= 0 && item.correctIndex < item.options.length;
  }
  if (String(item.correctText || '').trim()) return true;
  return Array.isArray(item.alternatives) && item.alternatives.some((a: any) => String(a || '').trim());
}

/** Rows a scope draws from. `COURSE_WIDE` is the explicit whole-course choice. */
export function poolRows(quizBank: any, courseCode: string, unit: string): any[] {
  if (!quizBank || !courseCode) return [];
  if (unit === COURSE_WIDE) return quizBank.bySubject?.[courseCode] || [];
  return quizBank.byUnit?.[`${courseCode}|${unit}`] || [];
}

/** Distinct, auto-gradable questions in a pool — the most a fixed quiz holds. */
export function countQuizzable(rows: any[], toItem: (row: any) => any): number {
  const seen = new Set<string>();
  let n = 0;
  for (const row of rows) {
    const id = row?.id ? String(row.id) : '';
    if (id && seen.has(id)) continue;
    const item = toItem(row);
    if (!isGradable(item)) continue;
    if (id) seen.add(id);
    n += 1;
  }
  return n;
}

export function resolvePracticeScope(
  handoff: { course: string; unit?: string; lesson?: string } | null,
  courses: any[],
  quizBank: any,
  toItem: (row: any) => any,
): ResolvedScope | null {
  if (!handoff) return null;
  const requested = { course: handoff.course, unit: handoff.unit, lesson: handoff.lesson };
  const base: ResolvedScope = { status: 'unknown-course', requested, poolCount: 0, quizCount: 0, courseQuizCount: 0, coursePoolCount: 0 };
  const course = findCourse(courses, handoff.course);
  if (!course) return base;

  const courseCode = String(course.code || normalizeCourseCode(course.id));
  const courseRows = poolRows(quizBank, courseCode, COURSE_WIDE);
  const withCourse: ResolvedScope = {
    ...base,
    status: 'course-only',
    course,
    courseCode,
    coursePoolCount: courseRows.length,
    courseQuizCount: countQuizzable(courseRows, toItem),
  };

  const options = unitOptionsFor(course);
  const located = locateLesson(course, handoff.lesson);
  if (located) {
    withCourse.lesson = located.lesson;
    withCourse.nextLesson = located.next;
  }
  // The unit named in the link wins; a lesson alone implies its own unit.
  let unit = matchUnit(options, handoff.unit);
  if (!handoff.unit && located) unit = options.find((o) => o.moduleId === located.moduleId);

  if (!handoff.unit && !unit) return withCourse;
  if (!unit) return { ...withCourse, status: 'unknown-unit' };

  const rows = poolRows(quizBank, courseCode, unit.value);
  const scoped: ResolvedScope = {
    ...withCourse,
    unit,
    unitIndex: options.indexOf(unit) + 1,
    poolCount: rows.length,
    quizCount: countQuizzable(rows, toItem),
  };
  return { ...scoped, status: rows.length > 0 ? 'ok' : 'empty-unit' };
}
