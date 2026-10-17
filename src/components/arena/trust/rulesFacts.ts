/**
 * rulesFacts — every number the rules sheets state, with where it comes from.
 *
 * Imported wherever the source is importable from `src/` (shared/arena/**,
 * src/utils/duels.ts). Restated where it is not: `api/**` modules pull in
 * firebase-admin and cannot be bundled into the web app, and the trivia
 * timer is a literal in src/pages/TriviaGames.tsx. Each restated value is
 * pinned to its source by __tests__/rulesFacts.test.ts, which reads the
 * source file and fails the build the day the rule and the explanation drift
 * apart. A rules sheet that disagrees with the server is worse than none.
 */

import {
  POINTS_FULL,
  POINTS_HALF,
  RENDER_GRACE_MS,
  TIER_FULL_MS,
  TIER_HALF_MS,
} from '../../../../shared/arena/scoring';
import { DUEL_ROUND } from '../../../utils/duels';

export const ARENA_RULES = {
  fullMs: TIER_FULL_MS,
  halfMs: TIER_HALF_MS,
  pointsFull: POINTS_FULL,
  pointsHalf: POINTS_HALF,
  graceMs: RENDER_GRACE_MS,
  /** api/arena/claim.ts · CLAIM_WINDOW_MS. */
  claimHours: 72,
} as const;

export const DUEL_RULES = {
  questions: DUEL_ROUND,
  /** src/pages/TriviaGames.tsx · TriviaQuiz's per-question timer (ROUND_SECONDS). */
  secondsPerQuestion: 15,
  /** api/challenges/create.ts · TTL_MS. */
  ttlDays: 7,
  /** api/challenges/accept.ts · WIN_XP / TIE_XP. */
  winXp: 20,
  tieXp: 10,
} as const;

/** Where a student reports a problem: the same inbox as /contact. */
export const SUPPORT_EMAIL = 'info@edlight.org';
