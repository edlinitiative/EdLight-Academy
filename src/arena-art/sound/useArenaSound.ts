import { useCallback, useSyncExternalStore } from 'react';
import { getArenaSound, CueName, PlayOptions, PlayResult } from './arenaSound';

/**
 * React access to the Arène sound engine. Silent until `enable()` is called
 * from a user gesture (a click handler). Settings persist across visits.
 */
export function useArenaSound() {
  const engine = getArenaSound();
  const state = useSyncExternalStore(
    useCallback((cb: () => void) => engine.subscribe(cb), [engine]),
    () => engine.getState(),
    () => engine.getState(),
  );
  return {
    enabled: state.enabled,
    muted: state.muted,
    volume: state.volume,
    reducedSound: state.reducedSound,
    /** The audio device is open (enabled AND unlocked by a gesture this visit). */
    unlocked: state.unlocked,
    crowdOn: state.crowdOn,
    enable: useCallback(() => engine.enable(), [engine]),
    disable: useCallback(() => engine.disable(), [engine]),
    setMuted: useCallback((m: boolean) => engine.setMuted(m), [engine]),
    setVolume: useCallback((v: number) => engine.setVolume(v), [engine]),
    setReducedSound: useCallback((r: boolean) => engine.setReducedSound(r), [engine]),
    play: useCallback((cue: CueName, opts?: PlayOptions): PlayResult => engine.play(cue, opts), [engine]),
    startCrowd: useCallback(() => engine.startCrowd(), [engine]),
    stopCrowd: useCallback(() => engine.stopCrowd(), [engine]),
  };
}

export default useArenaSound;
