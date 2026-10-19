/**
 * Competition motion + cues on the phone — the native half of the one
 * vocabulary (roadmap P2; web: src/arena-art/motion/competition.css).
 *
 * Only real phase moments move, on the theme/motion tokens:
 *   enter     a question / a room / a results screen arriving
 *   phase     the phase label changing (lobby → live → reveal → results)
 *   reveal    the student's own right / wrong verdict popping in
 *   reorder   standings rows travelling to their new place (layout transition)
 *   podium(p) the podium steps rising third → second → first
 * Under Reduce Motion every one is `undefined`: Reanimated then renders the
 * final state immediately — same text, same order, nothing travels.
 *
 * Cues: there is no audio module in the native build (no expo-av /
 * expo-audio), and adding one would break the OTA runtime contract, so the
 * phone's cue is the existing haptic vocabulary (arenaHaptics), honouring the
 * Vibrations switch. Sound on the phone waits for the next store build.
 */
import { useRef } from 'react';
import { FadeIn, FadeInDown, LinearTransition, ZoomIn } from 'react-native-reanimated';
import { duration, easing, spring } from '../../theme/motion';
import arenaHaptics from './arenaHaptics';
import {
  standingsMoves,
  type CompetitionCue,
  type RowMove,
} from '../../../../shared/competition/presentation';

/** Wait before rows travel, so the answer reads first (brief: answer → points → standings). */
export const REORDER_DELAY_MS = 600;

export function arenaMotion(reduce: boolean) {
  if (reduce) {
    return {
      enter: undefined,
      phase: undefined,
      reveal: undefined,
      reorder: undefined,
      podium: (_place: 1 | 2 | 3) => undefined,
    };
  }
  return {
    enter: FadeInDown.duration(duration.base).easing(easing.emphasis),
    phase: FadeIn.duration(duration.quick),
    reveal: ZoomIn.springify().damping(spring.select.damping).stiffness(spring.select.stiffness),
    reorder: LinearTransition.duration(duration.slow).easing(easing.emphasis).delay(REORDER_DELAY_MS),
    // Third rises first, the winner last.
    podium: (place: 1 | 2 | 3) =>
      FadeInDown.duration(duration.slow).easing(easing.emphasis).delay(place === 3 ? 0 : place === 2 ? 180 : 360),
  };
}

/**
 * The phone's cue for a competition beat (haptics; see header). A question
 * opening is a reading phase and stays silent, as arenaHaptics prescribes.
 * `podium` buzzes only when the student EARNED a place (key = once per
 * tournament per session).
 */
export function arenaCue(cue: CompetitionCue | null | undefined, opts: { podiumKey?: string | null } = {}): void {
  switch (cue) {
    case 'locked': arenaHaptics.commit(); break;
    case 'correct': arenaHaptics.correct(); break;
    case 'wrong': arenaHaptics.wrong(); break;
    case 'podium': if (opts.podiumKey) arenaHaptics.celebrate(opts.podiumKey); break;
    default: break;
  }
}

/**
 * Movement of each row since the previous different board (shared
 * `standingsMoves`). The first board, or one arriving after an empty
 * (loading) board, shows no movement.
 */
export function useBoardMoves(keys: readonly string[]): Record<string, RowMove> {
  const mem = useRef<{ sig: string | null; prev: string[] | null; cur: string[] }>({ sig: null, prev: null, cur: [] });
  const sig = keys.join('\u0001');
  if (mem.current.sig !== sig) {
    mem.current = { sig, prev: mem.current.cur.length ? mem.current.cur : null, cur: [...keys] };
  }
  return standingsMoves(mem.current.prev, keys);
}
