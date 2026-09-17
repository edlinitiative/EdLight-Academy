/**
 * leaderboardAgg — pure aggregation for school / city / department leaderboards.
 *
 * Individual entries already carry a free-text `school`, `city` and
 * `department`. This groups them into ranked collectives (by TOTAL XP, with
 * member count + average as context) and supports drill-down (the members of
 * one school/city, ranked). Framework-free so web + mobile share it and it's
 * unit-testable.
 *
 * Free-text names are normalized for grouping ("Port-au-Prince" == "port au
 * prince" == "Pòtoprens"→ different, accents folded) but displayed with the
 * most common original spelling so the label reads naturally.
 */

export type GroupField = 'school' | 'city' | 'department';

export interface LeaderboardEntry {
  id?: string;
  uid?: string;
  displayName?: string;
  xp?: number;
  level?: number;
  school?: string;
  city?: string;
  department?: string;
}

export interface GroupMember {
  uid: string;
  displayName: string;
  xp: number;
}

export interface GroupRanking {
  /** Stable grouping key (normalized) — safe for React keys and lookups. */
  key: string;
  /** Human label (most common original spelling). */
  label: string;
  totalXp: number;
  members: number;
  avgXp: number;
  rank: number;
  /** Top members within the group, XP desc (for drill-down previews). */
  topMembers: GroupMember[];
}

/** Grouping key: trim, collapse inner whitespace, fold accents, lowercase. */
export function normalizeName(raw?: string): string {
  if (!raw) return '';
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const xpOf = (e: LeaderboardEntry) => (typeof e.xp === 'number' && isFinite(e.xp) && e.xp > 0 ? e.xp : 0);
const nameOf = (e: LeaderboardEntry) => (e.displayName || '').trim();

/**
 * Rank collectives (schools/cities/departments) by total member XP.
 * Entries with a blank field, no valid display name, or zero XP are skipped.
 * `topN` caps how many members ride along on each group for previews.
 */
export function aggregateBy(
  entries: LeaderboardEntry[],
  field: GroupField,
  topN = 5,
): GroupRanking[] {
  const groups = new Map<
    string,
    { total: number; labelCounts: Map<string, number>; members: GroupMember[] }
  >();

  for (const e of entries || []) {
    const original = (e[field] || '').trim();
    const key = normalizeName(original);
    if (!key) continue; // no school/city on this entry
    if (!nameOf(e)) continue; // hidden (no valid alias)
    const xp = xpOf(e);

    let g = groups.get(key);
    if (!g) {
      g = { total: 0, labelCounts: new Map(), members: [] };
      groups.set(key, g);
    }
    g.total += xp;
    g.labelCounts.set(original, (g.labelCounts.get(original) || 0) + 1);
    g.members.push({ uid: e.uid || e.id || '', displayName: nameOf(e), xp });
  }

  const rankings: GroupRanking[] = [];
  for (const [key, g] of groups) {
    // Most common original spelling wins as the display label.
    let label = key;
    let best = -1;
    for (const [name, count] of g.labelCounts) {
      if (count > best) { best = count; label = name; }
    }
    const members = g.members.length;
    rankings.push({
      key,
      label,
      totalXp: g.total,
      members,
      avgXp: members ? Math.round(g.total / members) : 0,
      rank: 0,
      topMembers: [...g.members].sort((a, b) => b.xp - a.xp).slice(0, topN),
    });
  }

  rankings.sort((a, b) => b.totalXp - a.totalXp || b.members - a.members || a.label.localeCompare(b.label));
  rankings.forEach((r, i) => { r.rank = i + 1; });
  return rankings;
}

/** All members of one group (by normalized key), ranked XP desc — for drill-down. */
export function membersOf(
  entries: LeaderboardEntry[],
  field: GroupField,
  key: string,
): GroupMember[] {
  const target = normalizeName(key);
  return (entries || [])
    .filter((e) => normalizeName(e[field]) === target && nameOf(e))
    .map((e) => ({ uid: e.uid || e.id || '', displayName: nameOf(e), xp: xpOf(e) }))
    .sort((a, b) => b.xp - a.xp);
}

/** The group (rank + stats) a given uid belongs to, or null. */
export function groupForUid(
  rankings: GroupRanking[],
  entries: LeaderboardEntry[],
  field: GroupField,
  uid: string,
): GroupRanking | null {
  const me = (entries || []).find((e) => (e.uid || e.id) === uid);
  if (!me) return null;
  const key = normalizeName(me[field]);
  if (!key) return null;
  return rankings.find((r) => r.key === key) || null;
}

// ── Team scoring: a school's best five ──────────────────────────────────────

/**
 * How many students make up a school's score, and the minimum to compete.
 *
 * Ranking schools on their TOTAL is the obvious choice and it breaks the
 * competition: the biggest school in Port-au-Prince wins every week and a
 * hundred smaller schools learn there is no point turning up. Ranking on the
 * AVERAGE breaks it the other way — one strong student carries a school of
 * three, and a school that brings fifty students of mixed ability is punished
 * for the turnout we are trying to create.
 *
 * So a school is scored on its best five, the way cross-country running scores
 * a team. One exceptional student cannot carry a school; bringing more students
 * can never hurt; and a school needs five players before it can win anything.
 *
 * That minimum is the recruiting message, and a far better one than a points
 * gap: "your school needs two more players to qualify" is something a student
 * can act on tonight.
 */
export const TEAM_SIZE = 5;

export interface TeamStanding {
  key: string;
  label: string;
  /** Sum of the best `teamSize` members' XP. */
  teamXp: number;
  /** How many members actually counted — below teamSize when the school is short. */
  counted: number;
  /** Everyone from the school on the board. */
  members: number;
  qualified: boolean;
  /** Players still needed to qualify. 0 once the school is eligible. */
  needed: number;
  /** 1-based among QUALIFIED schools; 0 when the school cannot yet compete. */
  rank: number;
}

/**
 * Rank schools on their best five. Unqualified schools keep a standing — they
 * need to see how close they are — but sort below every qualified school and
 * carry rank 0, because they are not in the running yet.
 */
export function rankTeams(
  groups: GroupRanking[],
  opts: { teamSize?: number } = {},
): TeamStanding[] {
  const teamSize = opts.teamSize ?? TEAM_SIZE;

  const standings: TeamStanding[] = (groups || []).map((g) => {
    // topMembers arrives XP-desc from aggregateBy, but sorting again costs
    // nothing and means a caller that built groups by hand still scores right.
    const best = [...(g.topMembers || [])].sort((a, b) => b.xp - a.xp).slice(0, teamSize);
    const counted = best.length;
    return {
      key: g.key,
      label: g.label,
      teamXp: best.reduce((n, m) => n + (m.xp || 0), 0),
      counted,
      members: g.members,
      qualified: g.members >= teamSize,
      needed: Math.max(0, teamSize - g.members),
      rank: 0,
    };
  });

  standings.sort((a, b) => {
    if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
    return b.teamXp - a.teamXp
      || b.members - a.members
      || a.label.localeCompare(b.label);
  });

  let rank = 0;
  for (const s of standings) if (s.qualified) s.rank = ++rank;
  return standings;
}

/** One school's standing among the ranked teams, or null when it is absent. */
export function teamStandingFor(
  standings: TeamStanding[],
  key: string | null | undefined,
): TeamStanding | null {
  if (!key) return null;
  const target = normalizeName(key);
  return standings.find((s) => s.key === target) ?? null;
}
