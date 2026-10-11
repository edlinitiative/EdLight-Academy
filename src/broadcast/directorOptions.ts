import type { DirectorOptions } from '../../shared/arena/director';

/**
 * The broadcast's director settings — ONE copy, read by the real stage
 * (useStage, /direct) and the demo (/arena/demo), so the demo can never show
 * a different evening from the one a school hall would see.
 */
export const BROADCAST_DIRECTOR_OPTIONS: DirectorOptions = {
  // `maxDwellByKind` is section K's own numbers for the moments the design
  // calls "structural" — the ones the match is deliberately paused around,
  // which a global ceiling built for a quiet lead change cannot also serve.
  // Everything not listed here uses the director's default (7s).
  maxDwellByKind: {
    // "Priority 10, a 60s hold" — api/arena/state.ts's own comment on
    // this event, matched here rather than left to the 7s default.
    TOURNAMENT_OPEN: 60_000,
    // Deliberately withholds. Typically 20–40s of real re-scoring; the
    // ceiling is a safety net, not the reveal's actual clock — the
    // CHAMPION_* hand-off below is what ends it when results are published.
    GRADING: 90_000,
    CHAMPION_SCHOOL: 15_000,
    CHAMPION_INDIVIDUAL: 10_000,
    // "~2 min", own screen, top 3 + superlatives.
    HALFTIME: 120_000,
  },
  // Hand-offs (see DirectorOptions.continuedBy): the opening card is over the
  // moment question 1 opens; "calcul des scores" is over the moment the
  // results are published.
  continuedBy: {
    TOURNAMENT_OPEN: ['ROUND_START'],
    GRADING: ['CHAMPION_SCHOOL', 'CHAMPION_INDIVIDUAL'],
  },
};
