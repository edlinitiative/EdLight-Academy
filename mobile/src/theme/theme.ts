/**
 * Limyè design tokens — the single source of truth for color, radius, shadow,
 * spacing and type on mobile. Screens should read from here instead of
 * hardcoding hex/spacing so a restyle (or dark mode) happens in one place.
 *
 * Brand azure is #1B6FE0 (matches the web app's Limyè system). A deeper azure
 * is kept for shadow tints and places that need extra contrast.
 */

import { useMemo } from 'react';
import useStore from '../contexts/store';

export type ColorScheme = 'light' | 'dark';
export type Palette = {
  azure: string; azureDeep: string; azureSoft: string; azureBorder: string;
  coral: string; coralSoft: string;
  bg: string; surface: string; surfaceAlt: string; border: string; hairline: string;
  ink: string; muted: string; faint: string;
  danger: string; dangerSoft: string; warn: string; success: string;
};

export const lightColors: Palette = {
  // Brand
  azure: '#1B6FE0',
  azureDeep: '#0857A6',
  azureSoft: '#eaf2fb', // tinted icon backgrounds / chips
  azureBorder: '#cfdff2',
  coral: '#E0532F',
  coralSoft: '#fdeae4',
  // Surfaces
  bg: '#f4f6fb',
  surface: '#ffffff',
  surfaceAlt: '#f8fafc', // subtly raised inner surfaces
  border: '#e8edf5',
  hairline: '#eef1f6',
  // Text
  ink: '#0f172a',
  muted: '#64748b',
  faint: '#94a3b8',
  // Status
  danger: '#ef4444',
  dangerSoft: '#fef2f2',
  warn: '#f59e0b',
  success: '#22c55e',
};

export const darkColors: Palette = {
  // Brand — lift the azure a touch so it stays vivid on a dark ground
  azure: '#4C9AF5',
  azureDeep: '#2E86F0',
  azureSoft: 'rgba(76,154,245,0.16)',
  azureBorder: 'rgba(76,154,245,0.35)',
  coral: '#FF7043',
  coralSoft: 'rgba(224,83,47,0.18)',
  // Surfaces — deep navy, not pure black
  bg: '#0b1220',
  surface: '#131c2e',
  surfaceAlt: '#1a2436',
  border: 'rgba(148,163,184,0.16)',
  hairline: 'rgba(148,163,184,0.12)',
  // Text
  ink: '#eef2f8',
  muted: '#9aa8c0',
  faint: '#6b7a94',
  // Status
  danger: '#f87171',
  dangerSoft: 'rgba(248,113,113,0.16)',
  warn: '#fbbf24',
  success: '#34d399',
};

/**
 * Static light palette — kept as the default export so modules that read
 * `colors.X` at import time keep compiling during the dark-mode rollout. Screens
 * that need to react to the theme should use `useColors()` / `useTheme()`.
 */
export const colors = lightColors;

export const radius = {
  chip: 999,
  control: 14, // buttons, inputs
  tile: 16, // icon tiles inside cards
  card: 20, // the standard card corner
  hero: 24, // large hero surfaces
} as const;

/** One shadow recipe, three depths. Brand-tinted so cards feel warm, not gray. */
export const shadow = {
  sm: {
    shadowColor: colors.azureDeep,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 1,
  },
  md: {
    shadowColor: colors.azureDeep,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  lg: {
    shadowColor: colors.azureDeep,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 10,
  },
} as const;

/** The canonical card surface — replaces the recipe copy-pasted across screens. */
export const cardSurface = {
  backgroundColor: colors.surface,
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: colors.border,
  ...shadow.sm,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20, // standard screen gutter + section rhythm
  xxl: 28,
} as const;

/** Brand-tinted shadow depths for a given palette (softer on dark grounds). */
export function shadowsFor(scheme: ColorScheme) {
  const c = scheme === 'dark' ? '#000000' : lightColors.azureDeep;
  const o = scheme === 'dark' ? 1.6 : 1; // dark shadows need more opacity to read
  return {
    sm: { shadowColor: c, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06 * o, shadowRadius: 6, elevation: 1 },
    md: { shadowColor: c, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08 * o, shadowRadius: 10, elevation: 3 },
    lg: { shadowColor: c, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14 * o, shadowRadius: 18, elevation: 10 },
  } as const;
}

/** The current color scheme, from the store. */
export function useColorScheme(): ColorScheme {
  return useStore((s) => s.theme) === 'dark' ? 'dark' : 'light';
}

/** The active palette for the current theme. */
export function useColors(): Palette {
  return useColorScheme() === 'dark' ? darkColors : lightColors;
}

/**
 * Everything a screen needs, themed: colors, radius, spacing, shadows, and a
 * ready-made card surface. Memoized per scheme.
 */
export function useTheme() {
  const scheme = useColorScheme();
  return useMemo(() => {
    const c = scheme === 'dark' ? darkColors : lightColors;
    const sh = shadowsFor(scheme);
    return {
      scheme,
      isDark: scheme === 'dark',
      colors: c,
      radius,
      spacing,
      shadow: sh,
      cardSurface: {
        backgroundColor: c.surface,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: c.border,
        ...sh.sm,
      } as const,
    };
  }, [scheme]);
}

/** Subject / accent color for a course, with a safe fallback. */
export function courseTint(c?: string): string {
  return c && /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.test(c) ? c : lightColors.azure;
}
