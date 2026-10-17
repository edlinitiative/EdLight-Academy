/**
 * homeJourney — the pure decisions behind the signed-in Home (LJ-01, LJ-02,
 * LJ-10 in docs/design/2026-10-17-learning-journey-prd.md).
 *
 * Everything here is state in → state out, so every student situation the
 * PRD names (returning, interrupted exam, new account, class not covered,
 * stale link, caught up) is a unit-testable branch rather than a JSX maze.
 *
 * Sources, and only these:
 *   - catalogue     course.modules[].lessons[] (ids, titles, units)
 *   - completion    users/{uid}/progress/{courseId}.completedLessons + watchedVideos
 *   - mastery       users/{uid}/mastery/lessons (the ONE doc shared with mobile —
 *                   never derived from the progress doc; see hooks/useMastery)
 *   - last place    store.lastActivity (cleared on logout and on exam submit)
 *   - position      CourseDetail's per-lesson localStorage resume point
 *
 * Nothing is inferred beyond them: no weakness, no streak, no blended score.
 */
import type { ProgressMap } from '../../../../shared/mastery';
import type { Evidence } from '../../../utils/learningJourney';

/** Store grade codes the video catalogue covers (same mapping as pages/Courses.tsx). */
export const GRADE_TO_LEVEL: Record<string, string> = {
  NS1: 'NSI', NS2: 'NSII', NS3: 'NSIII', NS4: 'NSIV',
};
export const COVERED_LEVELS = ['NSI', 'NSII', 'NSIII', 'NSIV'];
const SUBJECT_ORDER = ['MATH', 'PHYS', 'CHEM', 'ECON'];

export type LessonRef = {
  course: any;
  unit: any;
  unitIndex: number;
  lesson: any;
  lessonIndex: number;
};

/** Every lesson of a course in reading order, with its unit. */
export function flatLessons(course: any): LessonRef[] {
  const out: LessonRef[] = [];
  const units = Array.isArray(course?.modules) ? course.modules : [];
  units.forEach((unit: any, unitIndex: number) => {
    (unit?.lessons || []).forEach((lesson: any, lessonIndex: number) => {
      if (lesson?.id) out.push({ course, unit, unitIndex, lesson, lessonIndex });
    });
  });
  return out;
}

/** The per-course facts a progress doc can prove. */
export function progressSets(progressDoc: any) {
  const completed = new Set<string>(Array.isArray(progressDoc?.completedLessons) ? progressDoc.completedLessons : []);
  const watched = new Set<string>(Object.keys(progressDoc?.watchedVideos || {}));
  return { completed, watched };
}

/**
 * The strongest evidence a lesson has, using the shared EVIDENCE vocabulary.
 * `mastered` needs the chapter test (masteredAt); a practice score is
 * `practised`; the completion flag is `completed`; a recorded watch is
 * `opened`. A finished video is never more than `completed`.
 */
export function lessonEvidence(
  lessonId: string,
  sets: { completed: Set<string>; watched: Set<string> },
  mastery: ProgressMap,
): Evidence | null {
  const rec = mastery?.[lessonId];
  if (rec?.masteredAt) return 'mastered';
  if (typeof rec?.bestPct === 'number') return 'practised';
  if (sets.completed.has(lessonId) || rec?.completed) return 'completed';
  if (sets.watched.has(lessonId)) return 'opened';
  return null;
}

const isDone = (e: Evidence | null) => e === 'completed' || e === 'practised' || e === 'mastered';

export type CourseSummary = {
  courseId: string;
  total: number;
  /** Lessons with any evidence at all. */
  opened: number;
  /** Lessons whose completion is recorded (the "Terminée" flag). */
  completed: number;
  /** Lessons with a recorded practice score. */
  practised: number;
  /** Lessons confirmed by a chapter test. */
  mastered: number;
};

/**
 * Independent facts per course, each over the same real denominator. They are
 * NOT summed or averaged: "6 terminées · 2 maîtrisées" are two statements.
 */
export function summarizeCourse(course: any, progressDoc: any, mastery: ProgressMap): CourseSummary {
  const lessons = flatLessons(course);
  const sets = progressSets(progressDoc);
  const s: CourseSummary = { courseId: String(course?.id || ''), total: lessons.length, opened: 0, completed: 0, practised: 0, mastered: 0 };
  for (const { lesson } of lessons) {
    const rec = mastery?.[lesson.id];
    const done = sets.completed.has(lesson.id) || !!rec?.completed;
    const practised = typeof rec?.bestPct === 'number';
    const mastered = !!rec?.masteredAt;
    if (done || practised || mastered || sets.watched.has(lesson.id)) s.opened += 1;
    if (done) s.completed += 1;
    if (practised) s.practised += 1;
    if (mastered) s.mastered += 1;
  }
  return s;
}

/** `/courses/chem-ns1?lesson=CHEM-NSI-U1-L2` → its two ids. */
export function parseLessonPath(path?: string | null): { courseId: string; lessonId: string } | null {
  if (!path) return null;
  const m = /^\/courses\/([^/?#]+)(?:\?(.*))?$/.exec(path);
  if (!m) return null;
  let lessonId = '';
  try { lessonId = new URLSearchParams(m[2] || '').get('lesson') || ''; } catch { lessonId = ''; }
  return { courseId: decodeURIComponent(m[1]), lessonId };
}

export function lessonHref(courseId: string, lessonId: string) {
  return `/courses/${courseId}?lesson=${encodeURIComponent(lessonId)}`;
}

// ── Playback position ───────────────────────────────────────────────────────
// Read-only mirror of CourseDetail's resume point (same key, same thresholds),
// so Home promises a position only where the lesson will actually restore it.
const VIDEO_POS_KEY = 'edlight-video-positions';
export function readResumeSeconds(courseId: string, lessonId: string): number {
  try {
    const all = JSON.parse(localStorage.getItem(VIDEO_POS_KEY) || '{}') || {};
    const rec = all[`${courseId}:${lessonId}`];
    if (!rec || !Number.isFinite(rec.t) || rec.t < 15) return 0;
    if (rec.d && rec.t > rec.d * 0.95) return 0;
    return Math.floor(rec.t);
  } catch {
    return 0;
  }
}
export function formatClock(total: number) {
  const s = Math.max(0, Math.floor(Number(total) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ── The one continuation ────────────────────────────────────────────────────
export type Continuation =
  /** An exam left unfinished (ExamTake records it while active, clears it on submit). */
  | { kind: 'exam'; title: string; path: string }
  | (LessonRef & {
      kind: 'lesson';
      /** resume: the lesson they were in · next: what follows a finished one ·
       *  recent: next lesson of the course they last worked in · start: a
       *  first lesson for their class (or a labelled other-level one). */
      reason: 'resume' | 'next' | 'recent' | 'start';
      evidence: Evidence | null;
      /** Seconds the lesson will really resume at (0 = none promised). */
      positionSec: number;
      /** The lesson is from a level that is not the student's class. */
      otherLevel: boolean;
      /** The last lesson they opened no longer exists in the catalogue. */
      staleLink: boolean;
    })
  /** The student's class has no video courses (7e–9e, after the Bac). */
  | { kind: 'uncovered'; grade: string; staleLink: boolean }
  /** No class chosen yet: offer the choice (skippable), with a real first lesson. */
  | { kind: 'choose-class'; suggestion: LessonRef | null; staleLink: boolean }
  /** A covered class whose courses are not published yet. */
  | { kind: 'level-empty'; level: string; staleLink: boolean }
  /** Every lesson of their class is recorded as finished. */
  | { kind: 'caught-up'; level: string | null; staleLink: boolean };

export type ContinuationInput = {
  courses: any[];
  courseLevel: (c: any) => string;
  lastActivity?: { type: string; path: string; title: string } | null;
  progressByCourseId: Map<string, any>;
  mastery: ProgressMap;
  grade?: string | null;
  /** True once the student skipped the class question on Home. */
  classSkipped?: boolean;
  readPosition?: (courseId: string, lessonId: string) => number;
};

const bySubject = (a: any, b: any) => {
  const ia = SUBJECT_ORDER.indexOf(a?.subject); const ib = SUBJECT_ORDER.indexOf(b?.subject);
  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
};

function toMillis(v: any): number {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function resolveContinuation(input: ContinuationInput): Continuation {
  const { courseLevel, lastActivity, progressByCourseId, mastery, grade } = input;
  const readPosition = input.readPosition || readResumeSeconds;
  const live = (input.courses || []).filter((c) => c && !c.comingSoon);
  const myLevel = grade ? GRADE_TO_LEVEL[grade] : undefined;
  const evidenceIn = (course: any) => {
    const sets = progressSets(progressByCourseId.get(course.id));
    return (id: string) => lessonEvidence(id, sets, mastery);
  };
  const lessonResult = (ref: LessonRef, reason: 'resume' | 'next' | 'recent' | 'start', staleLink: boolean, positionSec = 0) => ({
    ...ref,
    kind: 'lesson' as const,
    reason,
    evidence: evidenceIn(ref.course)(ref.lesson.id),
    positionSec,
    otherLevel: !!myLevel && courseLevel(ref.course) !== myLevel,
    staleLink,
  });
  /** First unfinished lesson of a course, starting after `afterIndex`, wrapping. */
  const nextUnfinished = (course: any, afterIndex = -1): LessonRef | null => {
    const all = flatLessons(course);
    const ev = evidenceIn(course);
    const order = [...all.slice(afterIndex + 1), ...all.slice(0, afterIndex + 1)];
    return order.find((r) => !isDone(ev(r.lesson.id))) || null;
  };

  // 1. An unfinished exam stays first — the existing rule (ExamTake clears it on submit).
  if (lastActivity?.type === 'exam' && lastActivity.path && lastActivity.title) {
    return { kind: 'exam', title: lastActivity.title, path: lastActivity.path };
  }

  // 2. The lesson they were in, validated against the current catalogue.
  let staleLink = false;
  if (lastActivity?.type === 'lesson') {
    const ids = parseLessonPath(lastActivity.path);
    const course = ids ? live.find((c) => c.id === ids.courseId) : null;
    if (ids && !course) staleLink = true;
    if (course) {
      const all = flatLessons(course);
      const idx = ids!.lessonId ? all.findIndex((r) => r.lesson.id === ids!.lessonId) : -1;
      if (ids!.lessonId && idx === -1) staleLink = true;
      if (idx >= 0) {
        const ref = all[idx];
        if (!isDone(evidenceIn(course)(ref.lesson.id))) {
          return lessonResult(ref, 'resume', false, readPosition(course.id, ref.lesson.id));
        }
        const next = nextUnfinished(course, idx);
        if (next) return lessonResult(next, 'next', false);
      } else {
        const next = nextUnfinished(course);
        if (next) return lessonResult(next, 'recent', staleLink);
      }
    }
  }

  // 3. The course they last worked in (Firestore progress), at its next lesson.
  const recent = live
    .filter((c) => progressByCourseId.has(c.id))
    .map((c) => ({ c, at: toMillis(progressByCourseId.get(c.id)?.lastAccessedAt) }))
    .sort((a, b) => b.at - a.at);
  for (const { c } of recent) {
    const next = nextUnfinished(c);
    const touched = flatLessons(c).some((r) => evidenceIn(c)(r.lesson.id));
    if (next && touched) return lessonResult(next, 'recent', staleLink);
  }

  // 4. Nothing to resume: a real first lesson, honest about class coverage.
  if (!grade && !input.classSkipped) {
    const first = live.filter((c) => courseLevel(c) === 'NSI').sort(bySubject)[0]
      || [...live].sort(bySubject)[0];
    return { kind: 'choose-class', suggestion: first ? flatLessons(first)[0] || null : null, staleLink };
  }
  if (grade && !myLevel) return { kind: 'uncovered', grade, staleLink };

  const pool = myLevel ? live.filter((c) => courseLevel(c) === myLevel) : live;
  if (myLevel && pool.length === 0) return { kind: 'level-empty', level: myLevel, staleLink };
  const ordered = [...pool].sort((a, b) => bySubject(a, b)
    || COVERED_LEVELS.indexOf(courseLevel(a)) - COVERED_LEVELS.indexOf(courseLevel(b)));
  for (const c of ordered) {
    const next = nextUnfinished(c);
    if (next) return lessonResult(next, 'start', staleLink);
  }
  return { kind: 'caught-up', level: myLevel || null, staleLink };
}

// ── Confirmed change since the last visit (LJ-10) ───────────────────────────
// A per-account, per-device snapshot of the summary counts, so the summary can
// say "+1 terminée depuis ta dernière visite" and animate from the previous
// value — never from zero, and never on a revisit with nothing new.
const SNAP_KEY = 'edlight-home-progress-snapshot';
export type Snapshot = Record<string, { completed: number; practised: number; mastered: number }>;

export function readSnapshot(uid: string): Snapshot | null {
  try {
    const all = JSON.parse(localStorage.getItem(SNAP_KEY) || '{}') || {};
    return all[uid] && typeof all[uid] === 'object' ? all[uid] : null;
  } catch {
    return null;
  }
}
export function writeSnapshot(uid: string, snap: Snapshot) {
  try {
    const all = JSON.parse(localStorage.getItem(SNAP_KEY) || '{}') || {};
    // One account per device is the norm; keep at most a few.
    const keys = Object.keys(all).filter((k) => k !== uid).slice(-3);
    const next: Record<string, Snapshot> = {};
    for (const k of keys) next[k] = all[k];
    next[uid] = snap;
    localStorage.setItem(SNAP_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — the summary simply shows no change note */
  }
}
