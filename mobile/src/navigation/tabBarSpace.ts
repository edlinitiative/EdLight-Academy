/**
 * How much room the floating tab bar occupies at the bottom of a tab screen.
 *
 * The bar is detached and absolutely positioned (JS bar: `bottom: max(inset,12)`,
 * height 58; the iOS 26 native bar sits in the same band), so content scrolls
 * UNDER it. Anything a screen pins to `bottom: 0` — a sticky CTA, a submit row —
 * lands behind the bar unless it reserves this space. That is exactly how
 * "Commencer l'examen" ended up hidden on the exam overview page.
 *
 * Screens that fill the space with scrollable content can keep using their own
 * bottom padding; this is for pinned controls that must clear the bar.
 */
export const FLOATING_BAR_HEIGHT = 58;

/** Gap between the bar's top edge and whatever sits above it. */
export const FLOATING_BAR_GAP = 12;

/** Bottom padding that clears the floating tab bar on a given device. */
export function tabBarSpace(insetBottom: number): number {
  return Math.max(insetBottom, 12) + FLOATING_BAR_HEIGHT + FLOATING_BAR_GAP;
}
