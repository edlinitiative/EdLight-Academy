/**
 * The Arène's visual world — competition surfaces only.
 *
 * Learning screens keep the calm Estil Klè theme (theme/theme.ts). The Arena
 * hub, lobby, doors, live play, watching and results use THIS module, so that
 * walking from a lesson into the championship is visibly walking into a
 * different place: night, illuminated signage, enamel crests, gold that is
 * only ever earned. It mirrors the web's night (src/styles/arenaNight.css)
 * and the brief (docs/design/2026-10-17-arena-visual-motion-broadcast-brief.md):
 *
 *  - Coral (#FF6A45) identifies the PRIMARY ACTION, and nothing else. Its text
 *    is marine (#12213A), not white: white on coral is 2.9:1 and fails for a
 *    button label; marine on coral is ~6:1.
 *  - Gold identifies EARNED achievement (a confirmed champion, a prize). Never
 *    decoration, never a provisional result.
 *  - School colours (art/crest palette) personalise crests and banners only.
 *  - Buttons are FLAT: no pressed-down shadow, no gradient. Depth lives in the
 *    world art, not in the controls.
 *
 * The night is the same in light and dark mode on purpose — like the web,
 * there is no light/dark switch inside the Arène. Every text colour below is
 * measured against `bg` and `surface` at >= 4.5:1 (see the contrast test).
 */

import type { TextStyle } from 'react-native';
import { fonts, type Palette } from './theme';

const TABULAR: TextStyle['fontVariant'] = ['tabular-nums'];

export const arenaColors = {
  /** The sky behind everything. */
  bg: '#050B1A',
  bgAccent: '#0A1428',
  /**
   * Cards and panels — OPAQUE tonal steps, never a translucent fill under a
   * hairline (Ted, Oct 17: "border with transparent fill" reads as generic).
   * Depth is the step between page → surface → raised, not an outline.
   */
  surface: '#13243F',
  /** Inset wells inside a surface (a crest tile, a quiet row). */
  surfaceAlt: '#0E1C33',
  surfaceRaised: '#1C3254',
  /** Secondary (non-coral) buttons and progress tracks. */
  secondary: '#1F3456',
  /**
   * Kept for layout stability: neutral outlines are transparent, so a state
   * border (correct / wrong / picked) can appear without the box shifting.
   */
  border: 'transparent',
  borderStrong: 'transparent',

  ink: '#F1F5FF',
  inkSoft: '#DCE6FF',
  muted: '#A3B5DC',
  /** Lowest text tone still allowed for essential text (>= 4.5:1 on surface). */
  faint: '#8DA2CF',

  /** Primary action. */
  coral: '#FF6A45',
  coralPressed: '#E9532F',
  /** Text and icons on coral. */
  onCoral: '#12213A',
  marine: '#12213A',

  /** Earned achievement only. */
  gold: '#FFC24A',
  goldSoft: '#343A41',
  onGold: '#12213A',

  /** Information / live signal. */
  signal: '#5EA2FF',
  signalSoft: '#1E365A',

  success: '#3DDC97',
  successSoft: '#193E4B',
  warn: '#FFB547',
  warnSoft: '#343840',
  danger: '#FF7A7A',
  dangerSoft: '#343047',

  /** Live indicator dot. */
  live: '#FF5A5F',
} as const;

export type ArenaColors = typeof arenaColors;

/**
 * Competitive type ramp. The UI sans at heavier sizes for numbers and names —
 * tabular figures everywhere a number changes. Nothing that a student needs
 * in order to act (rules, status, errors, buttons) is below 14pt.
 */
export const arenaType: Record<
  'score' | 'hero' | 'title' | 'name' | 'body' | 'status' | 'action' | 'label' | 'num',
  TextStyle
> = {
  /** The one big number on a screen: a countdown, a rank. */
  score: { fontFamily: fonts.bold, fontSize: 48, lineHeight: 52, letterSpacing: -1.2, fontVariant: TABULAR },
  hero: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 35, letterSpacing: -0.6 },
  title: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 25, letterSpacing: -0.2 },
  name: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 21 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
  /** Status, errors, rules. 14pt floor. */
  status: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19 },
  action: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 20 },
  /** Small labels over a value ("Ton école"). Sentence case, never uppercase. */
  label: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 18 },
  /** Tabular numbers in rows. */
  num: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 20, fontVariant: TABULAR },
};

export const arenaRadius = {
  card: 20,
  control: 999,
  chip: 999,
  tile: 14,
} as const;

/** Minimum touch height for Arena controls. */
export const ARENA_TOUCH = 50;

/**
 * The night, shaped like the app's Palette — so an existing competition
 * screen can swap `useColors()` for `arenaPalette` and keep its structure.
 * `azure*` becomes the Arène's blue signal; filled azure grounds stay deep
 * enough for a white label. Primary actions should use the coral ArenaButton
 * (components/arena/ArenaKit), not `azureFill`.
 */
export const arenaPalette: Palette = {
  azure: arenaColors.signal,
  azureDeep: '#2F6FD0',
  azureSoft: arenaColors.signalSoft,
  azureBorder: '#2D5082',
  azureFill: '#2F6FD0',
  coral: arenaColors.coral,
  coralSoft: '#342E40',
  bg: arenaColors.bg,
  surface: arenaColors.surface,
  surfaceAlt: arenaColors.surfaceAlt,
  border: arenaColors.border,
  hairline: arenaColors.secondary,
  ink: arenaColors.ink,
  muted: arenaColors.muted,
  faint: arenaColors.faint,
  danger: arenaColors.danger,
  dangerSoft: arenaColors.dangerSoft,
  warn: arenaColors.warn,
  warnSoft: arenaColors.warnSoft,
  success: arenaColors.success,
  successSoft: arenaColors.successSoft,
  successFill: '#13845A',
  azureInk: arenaColors.signal,
  // The night accents are already light enough to read as text.
  dangerInk: arenaColors.danger,
  successInk: arenaColors.success,
  warnInk: arenaColors.warn,
  coralInk: arenaColors.coral,
  dangerFill: '#DC2626',
};

/** Hook form, for symmetry with `useColors()`. The night does not change with the OS theme. */
export function useArenaColors(): Palette {
  return arenaPalette;
}
