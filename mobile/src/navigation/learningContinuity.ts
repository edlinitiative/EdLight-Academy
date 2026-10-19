/**
 * learningContinuity — reopen the app where the student left it
 * (roadmap §5 "Navigation and continuity", release CON-02 / CON-10).
 * ─────────────────────────────────────────────────────────────────────────
 * After an app kill, iOS/Android cold-start on Home. A student who was three
 * screens deep in a course had to find their place again. We now persist a
 * MINIMAL description of the learning location (the focused tab and its stack)
 * and rebuild it after auth readiness, through validation that can only
 * produce known screens with well-formed ids:
 *
 *   • allowlist only — tabs and stack screens listed below; anything else
 *     (Arena, Sandra, Search, Defi, modals) is not restored here
 *     (competition destinations have their own continuity module);
 *   • params are rebuilt field by field, never copied: ids must match ID_RE,
 *     text is length-capped, one-shot params (autoplay, autostart, handoff,
 *     resetAt, nonce) are dropped so a restore never re-triggers an action;
 *   • a screen whose data can be gone stops the stack there: ExamTake and
 *     ExamResults are not restored (the take screen with a stale draft could
 *     auto-start; results need an attempt). ExamOverview below them already
 *     offers "Reprendre l'examen" from the saved draft;
 *   • per account: a record saved by another uid (or by a guest, for a
 *     signed-in student) is ignored; and it expires after MAX_AGE_MS;
 *   • the stack's ROOT is not stored: the Exams tab's root depends on the
 *     student's grade (ExamLanding vs Quizzes), so it is supplied at restore.
 *
 * Pure: no React Navigation, no AsyncStorage — AppNavigator wires it.
 */

export const LEARNING_STATE_KEY = 'edlight:nav:learning:v1';
export const MAX_AGE_MS = 7 * 86_400_000;
const MAX_STACK = 5;
const ID_RE = /^[A-Za-z0-9_.:-]{1,128}$/;
const SLUG_RE = /^[a-z0-9_-]{1,40}$/i;

export type TabName = 'Dashboard' | 'Courses' | 'Exams' | 'Trivia' | 'Profile';
const TABS: readonly TabName[] = ['Dashboard', 'Courses', 'Exams', 'Trivia', 'Profile'];

export interface SavedRoute { name: string; params?: Record<string, string | number> }
export interface SavedLearningState {
  v: 1;
  uid: string | null;
  savedAt: number;
  tab: TabName;
  /** Screens ABOVE the tab's root, bottom to top. */
  stack: SavedRoute[];
}

const id = (v: unknown): string | null => (typeof v === 'string' && ID_RE.test(v) ? v : null);
const slug = (v: unknown): string | null => (typeof v === 'string' && SLUG_RE.test(v) ? v.toLowerCase() : null);
const text = (v: unknown, max = 120): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
const smallInt = (v: unknown, max: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : null;

/** Rebuild one route's params, or null when the screen may not be restored. */
function cleanRoute(tab: TabName, name: string, params: any): SavedRoute | null | 'stop' {
  const p = params && typeof params === 'object' ? params : {};
  if (tab === 'Courses') {
    if (name === 'CourseDetail') {
      const courseId = id(p.courseId);
      if (!courseId) return 'stop';
      const out: Record<string, string | number> = { courseId };
      const courseName = text(p.courseName);
      if (courseName) out.courseName = courseName;
      const lessonId = id(p.lessonId);
      if (lessonId) out.lessonId = lessonId;
      const chapterIndex = smallInt(p.chapterIndex, 200);
      if (chapterIndex !== null) out.chapterIndex = chapterIndex;
      return { name, params: out };
    }
    if (name === 'Quizzes') {
      const courseId = id(p.courseId);
      return courseId ? { name, params: { courseId } } : { name };
    }
    return 'stop';
  }
  if (tab === 'Exams') {
    if (name === 'ExamBrowser') {
      const level = slug(p.level);
      if (!level) return 'stop';
      const out: Record<string, string | number> = { level };
      const subject = text(p.subject, 60);
      if (subject) out.subject = subject;
      return { name, params: out };
    }
    if (name === 'ExamOverview') {
      const level = slug(p.level);
      const examId = id(p.examId);
      return level && examId ? { name, params: { level, examId } } : 'stop';
    }
    if (name === 'ExamHistory') return { name };
    // ExamTake / ExamResults / anything unknown: stop here (see header).
    return 'stop';
  }
  return 'stop';
}

const ROOTS = new Set(['CourseList', 'ExamLanding', 'Quizzes']);

/**
 * The learning location to save, from the root navigation state, or null
 * when the student is not on a learning tab (a root modal, Arena, Loading).
 */
export function snapshotLearningState(rootState: any, uid: string | null, now: number): SavedLearningState | null {
  if (!rootState || !Array.isArray(rootState.routes)) return null;
  const root = rootState.routes[rootState.index ?? 0];
  if (!root || root.name !== 'Main') return null;
  const tabs = root.state;
  const tabRoute = tabs?.routes?.[tabs.index ?? 0];
  const tab = (tabRoute?.name ?? 'Dashboard') as TabName;
  if (!TABS.includes(tab)) return null;

  const stack: SavedRoute[] = [];
  const nested = tabRoute?.state;
  if ((tab === 'Courses' || tab === 'Exams') && Array.isArray(nested?.routes)) {
    const upTo = Math.min(nested.index ?? nested.routes.length - 1, nested.routes.length - 1);
    for (let i = 0; i <= upTo; i += 1) {
      const r = nested.routes[i];
      if (!r || typeof r.name !== 'string') break;
      // The Exams tab's Quizzes root is a root; the Courses tab's Quizzes is a pushed screen.
      if (i === 0 && ROOTS.has(r.name)) continue;
      const clean = cleanRoute(tab, r.name, r.params);
      if (clean === 'stop' || clean === null) break;
      stack.push(clean);
      if (stack.length >= MAX_STACK) break;
    }
  }
  return { v: 1, uid: uid ?? null, savedAt: now, tab, stack };
}

export interface RestoreContext {
  uid: string | null;
  now: number;
  /** The Exams tab's current root for this student's grade. */
  examsRoot: 'ExamLanding' | 'Quizzes';
  /** Optional data check: false = known to be gone (stop the stack there). */
  courseExists?: (courseId: string) => boolean | undefined;
}

/** Validate a stored record; returns the clean record or null. */
export function readLearningState(raw: unknown, ctx: RestoreContext): SavedLearningState | null {
  let rec: any = raw;
  if (typeof raw === 'string') {
    try { rec = JSON.parse(raw); } catch { return null; }
  }
  if (!rec || typeof rec !== 'object' || rec.v !== 1) return null;
  // Same account only; a guest's record never opens inside a signed-in account
  // (nor the reverse), so a shared phone never shows the previous student's place.
  if ((rec.uid ?? null) !== (ctx.uid ?? null)) return null;
  if (typeof rec.savedAt !== 'number' || ctx.now - rec.savedAt > MAX_AGE_MS || rec.savedAt - ctx.now > 60_000) return null;
  if (!TABS.includes(rec.tab)) return null;
  const tab = rec.tab as TabName;
  const stack: SavedRoute[] = [];
  if (Array.isArray(rec.stack)) {
    for (const r of rec.stack.slice(0, MAX_STACK)) {
      if (!r || typeof r.name !== 'string') break;
      const clean = cleanRoute(tab, r.name, r.params);
      if (clean === 'stop' || clean === null) break;
      if (clean.name === 'CourseDetail' && ctx.courseExists?.(String(clean.params?.courseId)) === false) break;
      if (clean.name === 'Quizzes' && clean.params?.courseId && ctx.courseExists?.(String(clean.params.courseId)) === false) break;
      stack.push(clean);
    }
  }
  return { v: 1, uid: rec.uid ?? null, savedAt: rec.savedAt, tab, stack };
}

/**
 * The partial navigation state to hand to `resetRoot`, or null when there is
 * nothing worth restoring (Home with no stack — the default anyway).
 */
export function learningStateToNavState(rec: SavedLearningState, ctx: Pick<RestoreContext, 'examsRoot'>): any | null {
  if (rec.tab === 'Dashboard' && !rec.stack.length) return null;
  let tabState: any;
  if (rec.tab === 'Courses' || rec.tab === 'Exams') {
    const rootName = rec.tab === 'Courses' ? 'CourseList' : ctx.examsRoot;
    // ExamLanding exists only in the Exams navigator; QuizNavigator has no
    // Landing. Both stacks carry ExamBrowser/Overview/History.
    const routes = [{ name: rootName }, ...rec.stack.map((r) => (r.params ? { name: r.name, params: { ...r.params } } : { name: r.name }))];
    tabState = { routes, index: routes.length - 1 };
  }
  const tabRoute = tabState ? { name: rec.tab, state: tabState } : { name: rec.tab };
  return { routes: [{ name: 'Main', state: { routes: [tabRoute], index: 0 } }], index: 0 };
}

/**
 * Restore only into an untouched launch: the default Home with nothing pushed.
 * A deep link, notification tap, competition restore or the student's own
 * first tap all win over an old saved place.
 */
export function isPristineLaunch(rootState: any): boolean {
  if (!rootState || !Array.isArray(rootState.routes)) return false;
  if (rootState.routes.length !== 1) return false;
  const root = rootState.routes[0];
  if (!root || root.name !== 'Main') return false;
  const tabs = root.state;
  if (!tabs) return true;
  const focused = tabs.routes?.[tabs.index ?? 0];
  if (focused && focused.name !== 'Dashboard') return false;
  // Any tab that already has a pushed screen means something navigated.
  return !(tabs.routes || []).some((r: any) => (r?.state?.routes?.length ?? 0) > 1);
}
