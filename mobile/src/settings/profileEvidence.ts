/**
 * Profile progress in EVIDENCE terms (utils/learningJourney): each lesson is
 * counted once, at the strongest evidence it has —
 *   mastered  → confirmed by a chapter test (masteredAt)
 *   practised → exercises answered (bestPct recorded)
 *   completed → video finished only
 * so finishing a video is never reported as mastery.
 */
import type { Evidence } from '../utils/learningJourney';

export type LessonEvidenceCounts = Record<Exclude<Evidence, 'opened'>, number>;

export function lessonEvidence(p?: { completed?: boolean; bestPct?: number; masteredAt?: number } | null): Evidence | null {
  if (!p) return null;
  if (p.masteredAt) return 'mastered';
  if (typeof p.bestPct === 'number') return 'practised';
  if (p.completed) return 'completed';
  return null;
}

export function countLessonEvidence(
  progress: Record<string, { completed?: boolean; bestPct?: number; masteredAt?: number } | undefined> | null | undefined,
): LessonEvidenceCounts {
  const out: LessonEvidenceCounts = { completed: 0, practised: 0, mastered: 0 };
  for (const p of Object.values(progress ?? {})) {
    const e = lessonEvidence(p);
    if (e && e !== 'opened') out[e] += 1;
  }
  return out;
}
