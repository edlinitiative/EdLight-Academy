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
