/**
 * previewQuestion — the one real bank question a lesson's practice card shows
 * live (Stitch web direction §2.1: "the preview is the activity, not a picture
 * of it").
 *
 * It is drawn from the SAME unit bucket the practice handoff opens
 * (`quizBank.byUnit[`${code}|U${n}`]`), preferring rows tagged to this lesson.
 * Only a question that fits the card honestly qualifies: an auto-gradable
 * multiple choice with 2–4 short plain-text options and a plain stem — maths
 * markup would need the KaTeX renderer, and a long stem would push the Start
 * button off a phone screen. No qualifying row → no preview (never invented).
 *
 * The pick is deterministic (first qualifying row in bank order), so the card
 * does not reshuffle on every render.
 */
import { toDirectItemFromRow } from '../../../services/quizBank';
import { isGradable } from '../practice/practiceScope';
import { unitKeyFor, type QuizBankLike } from './chapterPractice';

export interface PreviewQuestion {
  id: string | null;
  stem: string;
  options: string[];
  correctIndex: number;
  good?: string;
}

/** The quiz-mode deck holds at most this many (Quizzes QUIZ_LENGTH). */
export const QUIZ_SESSION_MAX = 10;

const RICH = /\$|\\\(|\\\[|\*\*|`|\||<\/?[a-z]/i;
const MAX_STEM = 140;
const MAX_OPTION = 48;

function toInt(v: unknown): number | null {
  const m = String(v ?? '').match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function fits(item: any): item is { stem: string; options: string[]; correctIndex: number; id?: string; good?: string } {
  if (!item || item.kind !== 'mcq' || !isGradable(item)) return false;
  const stem = String(item.stem || '').trim();
  if (!stem || stem.length > MAX_STEM || RICH.test(stem) || String(item.context || '').trim()) return false;
  const opts: string[] = item.options;
  if (opts.length < 2 || opts.length > 4) return false;
  return opts.every((o) => {
    const s = String(o || '').trim();
    return s && s.length <= MAX_OPTION && !RICH.test(s);
  });
}

export function pickPreviewQuestion(
  quizBank: QuizBankLike | null | undefined,
  courseCode: string | null | undefined,
  module: { unit_no?: unknown; order?: unknown } | null | undefined,
  lessonNo?: unknown,
): PreviewQuestion | null {
  const unit = unitKeyFor(module);
  if (!quizBank || !courseCode || !unit) return null;
  const rows = quizBank.byUnit?.[`${courseCode}|${unit}`] || [];
  if (!rows.length) return null;
  const target = toInt(lessonNo);
  const tagged = target == null ? [] : rows.filter((r) => toInt(r.Subchapter_Number ?? r.subchapter_number ?? r.subchapterNo) === target);
  for (const row of [...tagged, ...rows]) {
    let item: any = null;
    try { item = toDirectItemFromRow(row); } catch { item = null; }
    if (fits(item)) {
      return {
        id: item.id ? String(item.id) : null,
        stem: item.stem.trim(),
        options: item.options.map((o: string) => String(o).trim()),
        correctIndex: item.correctIndex,
        good: item.good ? String(item.good).trim() : undefined,
      };
    }
  }
  return null;
}

/** Distinct auto-gradable questions the quiz session will hold (≤ QUIZ_SESSION_MAX). */
export function sessionQuestionCount(
  quizBank: QuizBankLike | null | undefined,
  courseCode: string | null | undefined,
  module: { unit_no?: unknown; order?: unknown } | null | undefined,
): number {
  const unit = unitKeyFor(module);
  if (!quizBank || !courseCode || !unit) return 0;
  const rows = quizBank.byUnit?.[`${courseCode}|${unit}`] || [];
  const seen = new Set<string>();
  let n = 0;
  for (const row of rows) {
    const id = row?.id ? String(row.id) : '';
    if (id && seen.has(id)) continue;
    let item: any = null;
    try { item = toDirectItemFromRow(row); } catch { item = null; }
    if (!isGradable(item)) continue;
    if (id) seen.add(id);
    n += 1;
    if (n >= QUIZ_SESSION_MAX) break;
  }
  return n;
}
