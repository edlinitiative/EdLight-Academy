/**
 * learningJourney — the mobile copy of the connected-learning-journey contract
 * (docs/design/2026-10-17-learning-journey-prd.md; web: src/utils/learningJourney.ts).
 *
 * 1. EVIDENCE LABELS: "opened / completed / practised / mastered" mean one
 *    thing everywhere. Completing a video is never mastery; mastery needs
 *    `masteredAt` in the shared mastery doc.
 * 2. PRACTICE HANDOFF: the one param shape a lesson/result/home uses to send
 *    a student to practice with their context (navigation params, not a URL),
 *    and the one reader practice uses. `lesson` is attribution only — practice
 *    is labelled lesson-specific ONLY when the bank really maps that lesson.
 * 3. JOURNEY EVENTS: same logical names as the web, via services/telemetry.
 */
import { trackEvent } from '../services/telemetry';

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
  /** Course id as the quiz bank reads it (e.g. "chem-ns1"). */
  course: string;
  unit?: string;
  /** Lesson id — attribution only. */
  lesson?: string;
  /** 'quiz' (finite deck) or 'practice' (open). */
  mode?: 'quiz' | 'practice';
  from?: 'lesson' | 'result' | 'home' | 'review';
}

/** Navigation params for the practice screen. Pass as `{ handoff: practiceParams(h) }`. */
export function practiceParams(h: PracticeHandoff): PracticeHandoff {
  const out: PracticeHandoff = { course: h.course };
  if (h.unit) out.unit = h.unit;
  if (h.lesson) out.lesson = h.lesson;
  if (h.mode) out.mode = h.mode;
  if (h.from) out.from = h.from;
  return out;
}

/** Read a handoff back from route params; unknown values dropped, never guessed. */
export function readPracticeHandoff(raw: unknown): PracticeHandoff | null {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const course = str(p.course);
  if (!course) return null;
  const mode = p.mode === 'quiz' || p.mode === 'practice' ? p.mode : undefined;
  const from = p.from === 'lesson' || p.from === 'result' || p.from === 'home' || p.from === 'review' ? p.from : undefined;
  return { course, unit: str(p.unit), lesson: str(p.lesson), mode, from };
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

export function trackJourney(name: JourneyEvent, detail?: Record<string, string | number | boolean | null | undefined>) {
  trackEvent(name, detail as Record<string, unknown> | undefined);
}
