import { useWindowDimensions } from 'react-native';
import { breakpoints, layout } from '../theme/theme';

/**
 * Runtime responsive info for iPad / large-screen support (1.2.0).
 *
 * Uses `useWindowDimensions()` (NOT the module-level `Dimensions.get`) so it
 * reacts to rotation and iPad Split View / Slide Over resizing. Everything a
 * screen needs to stop looking like a stretched phone lives here:
 *  - `isTablet` / `isWide` — breakpoint flags
 *  - `contentMaxWidth(kind)` — the centered column cap (Infinity on phones →
 *    a plain full-bleed layout, so phone behaviour is unchanged)
 *  - `columns(min, max)` — how many grid columns fit for a given tile width
 */
export interface Responsive {
  width: number;
  height: number;
  isTablet: boolean;
  isWide: boolean;
  isLandscape: boolean;
  /** Max width for a centered content column; Infinity on phones. */
  contentMaxWidth: (kind?: 'readable' | 'form') => number;
  /** Grid column count for a target tile width, clamped to [min, max]. */
  columns: (tileTarget: number, min?: number, max?: number) => number;
}

export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= breakpoints.tablet;
  const isWide = width >= breakpoints.wide;

  return {
    width,
    height,
    isTablet,
    isWide,
    isLandscape: width > height,
    contentMaxWidth: (kind = 'readable') => {
      if (!isTablet) return Infinity; // phones: full-bleed, unchanged
      return kind === 'form' ? layout.formMaxWidth : layout.readableMaxWidth;
    },
    columns: (tileTarget, min = 1, max = 6) => {
      if (!(tileTarget > 0)) return min;
      const n = Math.floor(width / tileTarget);
      return Math.max(min, Math.min(max, n || min));
    },
  };
}
