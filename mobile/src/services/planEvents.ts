/**
 * planEvents — a finished activity advances the study-plan task it matches
 * (P0 validation E-13, P-2, P-3). The app had no path from "exam submitted",
 * "practice finished" or "lesson completed" to the plan, so the plan never
 * moved on the phone.
 *
 * The match is the inverse of planTaskRoute (shared/studyPlanTasks:
 * applyPlanEvent), the same rule the web uses, and the write is a Firestore
 * transaction over the plan's task list (P-4): a result recorded on another
 * device in between is re-read, not overwritten. A transaction needs the
 * server, so offline the event is queued in the write outbox and replayed at
 * launch / reconnect.
 */
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { computeSRS, loadActiveStudyPlan, scoreToQuality } from './studyPlanService';
import { queueForReplay, registerOutboxHandler, subscribeLessonCompleted } from './writeOutbox';
import { applyPlanEvent, type PlanEvent } from '../../../shared/studyPlanTasks';

const SRS = { computeSRS, scoreToQuality };

interface PlanEventPayload { event: PlanEvent; scorePct: number; at: number }

function stripUndefined<T extends Record<string, any>>(o: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(o || {})) if (v !== undefined) out[k] = v;
  return out as T;
}

async function applyToActivePlan(uid: string, event: PlanEvent, scorePct: number, at: number): Promise<number> {
  const plan = await loadActiveStudyPlan(uid);
  if (!plan?.id) return 0;
  const ref = doc(db, 'users', uid, 'studyPlans', plan.id);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return 0;
    const r = applyPlanEvent(snap.data()?.tasks || [], event, scorePct, at, SRS, { answeredAt: at });
    if (!r.changed) return 0;
    tx.update(ref, {
      tasks: r.tasks.map((t) => stripUndefined(t)),
      updated_at: serverTimestamp(),
      updated_at_ms: Date.now(),
    });
    return r.changed;
  });
}

registerOutboxHandler('plan-event', async (op) => {
  const p = op.payload as PlanEventPayload;
  if (!p?.event?.kind) return 'drop';
  await applyToActivePlan(op.uid, p.event, Number(p.scorePct) || 0, p.at || op.createdAt);
  return 'done';
});

/** Never throws; returns how many plan tasks advanced (0 when queued / none). */
export async function recordPlanEvent(uid: string | null | undefined, event: PlanEvent, scorePct: number): Promise<number> {
  if (!uid || !event) return 0;
  const at = Date.now();
  try {
    return await applyToActivePlan(uid, event, scorePct, at);
  } catch {
    const payload: PlanEventPayload = { event, scorePct, at };
    await queueForReplay(uid, 'plan-event', payload);
    return 0;
  }
}

// A newly completed lesson completes its video task (the lesson's course id is
// what video tasks store; planTaskRoute resolves older code-only tasks).
subscribeLessonCompleted(({ uid, courseId, lessonId }) => {
  void recordPlanEvent(uid, { kind: 'lesson', courseId, lessonId }, 100);
});
