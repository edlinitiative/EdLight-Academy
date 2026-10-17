/**
 * learningJourney — the shared contract for the connected learning journey
 * (docs/design/2026-10-17-learning-journey-prd.md).
 *
 * 1. EVIDENCE LABELS (LJ-10): "opened / completed / practised / mastered"
 *    mean one thing everywhere. Completion of a video is never mastery.
 * 2. PRACTICE HANDOFF (LJ-06): the one URL shape a lesson uses to send a
 *    student to practice with their context, and the one parser practice
 *    uses to read it. `lesson` is attribution only — practice is labelled
 *    lesson-specific ONLY when the bank actually maps that lesson.
 * 3. JOURNEY EVENTS (§15): the logical event names, sent through the
 *    existing telemetry sink. Never put answers, names or emails in them.
 */
import { trackEvent } from './telemetry';

export type Evidence = 'opened' | 'completed' | 'practised' | 'mastered';

export const EVIDENCE: Record<Evidence, { fr: string; ht: string; helpFr: string; helpHt: string }> = {
  opened: { fr: 'Commencée', ht: 'Kòmanse', helpFr: 'Tu as ouvert cette leçon.', helpHt: 'Ou louvri leson sa a.' },
  completed: { fr: 'Terminée', ht: 'Fini', helpFr: 'Tu as terminé la vidéo. La maîtrise se construit avec la pratique.', helpHt: 'Ou fini videyo a. Metriz la bati ak pratik.' },
  practised: { fr: 'Pratiquée', ht: 'Pratike', helpFr: 'Tu as répondu à des questions sur ce sujet.', helpHt: 'Ou reponn kesyon sou sijè sa a.' },
  mastered: { fr: 'Maîtrisée', ht: 'Metrize', helpFr: 'Confirmée par un test de chapitre.', helpHt: 'Konfime pa yon tès chapit.' },
};

export function evidenceLabel(e: Evidence, isCreole: boolean): string {
  return isCreole ? EVIDENCE[e].ht : EVIDENCE[e].fr;
}

export interface PracticeHandoff {
  /** Course code as Quizzes already reads it (e.g. "chem-ns1"). */
  course: string;
  unit?: string;
  /** Lesson id — attribution only. */
  lesson?: string;
  /** 'quiz' (finite deck) or 'practice' (open). */
  mode?: 'quiz' | 'practice';
  from?: 'lesson' | 'result' | 'home' | 'review';
}

/** Build the practice URL (existing /quizzes params + lesson/from). */
export function practiceHref(h: PracticeHandoff): string {
  const q = new URLSearchParams();
  q.set('course', h.course);
  if (h.unit) q.set('unit', h.unit);
  if (h.lesson) q.set('lesson', h.lesson);
  if (h.mode) q.set('mode', h.mode);
  if (h.from) q.set('from', h.from);
  return `/quizzes?${q.toString()}`;
}

/** Read the handoff back; unknown values are dropped, never guessed. */
export function readPracticeHandoff(params: URLSearchParams): PracticeHandoff | null {
  const course = (params.get('course') || '').trim();
  if (!course) return null;
  const mode = params.get('mode');
  const from = params.get('from');
  return {
    course,
    unit: (params.get('unit') || '').trim() || undefined,
    lesson: (params.get('lesson') || '').trim() || undefined,
    mode: mode === 'quiz' || mode === 'practice' ? mode : undefined,
    from: from === 'lesson' || from === 'result' || from === 'home' || from === 'review' ? from : undefined,
  };
}

export type JourneyEvent =
  | 'learning_next_action_selected'
  | 'lesson_resume_requested' | 'lesson_resume_resolved'
  | 'lesson_completion_confirmed'
  | 'practice_handoff_opened' | 'practice_started' | 'practice_completed'
  | 'correction_opened'
  | 'review_started' | 'review_completed'
  | 'learning_save_failed'
  | 'progress_summary_opened';

/** Send a journey event. Detail = technical context only (ids, mode, source, outcome). */
export function trackJourney(name: JourneyEvent, detail?: Record<string, string | number | boolean | null | undefined>) {
  trackEvent(name, detail as Record<string, unknown> | undefined);
}
