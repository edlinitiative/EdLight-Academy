/**
 * Thin haptics wrapper. Every call is best-effort and fully swallowed on
 * failure (web, unsupported device, permission) so screens can fire feedback
 * freely without guarding each call site.
 *
 * Every helper honours the student's Profile switch (settings/preferences →
 * hapticsEnabled), so all ~40 call sites get the off-switch for free. Haptics
 * never carry meaning on their own — each one doubles a visual change — so
 * turning them off loses no information.
 */

import * as Haptics from 'expo-haptics';
import { isHapticsEnabled } from '../settings/preferences';

function fire(run: () => Promise<void>) {
  if (!isHapticsEnabled()) return;
  try {
    run().catch(() => {});
  } catch {
    // Native module missing (tests, web) — feedback is optional.
  }
}

/** Light tap — default for buttons, tiles, links, tab switches. */
export function tapLight() {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Medium tap — for weightier primary actions (send, submit). */
export function tapMedium() {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/** Selection tick — for pickers / segmented controls. */
export function select() {
  fire(() => Haptics.selectionAsync());
}

/** Success notification — correct answer, level-up, plan saved. */
export function success() {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** Warning notification — wrong answer, hit a limit. */
export function warn() {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

export default { tapLight, tapMedium, select, success, warn };
