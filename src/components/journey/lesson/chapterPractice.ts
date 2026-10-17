/**
 * chapterPractice — what a lesson can honestly promise about practice.
 *
 * The practice page (/quizzes) scopes a session by course + unit only: it
 * reads `quizBank.byUnit[`${course.code}|U${unit_no}`]`. So the count a lesson
 * quotes for "Pratiquer ce chapitre · N questions" must come from exactly that
 * bucket — anything else would promise a number the next screen does not show.
 *
 * Lesson-level mapping (a row's Subchapter_Number matching the lesson's
 * lesson_no) exists for the in-page exercises only. The handoff link never
 * claims it: practice there is unit-wide, and is labelled as the chapter.
 */
import { practiceHref } from '../../../utils/learningJourney';

type Row = Record<string, unknown>;
export interface QuizBankLike {
  byUnit?: Record<string, Row[] | undefined>;
  bySubject?: Record<string, Row[] | undefined>;
}

export type ChapterPractice =
  /** The bank hasn't loaded yet — never render "0 questions" for this. */
  | { status: 'loading' }
  /** No course code / unit number to scope by, or the bank has no rows for it. */
  | { status: 'none'; unit: string | null }
  | { status: 'ready'; unit: string; count: number; href: string };

function toInt(v: unknown): number | null {
  if (v == null || v === '') return null;
  const m = String(v).match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

/** The bank's unit key (`U3`) for a module, as Quizzes builds its unit options. */
export function unitKeyFor(module: { unit_no?: unknown; order?: unknown } | null | undefined): string | null {
  if (!module) return null;
  const n = Number(toInt(module.unit_no) ?? toInt(module.order));
  return Number.isFinite(n) && n > 0 ? `U${n}` : null;
}

export function chapterPractice({
  quizBank,
  courseCode,
  module,
  lessonId,
}: {
  quizBank: QuizBankLike | null | undefined;
  courseCode: string | null | undefined;
  module: { unit_no?: unknown; order?: unknown } | null | undefined;
  lessonId?: string | null;
}): ChapterPractice {
  const unit = unitKeyFor(module);
  if (!courseCode || !unit) return { status: 'none', unit };
  if (!quizBank) return { status: 'loading' };
  const count = quizBank.byUnit?.[`${courseCode}|${unit}`]?.length || 0;
  if (count === 0) return { status: 'none', unit };
  return {
    status: 'ready',
    unit,
    count,
    // The one URL shape practice reads back (readPracticeHandoff). `lesson` is
    // attribution only; `mode: 'quiz'` asks for the finite session.
    href: practiceHref({ course: courseCode, unit, lesson: lessonId || undefined, mode: 'quiz', from: 'lesson' }),
  };
}

/** How many bank rows are tagged to this exact lesson (in-page exercises). */
export function lessonQuestionCount(
  quizBank: QuizBankLike | null | undefined,
  courseCode: string | null | undefined,
  module: { unit_no?: unknown; order?: unknown } | null | undefined,
  lessonNo: unknown,
): number | null {
  if (!quizBank) return null;
  const unit = unitKeyFor(module);
  const target = toInt(lessonNo);
  if (!courseCode || !unit || target == null) return 0;
  const rows = quizBank.byUnit?.[`${courseCode}|${unit}`] || [];
  return rows.filter((r) => {
    const sub = r.Subchapter_Number ?? r.subchapter_number ?? r.subchapterNo ?? '';
    return toInt(sub) === target;
  }).length;
}
