/**
 * Optional, non-blocking haptic feedback.
 *
 * The web has no real haptics API beyond `navigator.vibrate` (Android/Chrome
 * only — iOS Safari ignores it). We treat a buzz as pure garnish: it is fully
 * guarded, never throws, and is suppressed for users who asked for reduced
 * motion (vibration is a motion cue and can be just as unwelcome).
 */

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Fire a short vibration pattern if the platform supports it. A no-op on
 * unsupported browsers (iOS, desktop) and when reduced motion is requested.
 *
 * @param pattern ms, or an on/off pattern array (see the Vibration API).
 */
export function buzz(pattern: number | number[] = 12): void {
  try {
    if (reducedMotion()) return;
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (nav && typeof nav.vibrate === 'function') {
      nav.vibrate(pattern);
    }
  } catch {
    /* vibration is best-effort — never let it break a flow */
  }
}

/** A celebratory triple-tap, used alongside confetti bursts. */
export const CELEBRATE_PATTERN: number[] = [18, 40, 18, 40, 28];
