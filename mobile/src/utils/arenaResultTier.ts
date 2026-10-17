/**
 * Arena results — which achievement a student actually earned, and nothing more.
 *
 * Pure; tested in utils/__tests__/arenaResultTier.test.ts.
 *
 * A results screen that celebrates everything celebrates nothing, and one that
 * says "champion" before integrity review has to be taken back in public. So
 * the headline is ONE tier, picked from real data in a fixed order:
 *
 *   calculating           grading — scores are still settling; say so, no rank
 *   championConfirmed     the student's school is 1st among qualified schools,
 *                         and the event is FINAL
 *   championProvisional   same, but provisional — "in the lead, pending review",
 *                         never the title itself
 *   prizeConfirmed        a paying individual place, final
 *   prizeProvisional      a paying individual place, provisional (claim window)
 *   teamQualified         the school fielded its five — the team result
 *   personalBest          a higher score than the student's previous Arena event
 *                         (only when that previous score is actually known)
 *   completed             played; the routine finish
 *   recorded              answers recorded, but no row in the public slice yet
 *
 * What is deliberately NOT here: rematches, ratings, earned titles, streak
 * badges. None of them exist for the championship, so none may be implied.
 */

import type { ArenaState } from '../../../shared/arena/state';

export type ResultTier =
  | 'calculating'
  | 'championConfirmed'
  | 'championProvisional'
  | 'prizeConfirmed'
  | 'prizeProvisional'
  | 'teamQualified'
  | 'personalBest'
  | 'completed'
  | 'recorded';

/** How loud the screen may be. `none` is the routine finish: no effect at all. */
export type Celebration = 'big' | 'calm' | 'none';

export type Contribution =
  /** One of the five whose scores made the school's average. */
  | 'inFive'
  /** School qualified, student outside the counting five. */
  | 'outsideFive'
  /** School did not field five present players; student ranked individually. */
  | 'schoolNotQualified'
  /** No school lane on the standings (yet). */
  | 'noSchool';

export type NextAction = 'claim' | 'nextEvent' | 'practice' | 'wait';

export interface ResultInput {
  state: ArenaState;
  me: { score: number; rank: number } | null;
  school: { rank: number; qualified: boolean } | null;
  inTheFive: boolean;
  /** Cents this student has waiting, from the tournament's own prize list. */
  prizeCents: number;
  /** The student's score in their previous Arena event, when known. */
  previousScore: number | null;
  /** A next tournament is open for registration right now. */
  nextEventOpen: boolean;
}

export interface ResultSummary {
  tier: ResultTier;
  celebration: Celebration;
  contribution: Contribution;
  next: NextAction;
  /** Final results — the only state in which a title may be stated. */
  confirmed: boolean;
}

export function selectResultTier(input: ResultInput): ResultTier {
  if (input.state === 'grading') return 'calculating';
  const final = input.state === 'final';
  const school = input.school;
  if (school && school.qualified && school.rank === 1) {
    return final ? 'championConfirmed' : 'championProvisional';
  }
  if (input.me && input.prizeCents > 0) {
    return final ? 'prizeConfirmed' : 'prizeProvisional';
  }
  if (school && school.qualified) return 'teamQualified';
  if (!input.me) return 'recorded';
  if (input.previousScore != null && input.me.score > input.previousScore) return 'personalBest';
  return 'completed';
}

export function celebrationFor(tier: ResultTier): Celebration {
  switch (tier) {
    case 'championConfirmed':
    case 'prizeConfirmed':
      return 'big';
    case 'championProvisional':
    case 'prizeProvisional':
    case 'teamQualified':
    case 'personalBest':
      return 'calm';
    default:
      return 'none';
  }
}

export function contributionFor(input: Pick<ResultInput, 'school' | 'inTheFive'>): Contribution {
  if (!input.school) return 'noSchool';
  if (!input.school.qualified) return 'schoolNotQualified';
  return input.inTheFive ? 'inFive' : 'outsideFive';
}

/** ONE next action. The claim outranks everything: it has a 72-hour clock. */
export function nextActionFor(tier: ResultTier, nextEventOpen: boolean): NextAction {
  if (tier === 'calculating') return 'wait';
  if (tier === 'prizeProvisional') return 'claim';
  return nextEventOpen ? 'nextEvent' : 'practice';
}

export function summarizeResult(input: ResultInput): ResultSummary {
  const tier = selectResultTier(input);
  return {
    tier,
    celebration: celebrationFor(tier),
    contribution: contributionFor(input),
    next: nextActionFor(tier, input.nextEventOpen),
    confirmed: input.state === 'final',
  };
}

/**
 * Celebrate once per event and tier, never again on a revisit. The key is
 * what the screen stores after it has played the effect.
 */
export function celebrationKey(tid: string, tier: ResultTier): string {
  return `arena.celebrated.${tid}.${tier}`;
}
