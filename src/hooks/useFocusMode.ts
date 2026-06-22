import { useEffect } from 'react';
import useStore from '../contexts/store';

/**
 * useFocusMode — let a page or flow opt into the global "focus mode" while
 * `active` is true.
 *
 * Why this exists
 * ---------------
 * Some immersive tasks (an active trivia round, a practice question, a lesson)
 * live inside a single route and switch between phases with component state, so
 * the Layout can't tell from the URL alone when the user is heads-down on the
 * task. This hook flips a shared store flag the Layout watches; when it's on,
 * the Layout sheds distracting chrome — the mobile bottom tab bar and the
 * footer — so the task gets the whole screen ("maximum focus").
 *
 * Safety
 * ------
 * The flag is always cleared when `active` flips to false AND on unmount, so a
 * flow can never navigate away (or crash) leaving the rest of the app stuck
 * without its navigation. The flag is transient and never persisted.
 *
 * @param active - hide the chrome while true; restore it when false.
 *
 * @example
 * // Trivia: focus only during the live question phase.
 * useFocusMode(screen === 'play');
 */
export function useFocusMode(active: boolean): void {
  const setFocusMode = useStore((s) => s.setFocusMode);

  useEffect(() => {
    setFocusMode(active);
    return () => setFocusMode(false);
  }, [active, setFocusMode]);
}

export default useFocusMode;
