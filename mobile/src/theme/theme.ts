/**
 * Limyè design tokens — the single source of truth for color, radius, shadow,
 * spacing and type on mobile. Screens should read from here instead of
 * hardcoding hex/spacing so a restyle (or dark mode) happens in one place.
 *
 * Brand azure is #1B6FE0 (matches the web app's Limyè system). A deeper azure
 * is kept for shadow tints and places that need extra contrast.
 */

export const colors = {
  // Brand
  azure: '#1B6FE0', // primary brand — fills, CTAs, active states, icons
  azureDeep: '#0857A6', // deeper shade — shadow tint, pressed states, high-contrast text
  azureSoft: '#eaf2fb', // tinted icon backgrounds / chips
  azureBorder: '#cfdff2',
  coral: '#E0532F', // Sandra / flourish accent
  coralSoft: '#fdeae4',

  // Surfaces
  bg: '#f4f6fb', // app background
  surface: '#ffffff', // cards
  border: '#e8edf5', // card & hairline borders
  hairline: '#eef1f6',

  // Text
  ink: '#0f172a', // primary text
  muted: '#64748b', // secondary text
  faint: '#94a3b8', // tertiary text (use sparingly — low contrast at small sizes)

  // Status
  danger: '#ef4444',
  dangerSoft: '#fef2f2',
  warn: '#f59e0b',
  success: '#22c55e',
} as const;

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

/** Subject / accent color for a course, with a safe fallback. */
export function courseTint(c?: string): string {
  return c && /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.test(c) ? c : colors.azure;
}
