import { useCallback } from 'react';
import { useArenaSound } from '../../arena-art/sound/useArenaSound';

export type MatchCue = 'select' | 'submitted' | 'correct' | 'incorrect' | 'victory';

/**
 * The match screens' one door to the Arène sound engine. Sound is OFF by
 * default (the engine stays silent until the student enables it elsewhere)
 * and is never needed for meaning: every cue played here fires at a beat
 * that is also shown on screen as text and an icon. A sound failure must
 * never break a round, hence the try/catch.
 */
export function useMatchSound(): (cue: MatchCue) => void {
  const { play } = useArenaSound();
  return useCallback((cue: MatchCue) => {
    try { play(cue); } catch { /* silent is fine */ }
  }, [play]);
}
