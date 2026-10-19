/**
 * completionController — the honest state of "Terminer la leçon" (PRD LJ-05).
 * Mobile port of the web's src/components/journey/lesson/useLessonCompletion.ts,
 * kept as a plain object (no React) so every rule is a unit test.
 *
 *   saving     the write is in flight
 *   slow       still unconfirmed after `slowAfterMs`; we do NOT claim it worked
 *   queued     offline: Firestore holds the write until the connection is back.
 *              Explicitly pending — never a celebration.
 *   failed     nothing landed (`reason` says whether the connection was the
 *              cause); the same action retries
 *   confirmed  the server acknowledged the write (or the doc already had it),
 *              or — for a guest — the device recorded it (`outcome: 'local'`)
 *
 * Rules enforced here so the screen cannot get them wrong:
 *  - one write per lesson at a time: a second tap while one is pending is a
 *    no-op (checked synchronously, so two taps in one tick can't both pass);
 *  - a confirmed lesson is never written again;
 *  - state is kept PER LESSON and scoped to the account + course it started
 *    in: a late answer for an old scope is dropped, never shown;
 *  - each confirmation / failure is reported to journey telemetry once.
 */

export type CompletionStatus = 'idle' | 'saving' | 'slow' | 'queued' | 'failed' | 'confirmed';
export type CompletionOutcome = 'saved' | 'already' | 'local';

export interface CompletionEntry {
  status: CompletionStatus;
  reason?: 'offline' | 'error';
  outcome?: CompletionOutcome;
}

export const IDLE: CompletionEntry = { status: 'idle' };
const PENDING = new Set<CompletionStatus>(['saving', 'slow', 'queued']);
export const isPending = (e: CompletionEntry) => PENDING.has(e.status);

export type SaveFn = (uid: string, courseId: string, lessonId: string) => Promise<CompletionOutcome | void>;
export type TrackFn = (name: 'lesson_completion_confirmed' | 'learning_save_failed', detail: Record<string, string>) => void;

export interface CompletionControllerOptions {
  save: SaveFn;
  slowAfterMs?: number;
  track?: TrackFn;
  /** Called on every state change (the hook re-renders from it). */
  onChange?: () => void;
  /** Called once per lesson when it becomes confirmed in this scope. */
  onConfirmed?: (lessonId: string, outcome: CompletionOutcome) => void;
  onError?: (error: unknown) => void;
}

export function createCompletionController(opts: CompletionControllerOptions) {
  const slowAfterMs = opts.slowAfterMs ?? 8000;
  let uid = '';
  let courseId = '';
  let scope = '|';
  let offline = false;
  let entries: Record<string, CompletionEntry> = {};
  let freshId: string | null = null;
  let inflight = new Set<string>();
  let timers = new Map<string, ReturnType<typeof setTimeout>>();
  let reported = new Set<string>();

  const changed = () => opts.onChange?.();
  const clearTimer = (id: string) => {
    const t = timers.get(id);
    if (t) clearTimeout(t);
    timers.delete(id);
  };
  const set = (id: string, entry: CompletionEntry) => {
    entries = { ...entries, [id]: entry };
    changed();
  };
  const armSlow = (id: string) => {
    clearTimer(id);
    timers.set(id, setTimeout(() => {
      timers.delete(id);
      if (entries[id]?.status === 'saving') set(id, { status: 'slow' });
    }, slowAfterMs));
  };

  return {
    /** A new account or course is a new scope: forget everything from the old one. */
    setScope(nextUid: string | null | undefined, nextCourseId: string | null | undefined) {
      const next = `${nextUid || ''}|${nextCourseId || ''}`;
      if (next === scope) return;
      uid = nextUid || '';
      courseId = nextCourseId || '';
      scope = next;
      timers.forEach((t) => clearTimeout(t));
      timers = new Map();
      entries = {};
      freshId = null;
      inflight = new Set();
      reported = new Set();
      changed();
    },

    /**
     * Connectivity changes what we can SAY about a pending write, not the write
     * itself (Firestore keeps it queued either way).
     */
    setOffline(next: boolean) {
      if (next === offline) return;
      offline = next;
      let any = false;
      const out = { ...entries };
      for (const [id, e] of Object.entries(entries)) {
        if (offline && (e.status === 'saving' || e.status === 'slow')) {
          out[id] = { status: 'queued' };
          clearTimer(id);
          any = true;
        } else if (!offline && e.status === 'queued') {
          out[id] = { status: 'saving' };
          armSlow(id);
          any = true;
        }
      }
      if (any) { entries = out; changed(); }
    },

    async complete(lessonId: string): Promise<void> {
      if (!courseId || !lessonId) return;
      if (inflight.has(lessonId) || entries[lessonId]?.status === 'confirmed') return;
      inflight.add(lessonId);
      const startedIn = scope;
      const startedUid = uid;
      const startedCourse = courseId;

      set(lessonId, { status: offline ? 'queued' : 'saving' });
      if (!offline) armSlow(lessonId);

      try {
        const outcome = ((await opts.save(startedUid, startedCourse, lessonId)) || 'saved') as CompletionOutcome;
        if (scope !== startedIn) return; // signed out / switched meanwhile
        clearTimer(lessonId);
        freshId = lessonId;
        set(lessonId, { status: 'confirmed', outcome });
        const key = `confirmed:${lessonId}`;
        if (!reported.has(key)) {
          reported.add(key);
          opts.track?.('lesson_completion_confirmed', { course_id: startedCourse, lesson_id: lessonId, outcome });
        }
        opts.onConfirmed?.(lessonId, outcome);
      } catch (error) {
        if (scope !== startedIn) return;
        clearTimer(lessonId);
        const reason: 'offline' | 'error' = offline ? 'offline' : 'error';
        set(lessonId, { status: 'failed', reason });
        opts.track?.('learning_save_failed', { surface: 'lesson_completion', course_id: startedCourse, lesson_id: lessonId, reason });
        opts.onError?.(error);
      } finally {
        if (scope === startedIn) inflight.delete(lessonId);
      }
    },

    /**
     * Completions still in the persisted outbox (queued before an app kill,
     * services/writeOutbox) are shown as pending — never as done — until the
     * replay is confirmed. A lesson already confirmed or in flight is left as is.
     */
    adoptPending(forUid: string, forCourse: string, lessonIds: string[]) {
      if (`${forUid || ''}|${forCourse || ''}` !== scope || !uid) return;
      let any = false;
      const out = { ...entries };
      for (const id of lessonIds) {
        const cur = entries[id]?.status;
        if (cur === 'confirmed' || inflight.has(id) || (cur && PENDING.has(cur))) continue;
        out[id] = { status: offline ? 'queued' : 'saving' };
        if (!offline) armSlow(id);
        any = true;
      }
      if (any) { entries = out; changed(); }
    },

    /** The outbox replay was confirmed by the server. */
    confirmExternal(forUid: string, forCourse: string, lessonId: string) {
      if (`${forUid || ''}|${forCourse || ''}` !== scope || !uid) return;
      if (entries[lessonId]?.status === 'confirmed') return;
      clearTimer(lessonId);
      freshId = lessonId;
      set(lessonId, { status: 'confirmed', outcome: 'saved' });
      const key = `confirmed:${lessonId}`;
      if (!reported.has(key)) {
        reported.add(key);
        opts.track?.('lesson_completion_confirmed', { course_id: courseId, lesson_id: lessonId, outcome: 'saved' });
      }
      opts.onConfirmed?.(lessonId, 'saved');
    },

    /** The outbox replay did not land; the same action retries (same op id). */
    failExternal(forUid: string, forCourse: string, lessonId: string) {
      if (`${forUid || ''}|${forCourse || ''}` !== scope || !uid) return;
      if (entries[lessonId]?.status === 'confirmed' || inflight.has(lessonId)) return;
      clearTimer(lessonId);
      set(lessonId, { status: 'failed', reason: offline ? 'offline' : 'error' });
    },

    entryFor(lessonId: string | null | undefined): CompletionEntry {
      return (lessonId && entries[lessonId]) || IDLE;
    },

    /** The lesson whose confirmation arrived during THIS visit. */
    freshId(): string | null {
      return freshId;
    },

    dispose() {
      timers.forEach((t) => clearTimeout(t));
      timers = new Map();
    },
  };
}

export type CompletionController = ReturnType<typeof createCompletionController>;
