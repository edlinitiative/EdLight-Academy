import { Easing } from 'react-native-reanimated';

/**
 * Motion tokens — the curves and timings the whole app animates on.
 *
 * What separates premium motion from default motion is not the library (we have
 * had Reanimated all along); it is that everything obeys a small, consistent
 * physical vocabulary:
 *
 *  - Anything the USER caused springs. A tap that eases linearly to a stop feels
 *    like a web page; a tap that overshoots slightly and settles feels like a
 *    thing being pushed.
 *  - Anything the SYSTEM introduces eases out hard and travels a short distance.
 *    Long slides read as slow; 12-16px reads as "it was always nearly there".
 *  - Siblings stagger. Four rows appearing together is one event; four rows
 *    appearing 55ms apart is a sequence the eye can follow, and it is the single
 *    cheapest way to make a plain list feel considered.
 *
 * Every consumer pairs these with `useReduceMotion()` — see utils/motion.
 */

/** Spring presets. Damping is tuned per role, not copied between them. */
export const spring = {
  /** Press / release of a control: quick, barely any overshoot. */
  press: { damping: 26, stiffness: 420, mass: 0.7 },
  /** A selection committing — a little overshoot reads as confidence. */
  select: { damping: 16, stiffness: 260, mass: 0.9 },
  /** Something arriving on screen under its own weight. */
  settle: { damping: 20, stiffness: 180, mass: 1 },
  /** Celebration: loose and bouncy. Used sparingly, on real wins only. */
  celebrate: { damping: 11, stiffness: 190, mass: 0.9 },
} as const;

/** Duration presets, in ms. */
export const duration = {
  instant: 120,
  quick: 220,
  base: 320,
  slow: 480,
} as const;

/**
 * Easings. `emphasis` is the house entrance curve: a hard decelerate that
 * covers most of the distance immediately, so motion never feels like waiting.
 */
export const easing = {
  emphasis: Easing.bezier(0.16, 1, 0.3, 1),
  standard: Easing.bezier(0.2, 0, 0, 1),
  exit: Easing.bezier(0.4, 0, 1, 1),
} as const;

/** Distance an entering element travels. Deliberately small. */
export const travel = { sm: 8, md: 14, lg: 22 } as const;

/** Gap between staggered siblings, in ms. */
export const STAGGER_MS = 55;

/** Delay for the nth sibling in a staggered group, capped so long lists don't crawl. */
export function stagger(index: number, max = 6): number {
  return Math.min(index, max) * STAGGER_MS;
}
