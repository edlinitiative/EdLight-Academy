/**
 * studyPlanTasks — the pure rules behind a study plan's task list, shared by
 * the web (src/pages/StudyPlan.tsx + src/hooks/useStudyPlan.ts) and the app
 * (mobile/src/services/studyPlanService.ts + StudyPlanScreen).
 *
 * Owner feedback (TestFlight build 61) this answers:
 *   • "SVT · Juin 2016" three times in a row: several different papers share
 *     one composed title, and the selector happily took three from one year.
 *     → selectExamsForPlan spreads picks across years and drops papers set for
 *       another filière; planTaskLabels tells same-titled papers apart.
 *   • A brand-new plan put 43 tasks on day one and flagged them "En retard"
 *     the next morning: every task was created with nextReviewMs = now.
 *     → schedulePlanTasks spreads untouched tasks over the plan's weeks within
 *       its minutes-per-day budget.
 *   • Tapping a task opened a generic page (Chimie level picker) instead of
 *     the task. → planTaskRoute names the exact destination per task type;
 *       each platform only translates it into its own navigation.
 *
 * No platform imports here: callers pass in whatever catalog lookups they have.
 */
import { normalizeSubject } from './examUtils';

export const DAY_MS = 86_400_000;

/** Bumped when the scheduling rules change, so stored plans can be re-spread once. */
export const PLAN_SCHEDULE_VERSION = 2;

// ─── Small helpers ──────────────────────────────────────────────────────────

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Midnight `days` calendar days after `dayStartMs` (DST-safe). */
export function addLocalDays(dayStartMs: number, days: number): number {
  const d = new Date(dayStartMs);
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** The identity of a task inside one plan. */
export function planTaskKey(task: any): string {
  if (!task) return '';
  if ((task.type || 'exam') === 'exam' && task.examId) return `exam:${task.examId}`;
  if (task.taskId) return `${task.type || 'task'}:${task.taskId}`;
  return '';
}

/** First occurrence wins; tasks with no identity are kept as they are. */
export function dedupePlanTasks<T>(tasks: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const t of tasks || []) {
    const k = planTaskKey(t);
    if (k) {
      if (seen.has(k)) continue;
      seen.add(k);
    }
    out.push(t);
  }
  return out;
}

// ─── Exam selection ─────────────────────────────────────────────────────────

const TRACK_ALIASES: Record<string, string> = {
  LA: 'LET', LLA: 'LET', LET: 'LET', LETTRES: 'LET',
  ART: 'ARTS', ARTS: 'ARTS',
  SVT: 'SVT', SMP: 'SMP', SES: 'SES', ES: 'SES',
};

/**
 * Is this paper set for the student's filière? Papers tagged ALL, untagged, or
 * tagged with nothing recognisable are for everyone; otherwise one of the tags
 * must be the track. ("SVT · SES, SMP · Juillet 2019" is not an SVT paper.)
 */
export function examFitsTrack(exam: any, track?: string | null): boolean {
  if (!track) return true;
  const want = TRACK_ALIASES[String(track).toUpperCase()] || String(track).toUpperCase();
  const raw: string[] = Array.isArray(exam?.tracks) ? exam.tracks : [];
  const codes = raw
    .flatMap((t) => String(t || '').toUpperCase().split(/[^A-Z]+/))
    .filter(Boolean);
  if (codes.length === 0 || codes.includes('ALL')) return true;
  const known = codes.map((c) => TRACK_ALIASES[c]).filter(Boolean);
  if (known.length === 0) return true;
  return known.includes(want);
}

/**
 * Balanced exam subset, weighted by coefficient. Within a subject, picks go
 * round-robin across years (newest first, easiest paper of each year first),
 * so a plan never opens with three papers from the same session. Papers set
 * for another filière are left out unless the subject would otherwise have
 * none.
 */
export function selectExamsForPlan(
  exams: any[],
  coefficients: Record<string, number>,
  maxCount = 40,
  track?: string | null,
): any[] {
  const bySubject: Record<string, any[]> = {};
  const seenIds = new Set<string>();
  for (const e of exams || []) {
    const id = String(e?.exam_id || e?.id || '');
    if (id) {
      if (seenIds.has(id)) continue;
      seenIds.add(id);
    }
    const s = normalizeSubject(e?.subject || '');
    (bySubject[s] = bySubject[s] || []).push(e);
  }

  const totalCoeff = Object.values(coefficients || {}).reduce((s, v) => s + Number(v || 0), 0) || 1;
  const selected: any[] = [];

  for (const [subj, all] of Object.entries(bySubject)) {
    const fitting = all.filter((e) => examFitsTrack(e, track));
    const pool = fitting.length > 0 ? fitting : all;
    const coeff = Number(coefficients?.[subj] || 1);
    const slots = Math.max(1, Math.round((coeff / totalCoeff) * maxCount));

    const byYear = new Map<string, any[]>();
    for (const e of pool) {
      const y = String(e?.year || '');
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y)!.push(e);
    }
    const years = [...byYear.keys()].sort((a, b) => (Number(b) || 0) - (Number(a) || 0));
    for (const y of years) byYear.get(y)!.sort((a, b) => (a?.difficulty || 3) - (b?.difficulty || 3));

    const picked: any[] = [];
    let round = 0;
    while (picked.length < slots) {
      let took = false;
      for (const y of years) {
        const e = byYear.get(y)![round];
        if (!e) continue;
        picked.push(e);
        took = true;
        if (picked.length >= slots) break;
      }
      if (!took) break;
      round += 1;
    }
    selected.push(...picked);
  }

  if (selected.length > maxCount) {
    selected.sort(
      (a, b) =>
        (coefficients?.[normalizeSubject(b?.subject)] || 1) -
        (coefficients?.[normalizeSubject(a?.subject)] || 1),
    );
    return selected.slice(0, maxCount);
  }
  return selected;
}

// ─── Titles ─────────────────────────────────────────────────────────────────

function cleanTopic(t: any): string {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  if (s.length < 2 || s.length > 40) return '';
  if (/^(partie|section|exercice|question|texte|document)\b/i.test(s)) return '';
  if (/^[\dIVX.\s)-]+$/i.test(s)) return '';
  return s;
}

/**
 * Display labels for a list of tasks. When two or more tasks would show the
 * same label, each gets a distinguishing tail: its first topic that the others
 * don't share, else "Sujet 1", "Sujet 2"… in list order. Keyed by planTaskKey
 * (falls back to the index for keyless tasks).
 */
export function planTaskLabels(
  tasks: any[],
  baseOf: (task: any) => string,
  opts: { subjectWord?: string } = {},
): Map<string, string> {
  const word = opts.subjectWord || 'Sujet';
  const keyOf = (t: any, i: number) => planTaskKey(t) || `#${i}`;
  const out = new Map<string, string>();
  const groups = new Map<string, { task: any; key: string }[]>();
  (tasks || []).forEach((task, i) => {
    const base = String(baseOf(task) || '').trim();
    const key = keyOf(task, i);
    out.set(key, base);
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base)!.push({ task, key });
  });

  for (const [base, members] of groups) {
    if (members.length < 2) continue;
    const lowerBase = base.toLowerCase();
    const topicLists = members.map(({ task }) =>
      (Array.isArray(task?.topics) ? task.topics : [])
        .map(cleanTopic)
        .filter((t: string) => t && !lowerBase.includes(t.toLowerCase())),
    );
    // A topic distinguishes a task only when no other member lists it too.
    const counts = new Map<string, number>();
    for (const list of topicLists as string[][]) {
      for (const t of new Set(list.map((x) => x.toLowerCase()))) counts.set(t, (counts.get(t) || 0) + 1);
    }
    const tails = topicLists.map((list) => list.find((t: string) => counts.get(t.toLowerCase()) === 1) || '');
    const tailsUnique = new Set(tails.filter(Boolean)).size === tails.filter(Boolean).length;
    let n = 0;
    members.forEach(({ key }, i) => {
      n += 1;
      const tail = tailsUnique && tails[i] ? tails[i] : `${word} ${n}`;
      out.set(key, base ? `${base} · ${tail}` : tail);
    });
  }
  return out;
}

/** Plan titles are written by a model or older code; keep the owner's house style (no dashes as punctuation). */
export function cleanPlanTitle(title: any): string {
  return String(title || '')
    .replace(/\s*[—–]\s*/g, ' · ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Same rule for running text (description, tips): a dash aside becomes a comma. */
export function cleanPlanText(text: any): string {
  return String(text || '')
    .replace(/\s+[—–]\s+/g, ', ')
    .replace(/[—–]/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ─── Scheduling ─────────────────────────────────────────────────────────────

/** Rough minutes a task takes, for packing days against the daily budget. */
export function estimateTaskMinutes(task: any): number {
  const type = task?.type || 'exam';
  if (type === 'video') return clamp(Number(task?.duration) || 15, 5, 60);
  if (type === 'practice') return clamp(Math.round((Number(task?.questionCount) || 10) * 1.5), 10, 30);
  return clamp(Number(task?.durationMinutes) || 90, 30, 240);
}

/** A task the student has never touched: its date is ours to choose. */
export function isUntouchedTask(task: any): boolean {
  return task?.status !== 'mastered'
    && !(Array.isArray(task?.history) && task.history.length > 0)
    && !task?.lastPracticedMs;
}

/** One subject after another, keeping each subject's own order. */
function interleaveBySubject<T extends { subject?: string }>(tasks: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const t of tasks) {
    const s = String(t.subject || '');
    if (!groups.has(s)) groups.set(s, []);
    groups.get(s)!.push(t);
  }
  const lists = [...groups.values()];
  const out: T[] = [];
  for (let i = 0; out.length < tasks.length; i += 1) {
    for (const l of lists) if (l[i]) out.push(l[i]);
  }
  return out;
}

/**
 * Give every untouched task a day. Days are packed against `dailyMinutes`
 * (always at least one task a day), subjects take turns, and when the work
 * fits in fewer days than the plan lasts, the days are spaced out across the
 * whole plan rather than crammed into the first week. Tasks the student has
 * already practised keep their spaced-repetition date; mastered ones are left
 * alone. Returned in date order.
 */
export function schedulePlanTasks<T extends Record<string, any>>(
  tasks: T[],
  opts: { dailyMinutes?: number; weeks?: number; startMs?: number } = {},
): Array<T & { nextReviewMs: number }> {
  const today = startOfLocalDay(opts.startMs ?? Date.now());
  const spanDays = Math.max(1, Math.round((Number(opts.weeks) || 4) * 7));
  const budget = Math.max(15, Number(opts.dailyMinutes) || 60);

  const fresh = interleaveBySubject(tasks.filter(isUntouchedTask));
  const freshSet = new Set(fresh);

  const dayOf: number[] = [];
  let day = 0;
  let used = 0;
  for (const t of fresh) {
    const m = estimateTaskMinutes(t);
    if (used > 0 && used + m > budget) {
      day += 1;
      used = 0;
    }
    dayOf.push(day);
    used += m;
  }
  const daysUsed = fresh.length ? day + 1 : 0;
  const stretch = daysUsed > 0 && daysUsed < spanDays ? spanDays / daysUsed : 1;

  const placed = fresh.map((t, i) => ({
    ...t,
    nextReviewMs: addLocalDays(today, Math.floor(dayOf[i] * stretch)),
  }));
  // Practised/mastered tasks keep whatever date they already carry.
  const kept = tasks.filter((t) => !freshSet.has(t)) as Array<T & { nextReviewMs: number }>;
  return [...placed, ...kept].sort((a, b) => {
    if (a.status === 'mastered' && b.status !== 'mastered') return 1;
    if (b.status === 'mastered' && a.status !== 'mastered') return -1;
    return (a.nextReviewMs || 0) - (b.nextReviewMs || 0) || (b.priority || 0) - (a.priority || 0);
  });
}

/**
 * Plans saved before PLAN_SCHEDULE_VERSION put every task on the creation
 * instant. True when a stored plan needs its untouched tasks spread out.
 */
export function planNeedsReschedule(plan: any): boolean {
  if (!plan || !Array.isArray(plan.tasks) || plan.tasks.length === 0) return false;
  return Number(plan.scheduleVersion || 0) < PLAN_SCHEDULE_VERSION;
}

/**
 * Re-spread a stored plan from today. Duplicates go, practised/mastered tasks
 * keep their dates. Returns the patch to persist (tasks + version).
 */
export function rescheduleStoredPlan(plan: any, nowMs = Date.now()): { tasks: any[]; scheduleVersion: number } {
  const tasks = dedupePlanTasks<Record<string, any>>(plan?.tasks || []);
  return {
    tasks: schedulePlanTasks(tasks, {
      dailyMinutes: plan?.dailyTargetMinutes,
      weeks: plan?.weeklyGoals,
      startMs: nowMs,
    }),
    scheduleVersion: PLAN_SCHEDULE_VERSION,
  };
}

/** "En retard" means a day that has passed, never "earlier today". */
export function isTaskOverdue(task: any, nowMs = Date.now()): boolean {
  if (!task || task.status === 'mastered' || !task.nextReviewMs) return false;
  return task.nextReviewMs < startOfLocalDay(nowMs);
}

// ─── Where a task opens ─────────────────────────────────────────────────────

/** Raw catalog level → the exam URL/route slug. */
export const EXAM_LEVEL_SLUG: Record<string, string> = {
  baccalaureat: 'terminale',
  universite: 'university',
  '9eme_af': '9e',
  terminale: 'terminale',
  university: 'university',
  '9e': '9e',
};

export type PlanTaskRoute =
  | { kind: 'exam'; examId: string; levelSlug: string }
  | { kind: 'practice'; course: string; unit?: string }
  | { kind: 'lesson'; courseId: string; lessonId?: string }
  | { kind: 'unavailable' };

/**
 * The exact thing a task opens. Never a generic parent: a task that lacks the
 * id it needs is 'unavailable' (the row is shown, not tappable), rather than
 * dropping the student on a tab root to fend for themselves.
 *
 * `resolveCourseId` maps a stored course code ("CHEM-NSI") to the catalog's
 * course id ("chem-ns1"), which is what course pages are keyed by.
 */
export function planTaskRoute(
  task: any,
  opts: { resolveCourseId?: (codeOrId: string) => string | undefined; defaultLevel?: string } = {},
): PlanTaskRoute {
  const type = task?.type || 'exam';
  if (type === 'exam') {
    const examId = String(task?.examId || '').trim();
    if (!examId) return { kind: 'unavailable' };
    const lvl = String(task?.level || opts.defaultLevel || 'baccalaureat');
    return { kind: 'exam', examId, levelSlug: EXAM_LEVEL_SLUG[lvl] || lvl };
  }
  if (type === 'practice') {
    const course = String(task?.subjectCode || '').trim();
    if (!course) return { kind: 'unavailable' };
    const unit = String(task?.unitId || '').trim();
    return unit ? { kind: 'practice', course, unit } : { kind: 'practice', course };
  }
  if (type === 'video') {
    const stored = String(task?.courseId || '').trim();
    const code = String(task?.courseCode || '').trim();
    const courseId = stored || (code && opts.resolveCourseId ? opts.resolveCourseId(code) : undefined) || '';
    if (!courseId) return { kind: 'unavailable' };
    let lessonId = String(task?.lessonId || '').trim();
    if (!lessonId && typeof task?.taskId === 'string' && task.taskId.startsWith('video-')) {
      lessonId = task.taskId.slice('video-'.length);
    }
    return lessonId ? { kind: 'lesson', courseId, lessonId } : { kind: 'lesson', courseId };
  }
  return { kind: 'unavailable' };
}

/** Web path for a task route ('' when unavailable). */
export function planTaskWebPath(route: PlanTaskRoute): string {
  switch (route.kind) {
    case 'exam':
      return `/exams/${encodeURIComponent(route.levelSlug)}/${encodeURIComponent(route.examId)}`;
    case 'practice': {
      const p = new URLSearchParams({ course: route.course });
      if (route.unit) p.set('unit', route.unit);
      return `/quizzes?${p.toString()}`;
    }
    case 'lesson':
      return `/courses/${encodeURIComponent(route.courseId)}${route.lessonId ? `?lesson=${encodeURIComponent(route.lessonId)}` : ''}`;
    default:
      return '';
  }
}

// ─── The inverse: what a finished activity completes (P0 E-13, P-2, P-3) ────

/**
 * Something the student just finished, described the way `planTaskRoute`
 * describes where a task opens — so "which task does this complete?" is the
 * exact inverse of "where does this task go?" on both platforms.
 */
export type PlanEvent =
  | { kind: 'exam'; examId: string }
  | { kind: 'practice'; course: string; unit?: string | null }
  | { kind: 'lesson'; courseId: string; lessonId?: string | null };

const sameId = (a: unknown, b: unknown) =>
  String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase() && String(a ?? '').trim() !== '';

/**
 * Does finishing `event` complete `task`? Strict where the task is specific:
 * a chapter practice task needs that chapter (a course-wide session does not
 * count), a video task naming a lesson needs that lesson. A task that names
 * only its course is completed by any activity in that course.
 */
export function planTaskMatchesEvent(
  task: any,
  event: PlanEvent,
  opts: { resolveCourseId?: (codeOrId: string) => string | undefined } = {},
): boolean {
  if (!task || !event) return false;
  const route = planTaskRoute(task, opts);
  switch (event.kind) {
    case 'exam':
      return route.kind === 'exam' && sameId(route.examId, event.examId);
    case 'practice': {
      if (route.kind !== 'practice' || !sameId(route.course, event.course)) return false;
      const unit = event.unit && event.unit !== '*' ? event.unit : null;
      return !route.unit || (!!unit && sameId(route.unit, unit));
    }
    case 'lesson': {
      if (route.kind !== 'lesson' || !sameId(route.courseId, event.courseId)) return false;
      return !route.lessonId || (!!event.lessonId && sameId(route.lessonId, event.lessonId));
    }
    default:
      return false;
  }
}

export interface PlanSrs {
  computeSRS: (task: any, quality: number) => Record<string, any>;
  scoreToQuality: (pct: number) => number;
}

/** One task after a result: SRS reschedule + history, as recordTaskResult did. */
export function applyTaskResult(task: any, scorePct: number, nowMs: number, srs: PlanSrs, answeredAt?: number): any {
  const quality = srs.scoreToQuality(scorePct ?? 0);
  const next = srs.computeSRS(task, quality);
  const history = Array.isArray(task?.history) ? [...task.history] : [];
  history.push({ scorePct, quality, answeredAt: answeredAt || nowMs });
  return {
    ...task,
    ...next,
    history,
    lastPracticedMs: nowMs,
    status: (next as any).repetitions >= 3 && quality >= 4 ? 'mastered' : 'active',
  };
}

/**
 * Apply a finished activity to a plan's task list. Returns the new list and
 * how many tasks it advanced (0 → nothing to write). Pure: the platforms run
 * it inside a Firestore transaction so two devices can't overwrite each other.
 */
export function applyPlanEvent(
  tasks: any[],
  event: PlanEvent,
  scorePct: number,
  nowMs: number,
  srs: PlanSrs,
  opts: { resolveCourseId?: (codeOrId: string) => string | undefined; answeredAt?: number } = {},
): { tasks: any[]; changed: number } {
  let changed = 0;
  const out = (tasks || []).map((t) => {
    if (!planTaskMatchesEvent(t, event, opts)) return t;
    changed += 1;
    return applyTaskResult(t, scorePct, nowMs, srs, opts.answeredAt);
  });
  return { tasks: out, changed };
}

/** The same, for a task named by its exam id or task id (the old recordTaskResult contract). */
export function applyTaskIdResult(
  tasks: any[],
  taskId: string,
  scorePct: number,
  nowMs: number,
  srs: PlanSrs,
  answeredAt?: number,
): { tasks: any[]; changed: number } {
  const list = tasks || [];
  let idx = list.findIndex((t) => t?.examId === taskId);
  if (idx === -1) idx = list.findIndex((t) => t?.taskId === taskId);
  if (idx === -1) return { tasks: list, changed: 0 };
  const out = [...list];
  out[idx] = applyTaskResult(list[idx], scorePct, nowMs, srs, answeredAt);
  return { tasks: out, changed: 1 };
}

/** Course code prefix per canonical subject. SVT has no course of its own. */
export const SUBJECT_COURSE_PREFIX: Record<string, string> = {
  chimie: 'CHEM',
  physique: 'PHYS',
  'sciences physiques': 'PHYS',
  mathématiques: 'MATH',
  mathematiques: 'MATH',
  économie: 'ECON',
  economie: 'ECON',
};
