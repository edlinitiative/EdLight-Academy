/**
 * useLessonCompletion — the honest state of "Terminer la leçon".
 *
 * A completion has five outcomes the screen must tell apart (PRD LJ-05, §13):
 *
 *   saving    the write is in flight
 *   slow      still unconfirmed after `slowAfterMs`; we do NOT claim it worked
 *   queued    offline: Firestore is holding the write until the connection is
 *             back. Explicitly pending — never a celebration.
 *   failed    nothing landed (`reason` says whether the connection was the
 *             cause); the same action retries, nothing typed or watched is lost
 *   confirmed the server acknowledged the write (or the document already had it)
 *
 * Rules this hook enforces, so the view cannot get them wrong:
 *  - one write per lesson at a time: a second tap while one is pending is a
 *    no-op (a ref, not state, so two taps in the same tick can't both pass);
 *  - a confirmed lesson is never written again;
 *  - state is kept PER LESSON and scoped to the account + course it started
 *    in: a late answer for lesson A never acknowledges lesson B, and a
 *    response that arrives after the student signed out (or switched account
 *    or course) is dropped;
 *  - each confirmation / failure is reported to the journey telemetry once.
 *
 * It decides nothing about progress: `save` is the existing write
 * (`confirmLessonComplete`), and `confirmedIds` only echoes acknowledged
 * writes so the screen stops contradicting a save that landed.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { trackJourney } from '../../../utils/learningJourney';

export type CompletionStatus = 'idle' | 'saving' | 'slow' | 'queued' | 'failed' | 'confirmed';
export interface CompletionEntry {
  status: CompletionStatus;
  reason?: 'offline' | 'error';
}

const IDLE: CompletionEntry = { status: 'idle' };
export const PENDING: ReadonlySet<CompletionStatus> = new Set(['saving', 'slow', 'queued']);

export function useLessonCompletion({
  uid,
  courseId,
  offline,
  save,
  slowAfterMs = 8000,
  onConfirmed,
}: {
  uid: string | null | undefined;
  courseId: string | null | undefined;
  offline: boolean;
  save: (uid: string, courseId: string, lessonId: string) => Promise<'saved' | 'already' | void>;
  slowAfterMs?: number;
  onConfirmed?: (lessonId: string, outcome: 'saved' | 'already') => void;
}) {
  const scope = `${uid || ''}|${courseId || ''}`;
  const scopeRef = useRef(scope);
  const [entries, setEntries] = useState<Record<string, CompletionEntry>>({});
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(() => new Set());
  /** The lesson whose confirmation arrived in THIS visit (drives the brief acknowledgment). */
  const [freshId, setFreshId] = useState<string | null>(null);
  const inflight = useRef<Set<string>>(new Set());
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const reported = useRef<Set<string>>(new Set());
  const offlineRef = useRef(offline);
  offlineRef.current = offline;
  const onConfirmedRef = useRef(onConfirmed);
  onConfirmedRef.current = onConfirmed;

  const clearTimer = (lessonId: string) => {
    const t = timers.current.get(lessonId);
    if (t) clearTimeout(t);
    timers.current.delete(lessonId);
  };
  const armSlow = useCallback((lessonId: string) => {
    clearTimer(lessonId);
    timers.current.set(lessonId, setTimeout(() => {
      setEntries((e) => (e[lessonId]?.status === 'saving' ? { ...e, [lessonId]: { status: 'slow' } } : e));
    }, slowAfterMs));
  }, [slowAfterMs]);

  // A new account or course is a new scope: forget everything from the old one.
  useEffect(() => {
    scopeRef.current = scope;
    setEntries({});
    setConfirmedIds(new Set());
    setFreshId(null);
    inflight.current = new Set();
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = new Map();
    reported.current = new Set();
  }, [scope]);

  useEffect(() => () => { timers.current.forEach((t) => clearTimeout(t)); }, []);

  // Connectivity changes while a write is pending change what we can say about
  // it, not the write itself (Firestore keeps it queued either way).
  useEffect(() => {
    setEntries((e) => {
      let changed = false;
      const next = { ...e };
      for (const [id, entry] of Object.entries(e)) {
        if (offline && (entry.status === 'saving' || entry.status === 'slow')) {
          next[id] = { status: 'queued' };
          clearTimer(id);
          changed = true;
        } else if (!offline && entry.status === 'queued') {
          next[id] = { status: 'saving' };
          armSlow(id);
          changed = true;
        }
      }
      return changed ? next : e;
    });
  }, [offline, armSlow]);

  const complete = useCallback(async (lessonId: string) => {
    if (!uid || !courseId || !lessonId) return;
    if (inflight.current.has(lessonId) || confirmedIds.has(lessonId)) return;
    inflight.current.add(lessonId);
    const startedIn = scopeRef.current;

    setEntries((e) => ({ ...e, [lessonId]: { status: offlineRef.current ? 'queued' : 'saving' } }));
    if (!offlineRef.current) armSlow(lessonId);

    try {
      const result = (await save(uid, courseId, lessonId)) || 'saved';
      if (scopeRef.current !== startedIn) return; // signed out / switched meanwhile
      clearTimer(lessonId);
      setConfirmedIds((prev) => new Set(prev).add(lessonId));
      setEntries((e) => ({ ...e, [lessonId]: { status: 'confirmed' } }));
      setFreshId(lessonId);
      const key = `confirmed:${lessonId}`;
      if (!reported.current.has(key)) {
        reported.current.add(key);
        trackJourney('lesson_completion_confirmed', { course_id: courseId, lesson_id: lessonId, outcome: result });
      }
      onConfirmedRef.current?.(lessonId, result);
    } catch (error) {
      if (scopeRef.current !== startedIn) return;
      clearTimer(lessonId);
      const reason: 'offline' | 'error' = offlineRef.current ? 'offline' : 'error';
      setEntries((e) => ({ ...e, [lessonId]: { status: 'failed', reason } }));
      trackJourney('learning_save_failed', { surface: 'lesson_completion', course_id: courseId, lesson_id: lessonId, reason });
      // eslint-disable-next-line no-console
      console.error('[lesson] completion not saved:', error);
    } finally {
      if (scopeRef.current === startedIn) inflight.current.delete(lessonId);
    }
  }, [uid, courseId, save, armSlow, confirmedIds]);

  const entryFor = useCallback((lessonId: string | null | undefined): CompletionEntry => (
    (lessonId && entries[lessonId]) || IDLE
  ), [entries]);

  return { complete, entryFor, confirmedIds, freshId };
}
