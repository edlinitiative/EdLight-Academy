import type { TeamStanding } from '../../../../shared/leaderboardAgg';

/**
 * Who may stand on a podium (audit W4, 2026-10-17).
 *
 * A placement is something a school EARNS by qualifying (five players on the
 * board — shared/leaderboardAgg `rankTeams`). A school still recruiting keeps
 * a visible standing, but it is never numbered as a placement and never
 * lifted onto a ceremonial step to fill a podium that has fewer than three
 * qualified schools. This only splits the board for display; it does not
 * change who qualifies or how anyone is ranked.
 */
export interface PodiumSplit {
  /** Qualified schools in official rank order (rank 1…), at most `maxRanked`. */
  ranked: TeamStanding[];
  /** The three podium steps — only when at least three schools qualified. */
  podium: TeamStanding[];
  /** Qualified schools after the podium (or every ranked school when there is no podium). */
  rest: TeamStanding[];
  /** Schools still forming their team — unnumbered, closest to five first. */
  forming: TeamStanding[];
}

export function splitPodium(
  standings: readonly TeamStanding[],
  opts: { maxRanked?: number; maxForming?: number } = {},
): PodiumSplit {
  const maxRanked = opts.maxRanked ?? 8;
  const maxForming = opts.maxForming ?? 6;
  const ranked = standings
    .filter((s) => s.qualified && s.rank > 0)
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .slice(0, maxRanked);
  const forming = standings
    .filter((s) => !s.qualified)
    .slice()
    .sort((a, b) => (b.members - a.members) || (b.teamXp - a.teamXp) || a.label.localeCompare(b.label))
    .slice(0, maxForming);
  const podium = ranked.length >= 3 ? ranked.slice(0, 3) : [];
  const rest = podium.length ? ranked.slice(3) : ranked;
  return { ranked, podium, rest, forming };
}
