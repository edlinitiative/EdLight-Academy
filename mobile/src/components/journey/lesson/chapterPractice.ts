/**
 * chapterPractice — what a lesson can honestly promise about practice (LJ-05/06).
 * Mobile port of the web's src/components/journey/lesson/chapterPractice.ts.
 *
 * The quiz bank has no reliable per-lesson mapping (many rows carry no
 * lesson number, and the in-lesson exercises fall back to the whole chapter),
 * so the handoff is ALWAYS unit-wide and is labelled as the chapter. The count
 * quoted on the button is the chapter's real usable question count:
 * `selectCards(raw, course.code, unit_no)` with no lesson filter — the same
 * parser the in-lesson exercises and chapter test use.
 */
import { practiceParams, type PracticeHandoff } from '../../../utils/learningJourney';
import { selectCards, toInt } from '../../../utils/practiceCards';

export type ChapterPractice =
  /** The bank hasn't loaded yet — never render "0 questions" for this. */
  | { status: 'loading' }
  /** No course code / unit number to scope by, or the bank has nothing for it. */
  | { status: 'none'; unit: string | null }
  | { status: 'ready'; unit: string; unitNo: number; count: number; handoff: PracticeHandoff };

/** The bank's unit number for a module (unit_no, else its order), or null. */
export function unitNoFor(module: { unit_no?: unknown; order?: unknown } | null | undefined): number | null {
  if (!module) return null;
  const n = toInt(module.unit_no) ?? toInt(module.order);
  return n != null && n > 0 ? n : null;
}

export function chapterPractice({
  rawBank, courseCode, module, lessonId,
}: {
  /** `useAppData().data.quizBank.raw`; undefined while loading. */
  rawBank: any[] | null | undefined;
  courseCode: string | null | undefined;
  module: { unit_no?: unknown; order?: unknown } | null | undefined;
  lessonId?: string | null;
}): ChapterPractice {
  const unitNo = unitNoFor(module);
  const unit = unitNo != null ? `U${unitNo}` : null;
  if (!courseCode || unitNo == null || !unit) return { status: 'none', unit };
  if (!rawBank) return { status: 'loading' };
  const count = selectCards(rawBank, courseCode, unitNo).length;
  if (count === 0) return { status: 'none', unit };
  return {
    status: 'ready',
    unit,
    unitNo,
    count,
    // The one param shape practice reads back (readPracticeHandoff). `lesson`
    // is attribution only; `mode: 'quiz'` asks for the finite session.
    handoff: practiceParams({ course: courseCode, unit, lesson: lessonId || undefined, mode: 'quiz', from: 'lesson' }),
  };
}
