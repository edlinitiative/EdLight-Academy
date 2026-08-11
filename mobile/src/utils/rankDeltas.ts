/**
 * Day-over-day rank movement for the leaderboard (the ▲2 / ▼1 chips).
 *
 * The board has no server-side history, so each device keeps a tiny local
 * snapshot: the ranks as first seen on a given day. When a new day starts, the
 * old snapshot becomes the baseline and deltas are computed against it. The
 * snapshot is keyed to the week id — a new week starts everyone fresh (no
 * arrows), matching the Monday reset.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORE_KEY = 'leaderboard-rank-snapshot-v1';

export interface RankSnapshot {
  week: string;
  /** Local YYYY-MM-DD the `ranks` below were first seen. */
  date: string;
  /** rank per entry id, as of the morning of `date`. */
  ranks: Record<string, number>;
  /** The previous day's snapshot — the baseline deltas are computed against. */
  prev?: { date: string; ranks: Record<string, number> };
}

export function localDayKey(now = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

/** rank delta per id vs a baseline; positive = climbed. Ids absent from the
 *  baseline (new entrants) get no delta. */
export function diffRanks(
  baseline: Record<string, number> | undefined,
  current: Record<string, number>,
): Record<string, number> {
  if (!baseline) return {};
  const out: Record<string, number> = {};
  for (const [id, rank] of Object.entries(current)) {
    const before = baseline[id];
    if (before != null && before !== rank) out[id] = before - rank;
  }
  return out;
}

/**
 * Pure day-rollover step: given the stored snapshot and today's board, return
 * the snapshot to store and the baseline to diff against.
 * - new week or no snapshot → start fresh, no baseline;
 * - same day → keep the snapshot as-is (ranks stay "as of this morning");
 * - new day → yesterday's ranks become the baseline (prev).
 */
export function advanceSnapshot(
  stored: RankSnapshot | null,
  week: string,
  today: string,
  ranks: Record<string, number>,
): { next: RankSnapshot; baseline?: Record<string, number> } {
  if (!stored || stored.week !== week) {
    return { next: { week, date: today, ranks } };
  }
  if (stored.date === today) {
    return { next: stored, baseline: stored.prev?.ranks };
  }
  return {
    next: { week, date: today, ranks, prev: { date: stored.date, ranks: stored.ranks } },
    baseline: stored.ranks,
  };
}

/**
 * Load/advance the persisted snapshot for `week` and return the deltas for
 * `entries` (entries need `id` and `rank`). Best-effort: {} on storage errors.
 */
export async function computeRankDeltas(
  week: string,
  entries: { id: string; rank: number }[],
): Promise<Record<string, number>> {
  if (!entries.length) return {};
  const ranks: Record<string, number> = {};
  for (const e of entries) ranks[e.id] = e.rank;
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    const stored: RankSnapshot | null = raw ? JSON.parse(raw) : null;
    const { next, baseline } = advanceSnapshot(stored, week, localDayKey(), ranks);
    if (next !== stored) await AsyncStorage.setItem(STORE_KEY, JSON.stringify(next));
    return diffRanks(baseline, ranks);
  } catch {
    return {};
  }
}
