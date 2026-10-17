/**
 * courseOutline — the pure facts behind the Cours tab's chapter cards, the
 * course overview's "Plan du cours" and the lesson page's "Plan du chapitre".
 *
 * Everything here reads the real catalogue + the one mastery map; nothing is
 * invented. A missing duration stays missing (never a placeholder minute
 * count), a zero-progress chapter reports `started: false` so the UI can hide
 * its meter (mastery-model: a grey 0 bar reads as a failed render).
 */
import { lessonEvidence, isDone } from '../journey/home/homeJourney';
import { extractYouTubeId, lessonVideoThumbs } from '../../utils/videoThumb';
import { courseCoverFor } from '../../utils/courseCovers';
import type { ProgressMap } from '../../utils/mastery';

/** Shelf order on the Cours tab (DIRECTION §3): Math, Physique, Chimie, Économie, SVT, then languages. */
export const SHELF_SUBJECT_ORDER = ['MATH', 'PHYS', 'CHEM', 'ECON', 'SVT', 'FR', 'EN'];

export function subjectRank(code: string | null | undefined): number {
  const i = SHELF_SUBJECT_ORDER.indexOf(String(code ?? ''));
  return i === -1 ? SHELF_SUBJECT_ORDER.length : i;
}

/** Real minutes only: positive finite numbers, rounded. */
export function lessonMinutes(lesson: any): number | null {
  const n = Number(lesson?.duration);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** 52 → "52 min", 125 → "2 h 05". */
export function formatMinutes(min: number | null | undefined): string | null {
  if (min == null || !Number.isFinite(min) || min <= 0) return null;
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} h` : `${h} h ${String(r).padStart(2, '0')}`;
}

export type ChapterCard = {
  /** Position in the course, 0-based (the UI says "Chapitre {index + 1}"). */
  index: number;
  id: string;
  title: string;
  lessonCount: number;
  /** Sum of the KNOWN lesson durations, or null when none is known. */
  minutes: number | null;
  /** Lessons with completion evidence. */
  done: number;
  /** 0–100, done over lessonCount. */
  pct: number;
  started: boolean;
  /** Still candidates of the chapter's first video lesson (sharpest first). */
  thumbs: string[];
};

function unitLessons(unit: any): any[] {
  return Array.isArray(unit?.lessons) ? unit.lessons.filter((l: any) => l && l.id) : [];
}

/**
 * A chapter card's still: the lesson's MID-VIDEO frame first (`sd2`, captured
 * by YouTube at ~50%), because a lesson's default still is its opening frame —
 * for Math NS I chapter 1 that is the iPad colour-picker menu, the very frame
 * utils/courseCovers was written to avoid. `sd*` is 4:3 letterboxed; the 16:9
 * VideoCover with resizeMode="cover" crops the bars (as for course covers).
 * Then the regular sharp-to-safe walk.
 */
export function chapterStills(lesson: any): string[] {
  const id = extractYouTubeId(lesson?.videoUrl);
  const rest = lessonVideoThumbs(lesson?.videoUrl, lesson?.thumbnail);
  return id ? [`https://i.ytimg.com/vi/${id}/sd2.jpg`, ...rest] : rest;
}

/**
 * Chapter 1 leads with the course's hand-picked cover when it has one: some
 * lessons show the iPad colour picker for their WHOLE length (Math NS I
 * "Règles de Calcul" — every auto frame, sd1–sd3, has it), so no frame of
 * that lesson is usable and the picked course frame is the honest stand-in.
 */
function withCover(cover: string | null, rest: string[]): string[] {
  return cover ? [cover, ...rest.filter((u) => u !== cover)] : rest;
}

/** One card per chapter that has lessons, in course order. */
export function chapterCards(course: any, mastery: ProgressMap): ChapterCard[] {
  const units: any[] = Array.isArray(course?.modules) ? course.modules : [];
  const out: ChapterCard[] = [];
  units.forEach((unit, index) => {
    const lessons = unitLessons(unit);
    if (lessons.length === 0) return;
    let minutes = 0;
    let known = false;
    let done = 0;
    for (const l of lessons) {
      const m = lessonMinutes(l);
      if (m != null) { minutes += m; known = true; }
      if (isDone(lessonEvidence(l.id, mastery))) done += 1;
    }
    const firstVideo = lessons.find((l) => l.type === 'video' && l.videoUrl) ?? lessons.find((l) => l.videoUrl);
    out.push({
      index,
      id: String(unit?.id ?? `unit-${index}`),
      title: String(unit?.title ?? ''),
      lessonCount: lessons.length,
      minutes: known ? minutes : null,
      done,
      pct: Math.min(100, Math.round((done / lessons.length) * 100)),
      started: done > 0,
      thumbs: withCover(index === 0 ? courseCoverFor(course) : null, firstVideo ? chapterStills(firstVideo) : []),
    });
  });
  return out;
}

/** Where a lesson sits inside its own chapter: "Leçon 3 sur 5". */
export function positionInChapter(course: any, lessonId: string | null | undefined): { n: number; of: number } | null {
  if (!lessonId) return null;
  for (const unit of Array.isArray(course?.modules) ? course.modules : []) {
    const lessons = unitLessons(unit);
    const i = lessons.findIndex((l) => l.id === lessonId);
    if (i >= 0) return { n: i + 1, of: lessons.length };
  }
  return null;
}

/** Outline row state, in one place so both outlines agree. */
export type RowState = 'done' | 'current' | 'todo';
export function rowState(lessonId: string, currentId: string | null | undefined, mastery: ProgressMap): RowState {
  if (currentId && lessonId === currentId) return 'current';
  return isDone(lessonEvidence(lessonId, mastery)) ? 'done' : 'todo';
}

/**
 * The catalogue's auto-generated lesson blurb ("Leçon « X » du cours de
 * Chimie NS1 (EdLight) — chapitre…") is dev voice, not content: hide it.
 */
export function isGeneratedLessonBlurb(text: string | null | undefined): boolean {
  const s = String(text ?? '').trim();
  if (!s) return true;
  return /^le[çc]on\s+«.*»\s+du\s+cours\s+de/i.test(s);
}

/** Courses that are announced but not open, as one honest line ("Physique et SVT"). */
export function joinNames(names: string[], isCreole: boolean): string {
  const list = Array.from(new Set(names.filter(Boolean)));
  if (list.length <= 1) return list[0] ?? '';
  const and = isCreole ? 'ak' : 'et';
  return `${list.slice(0, -1).join(', ')} ${and} ${list[list.length - 1]}`;
}

/** "5 leçons · 52 min" / "5 leson · 52 min". */
export function chapterMeta(card: Pick<ChapterCard, 'lessonCount' | 'minutes'>, isCreole: boolean): string {
  const lessons = isCreole ? `${card.lessonCount} leson` : `${card.lessonCount} leçon${card.lessonCount > 1 ? 's' : ''}`;
  const dur = formatMinutes(card.minutes);
  return dur ? `${lessons} · ${dur}` : lessons;
}
