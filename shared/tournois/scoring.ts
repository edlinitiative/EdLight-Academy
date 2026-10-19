/**
 * tournois/scoring — points for one answer, and the standings rebuilt from the
 * per-player rows. Pure: every timestamp is passed in.
 *
 * Same principle as the Arène (shared/arena/scoring.ts): correctness first,
 * speed as a TIER not a curve — a continuous speed bonus ranks connections as
 * much as knowledge. The tiers here scale with the question's own time because
 * a creator can pick 10 s or 30 s per question.
 */
import { rankTeams, normalizeName, type GroupRanking, type TeamStanding } from '../leaderboardAgg';
import { TEAM_AVERAGE_MIN, type TeamAggregate, type TeamRule } from './config';

export const POINTS_FULL = 1000;
export const POINTS_HALF = 500;
/** Within the first half of the question's time: full points. */
export const FULL_TIER_SHARE = 0.5;
/** How much later than `opensAt` a client may claim the question painted (live). */
export const RENDER_GRACE_MS = 3_000;

export interface ScoredAnswer {
  points: number;
  elapsedMs: number;
  tier: 'full' | 'half' | 'none';
}

/**
 * Score one answer.
 *
 * `startedAt` is when the clock started for this player: the server's
 * `servedAt` for a round attempt, or — live — the client's reported paint time
 * clamped into [opensAt, opensAt + RENDER_GRACE_MS].
 */
export function scoreAnswer(opts: {
  correct: boolean;
  startedAt: number;
  receivedAt: number;
  questionMs: number;
  late: boolean;
}): ScoredAnswer {
  const elapsedMs = Math.max(0, opts.receivedAt - opts.startedAt);
  if (!opts.correct || opts.late) return { points: 0, elapsedMs, tier: 'none' };
  if (elapsedMs <= opts.questionMs * FULL_TIER_SHARE) return { points: POINTS_FULL, elapsedMs, tier: 'full' };
  return { points: POINTS_HALF, elapsedMs, tier: 'half' };
}

/** Live: where the clock starts for a client that says it painted at `clientShownAt`. */
export function clampLiveStart(opensAt: number, clientShownAt: unknown): number {
  const shown = typeof clientShownAt === 'number' && Number.isFinite(clientShownAt) ? clientShownAt : opensAt;
  return Math.min(Math.max(shown, opensAt), opensAt + RENDER_GRACE_MS);
}

// ── Standings ───────────────────────────────────────────────────────────────

export interface PlayerRow {
  uid: string;
  displayName: string;
  school?: string | null;
  grade?: string | null;
  /** Verified class team key (a hash of the class id, never the id) and its label. */
  classKey?: string | null;
  classLabel?: string | null;
  points: number;
  correct: number;
  answered: number;
  totalMs: number;
}

export interface RankedPlayer extends PlayerRow {
  rank: number;
}

/** Points, then correct answers, then less total time, then name (stable). */
export function comparePlayers(a: PlayerRow, b: PlayerRow): number {
  return b.points - a.points
    || b.correct - a.correct
    || a.totalMs - b.totalMs
    || a.displayName.localeCompare(b.displayName);
}

export function rankPlayers(rows: PlayerRow[]): RankedPlayer[] {
  const sorted = [...rows].sort(comparePlayers);
  let rank = 0;
  let prev: PlayerRow | null = null;
  return sorted.map((r, i) => {
    // Equal on every scored criterion → same rank.
    if (!prev || prev.points !== r.points || prev.correct !== r.correct || prev.totalMs !== r.totalMs) rank = i + 1;
    prev = r;
    return { ...r, rank };
  });
}

/** Team key for a player under a team rule, or null when they have none. */
export function teamKeyFor(rule: TeamRule, row: Pick<PlayerRow, 'school' | 'grade' | 'classKey' | 'classLabel'>): { key: string; label: string } | null {
  if (rule === 'class') {
    return row.classKey ? { key: row.classKey, label: (row.classLabel || '').trim() || row.classKey } : null;
  }
  if (rule === 'school') {
    const label = (row.school || '').trim();
    return label ? { key: normalizeName(label), label } : null;
  }
  if (rule === 'grade') {
    const label = (row.grade || '').trim();
    return label ? { key: label.toLowerCase(), label } : null;
  }
  return null;
}

/**
 * School vs school / class vs class: each team is scored on its best
 * `teamSize` players — the Arène's rule, via the same `rankTeams`, so a team
 * cannot win on turnout and one star cannot carry it.
 */
export function rankTournamentTeams(rule: TeamRule, teamSize: number, rows: PlayerRow[], aggregate: TeamAggregate = 'sum'): TeamStanding[] {
  if (rule === 'solo' || teamSize <= 0) return [];
  if (aggregate === 'average') return rankAverageTeams(rule, teamSize, rows);
  const groups = new Map<string, GroupRanking>();
  for (const r of rows) {
    const team = teamKeyFor(rule, r);
    if (!team) continue;
    const g = groups.get(team.key) || {
      key: team.key, label: team.label, totalXp: 0, members: 0, avgXp: 0, rank: 0, topMembers: [],
    };
    g.totalXp += r.points;
    g.members += 1;
    g.topMembers.push({ uid: r.uid, displayName: r.displayName, xp: r.points });
    groups.set(team.key, g);
  }
  return rankTeams([...groups.values()], { teamSize });
}

/**
 * Mean of each team's best `teamSize` players who answered at least once.
 * Turnout beyond N earns nothing and a short team is not penalised for size:
 * it qualifies with TEAM_AVERAGE_MIN(N) players. Scores are whole points.
 */
export function rankAverageTeams(rule: TeamRule, teamSize: number, rows: PlayerRow[]): TeamStanding[] {
  const minimum = TEAM_AVERAGE_MIN(teamSize);
  const groups = new Map<string, { key: string; label: string; members: number; played: number[] }>();
  for (const r of rows) {
    const team = teamKeyFor(rule, r);
    if (!team) continue;
    const g = groups.get(team.key) || { key: team.key, label: team.label, members: 0, played: [] };
    g.members += 1;
    if ((r.answered || 0) > 0) g.played.push(r.points || 0);
    groups.set(team.key, g);
  }
  const standings: TeamStanding[] = [...groups.values()].map((g) => {
    const best = g.played.sort((a, b) => b - a).slice(0, teamSize);
    const counted = best.length;
    return {
      key: g.key, label: g.label,
      teamXp: counted ? Math.round(best.reduce((n, v) => n + v, 0) / counted) : 0,
      counted, members: g.members, qualified: counted >= minimum, needed: Math.max(0, minimum - counted), rank: 0,
    };
  });
  standings.sort((a, b) => (a.qualified !== b.qualified ? (a.qualified ? -1 : 1) : 0)
    || b.teamXp - a.teamXp || b.counted - a.counted || a.label.localeCompare(b.label));
  let rank = 0;
  standings.forEach((s, i) => {
    if (!s.qualified) return;
    const prev = standings[i - 1];
    rank = prev && prev.qualified && prev.teamXp === s.teamXp && prev.counted === s.counted ? rank : rank + 1;
    s.rank = rank;
  });
  return standings;
}
