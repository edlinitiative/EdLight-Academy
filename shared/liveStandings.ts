/**
 * liveStandings — what CHANGED between two polls of the school board.
 *
 * The spectator screen re-reads standings every few seconds and animates the
 * difference: a school sliding up a row, a score ticking over, a name arriving
 * for the first time. A single snapshot cannot say any of that, and the render
 * layer has no business remembering the last one, so the comparison lives here:
 * pure, framework-free, shared by web and mobile, and testable without a timer
 * or a Firestore listener.
 */

import type { TeamStanding } from './leaderboardAgg';

export interface LiveStanding extends TeamStanding {
  /** Rank in the previous snapshot, or null when the school was not on it. */
  previousRank: number | null;
  /** Places GAINED this tick: 5 → 2 is +3, 2 → 5 is -3. 0 when it cannot be said. */
  rankDelta: number;
  /** Team XP gained since the previous snapshot. Never negative. */
  xpDelta: number;
  /** Arrived on the board this tick — worth an entrance, exactly once. */
  isNew: boolean;
}

/** All the diff needs to remember about a school from last tick. */
interface PreviousState {
  rank: number;
  teamXp: number;
}

function indexByKey(standings: TeamStanding[]): Map<string, PreviousState> {
  const byKey = new Map<string, PreviousState>();
  for (const s of standings) byKey.set(s.key, { rank: s.rank, teamXp: s.teamXp });
  return byKey;
}

/**
 * How many places a school gained, given where it was and where it is.
 *
 * rank 0 is not a position, it is "not competing yet" — a school short of its
 * five players. Subtracting it as a number turns a school qualifying straight
 * into 4th place into a four-place FALL, and the screen plays the sinking
 * animation over the best news of the round. Same trap in reverse when a school
 * drops out of the running. Neither direction is a rank move, so neither counts.
 */
function gainedPlaces(previousRank: number, rank: number): number {
  if (previousRank <= 0 || rank <= 0) return 0;
  return previousRank - rank;
}

/**
 * Annotate `next` with how it differs from `previous`, preserving `next` order —
 * the caller already ranked it, and re-sorting here would fight the list it is
 * about to animate.
 *
 * `previous` is null on the very first poll. Nothing moved, nothing was gained,
 * and — the part that is easy to get wrong — nothing is NEW. Every school is
 * absent from a snapshot that does not exist, so marking them new fires every
 * entrance animation on the board simultaneously and the first paint arrives as
 * confetti. "New" has to mean "arrived while you were watching".
 */
export function diffStandings(
  previous: TeamStanding[] | null,
  next: TeamStanding[],
): LiveStanding[] {
  const firstLoad = previous === null;
  const before = firstLoad ? new Map<string, PreviousState>() : indexByKey(previous);

  return (next || []).map((s) => {
    const was = before.get(s.key);
    if (!was) {
      return {
        ...s,
        previousRank: null,
        rankDelta: 0,
        xpDelta: 0,
        isNew: !firstLoad,
      };
    }
    return {
      ...s,
      previousRank: was.rank,
      rankDelta: gainedPlaces(was.rank, s.rank),
      // A team score can legitimately fall: a member's XP is recalculated, a
      // student corrects which school they attend, a moderator removes an
      // entry. Reporting that as a negative gain would run the score counter
      // backwards on screen and read to the room as a penalty a school was
      // never given. The board shows what was gained, or nothing.
      xpDelta: Math.max(0, s.teamXp - was.teamXp),
      isNew: false,
    };
  });
}

/**
 * The schools that took a place off someone this tick, biggest climb first.
 *
 * This is what the screen calls out as a moment, so the ordering is the whole
 * point: the four-place jump has to be the one announced, not whichever climber
 * happens to sit highest in the list.
 */
export function overtakes(diffed: LiveStanding[]): LiveStanding[] {
  return (diffed || [])
    .filter((s) => s.rankDelta > 0)
    // Equal climbs are settled by where they landed, then by name, so a tie
    // cannot make the highlight reel flicker between two schools on a re-render.
    .sort((a, b) => b.rankDelta - a.rankDelta || a.rank - b.rank || a.label.localeCompare(b.label));
}
