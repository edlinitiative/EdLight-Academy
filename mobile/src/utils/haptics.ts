/**
 * Thin haptics wrapper. Every call is best-effort and fully swallowed on
 * failure (web, unsupported device, permission) so screens can fire feedback
 * freely without guarding each call site.
 */

import * as Haptics from 'expo-haptics';

/** Light tap — default for buttons, tiles, links, tab switches. */
export function tapLight() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Medium tap — for weightier primary actions (send, submit). */
export function tapMedium() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

/** Selection tick — for pickers / segmented controls. */
export function select() {
  Haptics.selectionAsync().catch(() => {});
}

/** Success notification — correct answer, level-up, plan saved. */
export function success() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** Warning notification — wrong answer, hit a limit. */
export function warn() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}

export default { tapLight, tapMedium, select, success, warn };
