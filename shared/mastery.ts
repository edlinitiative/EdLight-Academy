/**
 * Mastery model — the thing the Cours surfaces are actually *about*.
 *
 * SHARED: this file is the single definition used by BOTH the web app and the
 * mobile app (mobile/src/utils/mastery.ts re-exports it). Keep it pure — no
 * React, no palette, no i18n framework — so neither platform can drift.
 *
 * Before this, the only thing the UI could say about a student was "3 / 33
 * leçons", a number that moves when you press play. It measures consumption,
 * not learning, so nothing on the screen was ever earned.
 *
 * A lesson now carries one of five states. Four of them have to be earned, and
 * each one costs something the previous one didn't:
 *
 *   none       0    nothing yet
 *   seen      25    the video was watched (or exercises attempted below 70%)
 *   familiar  50    ≥ 70% on the lesson's exercises
 *   proficient 80   100% on the lesson's exercises
 *   mastered  100   proved again on the CHAPTER TEST, days later, mixed in
 *                   with every other lesson of the unit
 *
 * The point of the last step is that it can't be reached by grinding one
 * exercise set: the chapter test draws from the whole unit, so "maîtrisé" means
 * the student still knew it when it wasn't the only thing in front of them.
 *
 * Unit and course mastery are the average of their lessons' points, which makes
 * a unit bar mean "how well do I know this chapter" rather than "how many
 * videos are left".
 *
 * Everything here is pure: state in → state out. The persistence lives in the
 * store, the rendering in the screens.
 */

export type MasteryLevel = 'none' | 'seen' | 'familiar' | 'proficient' | 'mastered';

/** Points per level, out of 100 per lesson. */
export const MASTERY_POINTS: Record<MasteryLevel, number> = {
  none: 0,
  seen: 25,
  familiar: 50,
  proficient: 80,
  mastered: 100,
};

/** Low → high. Used for promotion and for comparing two levels. */
export const MASTERY_ORDER: MasteryLevel[] = ['none', 'seen', 'familiar', 'proficient', 'mastered'];

/** Score needed on a lesson's exercises to count as `familiar`. */
export const FAMILIAR_THRESHOLD = 70;

/**
 * The per-lesson record kept in the store under `progress[lessonId]`.
 * `completed` predates this model (it's the "Marquer terminé" flag) and is
 * still what earns `seen`, so existing students keep the progress they had.
 */
export type LessonProgress = {
  /** Video watched / manually marked done. */
  completed?: boolean;
  /** Best percentage ever scored on this lesson's exercises (0–100). */
  bestPct?: number;
  /** Epoch ms when the chapter test confirmed this lesson. */
  masteredAt?: number;
  /** Epoch ms of the last promotion, so the UI can celebrate a fresh level-up. */
  levelUpAt?: number;
};

export type ProgressMap = Record<string, LessonProgress | undefined>;

/** The level a single lesson currently sits at. */
export function lessonMastery(p?: LessonProgress | null): MasteryLevel {
  if (!p) return 'none';
  if (p.masteredAt) return 'mastered';
  const best = typeof p.bestPct === 'number' ? p.bestPct : -1;
  if (best >= 100) return 'proficient';
  if (best >= FAMILIAR_THRESHOLD) return 'familiar';
  if (p.completed || best >= 0) return 'seen';
  return 'none';
}

export function lessonPoints(p?: LessonProgress | null): number {
  return MASTERY_POINTS[lessonMastery(p)];
}

/** Is `a` at least as far along as `b`? */
export function atLeast(a: MasteryLevel, b: MasteryLevel): boolean {
  return MASTERY_ORDER.indexOf(a) >= MASTERY_ORDER.indexOf(b);
}

/** The next level up, or the same level when already at the top. */
export function nextLevel(level: MasteryLevel): MasteryLevel {
  const i = MASTERY_ORDER.indexOf(level);
  return MASTERY_ORDER[Math.min(i + 1, MASTERY_ORDER.length - 1)];
}

export type MasterySummary = {
  /** 0–100. Average of the lessons' points — NOT a count of finished videos. */
  points: number;
  /** The level this group as a whole has reached. */
  level: MasteryLevel;
  /** How many lessons sit at each level. */
  counts: Record<MasteryLevel, number>;
  total: number;
  /** Lessons at `mastered`. The headline number for a unit. */
  mastered: number;
  /** Lessons that have been touched at all. */
  started: number;
};

const emptyCounts = (): Record<MasteryLevel, number> => ({
  none: 0, seen: 0, familiar: 0, proficient: 0, mastered: 0,
});

/**
 * Aggregate a set of lessons. A group's own level is the highest level ALL its
 * lessons have reached — a chapter is only "maîtrisé" when nothing in it is
 * still weak, which is what makes a green chapter worth something.
 */
export function summarize(lessonIds: string[], progress: ProgressMap): MasterySummary {
  const counts = emptyCounts();
  let sum = 0;
  for (const id of lessonIds) {
    const level = lessonMastery(progress[id]);
    counts[level] += 1;
    sum += MASTERY_POINTS[level];
  }
  const total = lessonIds.length;
  if (total === 0) {
    return { points: 0, level: 'none', counts, total: 0, mastered: 0, started: 0 };
  }
  // Lowest level present = the group's level (a chain is as strong as its weakest link).
  let level: MasteryLevel = 'mastered';
  for (const l of MASTERY_ORDER) {
    if (counts[l] > 0) { level = l; break; }
  }
  return {
    points: Math.round(sum / total),
    level,
    counts,
    total,
    mastered: counts.mastered,
    started: total - counts.none,
  };
}

/** Every lesson id in a course, in order. Courses store units under `modules`. */
export function courseLessonIds(course: any): string[] {
  const units = Array.isArray(course?.modules) ? course.modules : [];
  return units.flatMap((u: any) => (Array.isArray(u?.lessons) ? u.lessons : []).map((l: any) => l?.id).filter(Boolean));
}

// ─── Transitions ──────────────────────────────────────────────────────────────

/**
 * Record an exercise score. Only ever improves a lesson: a bad day can't undo
 * what was already proved. Returns the next record, or `null` when nothing
 * changed (so callers can skip a write).
 */
export function applyExerciseScore(
  prev: LessonProgress | undefined,
  pct: number,
  now: number,
): LessonProgress | null {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const before = lessonMastery(prev);
  const prevBest = prev?.bestPct;
  const bestPct = Math.max(prevBest ?? 0, clamped);
  // A first attempt always writes (even a 0, which earns `seen`); a later one
  // only when it beats the record.
  if (prevBest != null && bestPct === prevBest) return null;
  const next: LessonProgress = { ...prev, bestPct };
  const after = lessonMastery(next);
  if (after !== before) next.levelUpAt = now;
  return next;
}

/**
 * Promote a lesson after the chapter test. One step at a time, and only when
 * every question drawn from that lesson was answered correctly — the same rule
 * that makes the top level mean something.
 *
 * A miss never demotes. Khan Academy does drop a skill back down; here the
 * audience is students studying alone on a phone, and watching a chapter you
 * already earned turn red is the kind of thing that closes the app for good.
 */
export function applyChapterTestResult(
  prev: LessonProgress | undefined,
  allCorrect: boolean,
  now: number,
): LessonProgress | null {
  if (!allCorrect) return null;
  const before = lessonMastery(prev);
  if (before === 'mastered') return null;
  const target = nextLevel(before);
  const next: LessonProgress = { ...prev, levelUpAt: now };
  // Lift the underlying record to the floor of the target level, so the level
  // sticks when it's recomputed from scratch.
  switch (target) {
    case 'mastered': next.masteredAt = now; break;
    case 'proficient': next.bestPct = Math.max(next.bestPct ?? 0, 100); break;
    case 'familiar': next.bestPct = Math.max(next.bestPct ?? 0, FAMILIAR_THRESHOLD); break;
    case 'seen': next.completed = true; break;
    default: break;
  }
  return next;
}

// ─── Copy ─────────────────────────────────────────────────────────────────────

const LABELS: Record<MasteryLevel, { fr: string; ht: string }> = {
  none: { fr: 'À découvrir', ht: 'Pou dekouvri' },
  seen: { fr: 'Vu', ht: 'Vi' },
  familiar: { fr: 'Familier', ht: 'Fanmilye' },
  proficient: { fr: 'Solide', ht: 'Solid' },
  mastered: { fr: 'Maîtrisé', ht: 'Metrize' },
};

export function masteryLabel(level: MasteryLevel, isCreole?: boolean): string {
  return isCreole ? LABELS[level].ht : LABELS[level].fr;
}

/** What to do next to level up. `null` at the top — there is nothing left to ask. */
export function masteryNextStep(level: MasteryLevel, isCreole?: boolean): string | null {
  switch (level) {
    case 'none': return isCreole ? 'Gade leson an' : 'Regarde la leçon';
    case 'seen': return isCreole ? 'Fè egzèsis yo' : 'Fais les exercices';
    case 'familiar': return isCreole ? 'Vize 100% nan egzèsis yo' : 'Vise 100% aux exercices';
    case 'proficient': return isCreole ? 'Pase tès chapit la' : 'Passe le test du chapitre';
    case 'mastered': return null;
  }
}

/**
 * The palette ROLE a level should be painted in. Deliberately not a colour:
 * web resolves this to a CSS custom property and mobile to its theme palette,
 * so this file stays free of either platform's colour system.
 */
export type MasteryRole = 'faint' | 'muted' | 'warning' | 'accent' | 'success';

export function masteryRole(level: MasteryLevel): MasteryRole {
  switch (level) {
    case 'none': return 'faint';
    case 'seen': return 'muted';
    case 'familiar': return 'warning';
    case 'proficient': return 'accent';
    case 'mastered': return 'success';
  }
}

/**
 * Attribute a finished chapter test back to the lessons it drew from.
 *
 * A chapter test mixes questions from a whole unit, so the result has to be
 * split per lesson before it can promote anything. `outcomes` is keyed by the
 * question's index (not its id) because a question can be answered several
 * times within one sitting — the LAST outcome for an index is the one that
 * counts. A lesson passes only if EVERY question drawn from it was correct;
 * an unanswered question counts as not correct, so abandoning a test halfway
 * can't promote the lessons you never reached.
 *
 * Questions whose lesson isn't in `lessonIdByLessonNo` are ignored rather than
 * failing the whole test: a unit's bank can hold rows for lessons that aren't
 * published in the course yet.
 */
export function attributeChapterTest(
  items: Array<{ lessonNo?: number | string | null } | null | undefined>,
  outcomes: Record<number, boolean>,
  lessonIdByLessonNo: Record<string, string>,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  items.forEach((item, i) => {
    const lessonNo = item?.lessonNo;
    if (lessonNo === null || lessonNo === undefined || lessonNo === '') return;
    const lessonId = lessonIdByLessonNo?.[String(lessonNo)];
    if (!lessonId) return;
    const wasCorrect = outcomes?.[i] === true;
    out[lessonId] = (out[lessonId] ?? true) && wasCorrect;
  });
  return out;
}

/**
 * Build the `lesson_no -> lessonId` map a chapter test needs, from a unit's
 * lesson list. The quiz bank labels each question with the lesson NUMBER it
 * came from, while progress is stored per lesson ID, so a test can't credit
 * anything without this bridge.
 *
 * The test lesson itself is skipped — a chapter test can't be the thing it
 * promotes — and so is any lesson without a usable number, which simply means
 * no question can be attributed to it.
 *
 * Numbers are read by pulling the FIRST run of digits, which is how the quiz
 * bank derives the `lessonNo` on each question. Both sides have to agree or
 * nothing matches: '01' and 'L2' are real values in the data, and Number()
 * would give 1 for one and NaN for the other.
 *
 * `lesson_no` is only populated on lessons that matched a video row during
 * enrichment, so it falls back to the `-L<n>` suffix of the lesson id (ids look
 * like CHEM-NSI-U1-L2), the same fallback the data layer itself uses. Without
 * it, a course whose videos haven't been enriched yields an empty map and
 * silently promotes nothing.
 */
export function chapterTestLessonMap(lessons: any[]): Record<string, string> {
  const out: Record<string, string> = {};
  const firstInt = (v: unknown): number | null => {
    // Deliberately not Number(): '' and null both become 0, which would file a
    // numberless lesson under lesson 0 and let a question credit the wrong one.
    const m = String(v ?? '').match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
  };
  for (const lesson of Array.isArray(lessons) ? lessons : []) {
    if (!lesson?.id || lesson.type === 'quiz') continue;
    const n = firstInt(lesson.lesson_no) ?? firstInt(String(lesson.id).match(/-L(\d+)$/i)?.[1]);
    if (n === null) continue;
    // First lesson wins: a duplicated number is bad data, and crediting the
    // later one would silently move mastery to the wrong lesson.
    if (out[String(n)] === undefined) out[String(n)] = lesson.id;
  }
  return out;
}

/**
 * Is a unit's chapter test worth offering yet?
 *
 * The test is the only route to `mastered`, and it draws from the whole unit —
 * so offering it to someone who hasn't done a single lesson's exercises is
 * setting them up to fail a test that then can't promote anything. It opens
 * once ANY lesson in the unit has been practised (i.e. reached `familiar` or
 * better), which is also the first moment the test has something to confirm.
 *
 * Deliberately not "every lesson must be proficient": that would gate the top
 * rung behind finishing a whole chapter perfectly, and a student who knows
 * three of five lessons well should be able to bank those three.
 */
export function chapterTestReady(summary: MasterySummary): boolean {
  return summary.counts.familiar > 0
    || summary.counts.proficient > 0
    || summary.counts.mastered > 0;
}
