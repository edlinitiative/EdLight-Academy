/**
 * NavTour geometry — PURE, so placement is unit-tested (audit #10).
 *
 * Two tab-bar implementations exist (navigation/TabNavigator.tsx):
 *   - Android: the JS floating pill (BAR_HEIGHT 58, BAR_MARGIN 20, bottom
 *     offset max(insets.bottom, 12), 5 equal slots). Its geometry is known, so
 *     the tour can point at a real slot — computed here from the overlay's
 *     MEASURED size (onLayout) and live insets, never module-init Dimensions.
 *   - iOS: the system UITabBarController (NativeTabNavigator). Its frame is not
 *     exposed to JS, it changes with iOS version (Liquid Glass), and on iPad it
 *     can sit at the TOP of the screen. Pointing at coordinates there would be
 *     a guess, so iOS uses the 'map' mode: a centred card with a miniature bar
 *     that highlights the slot by position, not by coordinates.
 *
 * Large text and wide screens also fall back to 'map' — a pointer tooltip
 * anchored to the bar has no room to grow upward when Dynamic Type is huge, and
 * on a tablet the floating pill sits far from the centred content column.
 *
 * KEEP IN SYNC with TabNavigator's BAR_HEIGHT / BAR_MARGIN. The tab-bar owner
 * should ideally import JS_TAB_BAR from here so the two can never drift.
 */

export const JS_TAB_BAR = {
  height: 58,
  margin: 20,
  minBottomOffset: 12,
  tabCount: 5,
} as const;

export type TourMode = 'pointer' | 'map';

export function chooseTourMode(opts: {
  platform: string;
  width: number;
  fontScale: number;
  /** the tablet breakpoint from theme.breakpoints */
  tabletWidth?: number;
}): TourMode {
  if (opts.platform === 'ios') return 'map';
  if (opts.width >= (opts.tabletWidth ?? 700)) return 'map';
  if (opts.fontScale > 1.3) return 'map';
  return 'pointer';
}

export interface Rect { left: number; top: number; width: number; height: number }

export interface PointerLayout {
  /** spotlight over the tab slot */
  spot: Rect;
  /** tooltip box: left + bottom (distance from the overlay's bottom edge) + width */
  tip: { left: number; bottom: number; width: number };
  /** arrow x offset inside the tooltip */
  arrowLeft: number;
}

/**
 * Where the spotlight and tooltip go for tab `index`, given the overlay's
 * measured size and the bottom safe-area inset.
 */
export function pointerLayout(opts: {
  width: number;
  height: number;
  insetBottom: number;
  index: number;
  bar?: { height: number; margin: number; minBottomOffset: number; tabCount: number };
}): PointerLayout {
  const bar = opts.bar ?? JS_TAB_BAR;
  const idx = Math.max(0, Math.min(bar.tabCount - 1, Math.round(opts.index)));
  const bottomOffset = Math.max(opts.insetBottom, bar.minBottomOffset);
  const barTop = opts.height - bottomOffset - bar.height;
  const slotW = (opts.width - bar.margin * 2) / bar.tabCount;

  const spot: Rect = {
    left: bar.margin + idx * slotW + 2,
    top: barTop + 3,
    width: Math.max(0, slotW - 4),
    height: bar.height - 6,
  };
  const centerX = bar.margin + (idx + 0.5) * slotW;

  const tipW = Math.max(200, Math.min(opts.width - 32, 320));
  const tipLeft = Math.max(16, Math.min(centerX - tipW / 2, opts.width - 16 - tipW));
  const ARROW_HALF = 9;
  const arrowLeft = Math.max(12, Math.min(centerX - tipLeft - ARROW_HALF, tipW - 12 - ARROW_HALF * 2));

  return {
    spot,
    tip: { left: tipLeft, bottom: opts.height - barTop + 14, width: tipW },
    arrowLeft,
  };
}
