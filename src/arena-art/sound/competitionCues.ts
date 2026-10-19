import { useCallback } from 'react';
import type { CompetitionCue } from '../../../shared/competition/presentation';
import { getArenaSound, type CueName } from './arenaSound';

/**
 * Competition cue → engine cue. A tiny, fixed set (roadmap P2): a question
 * opening, an answer locked, the student's own correct / wrong, the podium.
 * Submission and correctness sound different on purpose (brief, sound
 * direction).
 */
export const COMPETITION_CUE_SOUND: Record<CompetitionCue, CueName> = {
  roundStart: 'reveal',
  locked: 'submitted',
  correct: 'correct',
  wrong: 'incorrect',
  podium: 'victory',
};

export interface CueEngine {
  play(cue: CueName): { played: boolean };
}

/**
 * Play one competition cue. Returns whether a sound actually started. The
 * engine is silent unless the viewer turned "Sons" on (default off, per
 * device), so callers fire freely; every cue doubles something already on
 * screen, and a sound failure never breaks a round.
 */
export function playCompetitionCue(cue: CompetitionCue | null | undefined, engine?: CueEngine): boolean {
  if (!cue) return false;
  try {
    return (engine ?? getArenaSound()).play(COMPETITION_CUE_SOUND[cue]).played;
  } catch {
    return false;
  }
}

/** React door for the room and the projector. */
export function useCompetitionCue(): (cue: CompetitionCue | null | undefined) => void {
  return useCallback((cue) => { playCompetitionCue(cue); }, []);
}
