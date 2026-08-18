/**
 * Mastery model — the thing the Cours surfaces are actually *about*.
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

/** Palette role per level. Takes the themed palette so dark mode comes free. */
export function masteryColor(level: MasteryLevel, colors: any): string {
  switch (level) {
    case 'none': return colors.faint;
    case 'seen': return colors.muted;
    case 'familiar': return colors.warn;
    case 'proficient': return colors.azure;
    case 'mastered': return colors.success;
  }
}
