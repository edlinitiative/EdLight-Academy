/**
 * The competition interaction vocabulary (audit #19).
 *
 * One meaning per haptic, used the same way on every competitive surface —
 * Arena, duels, the Jeux hub:
 *
 *   choose()     a selection that can still change (segment, option, follow)
 *   commit()     a submission that cannot be undone (lock an answer, register)
 *   confirmed()  the server confirmed something the student did (answer
 *                received). Light — a receipt, not a party.
 *   correct() / wrong()   the reveal of the student's own answer
 *   celebrate(key)        an EARNED achievement, once per key per session
 *                         (see arenaResultTier.celebrationKey). Revisits and
 *                         routine completions never re-fire it.
 *
 * Reading phases (a question on screen, the interval) fire nothing.
 *
 * The haptics-off preference is honoured twice over: utils/haptics checks the
 * Profile switch (settings/preferences), and this module also reads the store
 * defensively (`state.hapticsEnabled !== false`) in case the preference is
 * mirrored there — a store without the field keeps haptics on.
 */

import useStore from '../../contexts/store';
import { select, tapMedium, tapLight, success, warn } from '../../utils/haptics';

export function hapticsAllowed(): boolean {
  try {
    const state: any = useStore.getState();
    return state?.hapticsEnabled !== false;
  } catch {
    return true;
  }
}

const celebrated = new Set<string>();

export const arenaHaptics = {
  choose(): void { if (hapticsAllowed()) select(); },
  commit(): void { if (hapticsAllowed()) tapMedium(); },
  confirmed(): void { if (hapticsAllowed()) tapLight(); },
  correct(): void { if (hapticsAllowed()) success(); },
  wrong(): void { if (hapticsAllowed()) warn(); },
  /** Returns true when it fired (first time for this key this session). */
  celebrate(key: string): boolean {
    if (celebrated.has(key)) return false;
    celebrated.add(key);
    if (hapticsAllowed()) success();
    return true;
  },
};

/** Test seam. */
export function __resetCelebrations(): void {
  celebrated.clear();
}

export default arenaHaptics;
