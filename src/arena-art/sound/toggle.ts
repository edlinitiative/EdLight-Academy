/**
 * The one student-facing sound switch (audit X2) — pure, so it is tested
 * without React or Web Audio.
 *
 * The engine already persists three things per viewer (policy.ts,
 * localStorage): `enabled` (the explicit opt-in, false by default), `muted`
 * and `volume`. The switch is "on" only when the viewer opted in AND has not
 * muted. Turning it off MUTES rather than un-enrolling, so the preference a
 * viewer set is what comes back on their next visit; turning it on again
 * re-runs `enable()` inside the click, which is the gesture browsers require
 * before audio may start.
 */
export interface ToggleState { enabled: boolean; muted: boolean }
export type ToggleAction = 'enable' | 'unmute' | 'mute';

export function soundToggleView(s: ToggleState): { on: boolean; next: ToggleAction } {
  if (!s.enabled) return { on: false, next: 'enable' };
  if (s.muted) return { on: false, next: 'unmute' };
  return { on: true, next: 'mute' };
}

export interface ToggleEngine {
  getState(): ToggleState;
  enable(): boolean;
  setMuted(m: boolean): void;
}

/** Apply one press of the switch. Call it from the click handler. */
export function pressSoundToggle(engine: ToggleEngine): ToggleAction {
  const { next } = soundToggleView(engine.getState());
  if (next === 'mute') {
    engine.setMuted(true);
  } else {
    if (next === 'unmute') engine.setMuted(false);
    engine.enable();
  }
  return next;
}
