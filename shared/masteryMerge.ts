import type { LessonProgress, ProgressMap } from './mastery';

/**
 * Merging local and server mastery.
 *
 * SHARED: used by BOTH the web app and the mobile app
 * (mobile/src/utils/masteryMerge.ts re-exports it). Both platforms write the
 * SAME document — users/{uid}/mastery/lessons — so a lesson practised on the
 * web has to be joinable with the same lesson practised on the phone. Keeping
 * one merge means neither platform can invent its own idea of "later wins".
 *
 * This is the part that makes syncing mastery genuinely easy, and it is worth
 * stating why: **every field in a mastery record only ever moves one way.**
 * `bestPct` is a maximum, `completed` never un-completes, `masteredAt` is a
 * one-time stamp. Because of that the merge is a lattice join, not a conflict
 * resolution — there is no "who wrote last" question to get wrong, and two
 * devices that studied different lessons offline both keep their work.
 *
 * Contrast with last-write-wins on the whole map, which is what a naive sync
 * would do: study on your phone, open the tablet you last used in June, and the
 * tablet's stale map overwrites everything. That failure mode is impossible here.
 */

/** Earliest of two timestamps, ignoring absent ones. */
function earliest(a?: number, b?: number): number | undefined {
  if (a == null) return b ?? undefined;
  if (b == null) return a;
  return Math.min(a, b);
}

/** Latest of two timestamps, ignoring absent ones. */
function latest(a?: number, b?: number): number | undefined {
  if (a == null) return b ?? undefined;
  if (b == null) return a;
  return Math.max(a, b);
}

/** Join two records for the same lesson. Never loses progress from either side. */
export function mergeLesson(a?: LessonProgress, b?: LessonProgress): LessonProgress {
  const merged: LessonProgress = {};
  if (a?.completed || b?.completed) merged.completed = true;

  const bestPct = Math.max(
    typeof a?.bestPct === 'number' ? a.bestPct : -1,
    typeof b?.bestPct === 'number' ? b.bestPct : -1,
  );
  if (bestPct >= 0) merged.bestPct = bestPct;

  // Mastery is an achievement: keep the date it was first earned.
  const masteredAt = earliest(a?.masteredAt, b?.masteredAt);
  if (masteredAt != null) merged.masteredAt = masteredAt;

  // The last level change is a "what's new" signal — the most recent one wins.
  const levelUpAt = latest(a?.levelUpAt, b?.levelUpAt);
  if (levelUpAt != null) merged.levelUpAt = levelUpAt;

  return merged;
}

/** Join two whole maps. Lessons present on only one side are carried through. */
export function mergeProgress(local: ProgressMap, remote: ProgressMap): ProgressMap {
  const out: ProgressMap = {};
  for (const id of new Set([...Object.keys(local ?? {}), ...Object.keys(remote ?? {})])) {
    out[id] = mergeLesson(local?.[id], remote?.[id]);
  }
  return out;
}

/** True when the two maps carry the same mastery — used to skip pointless writes. */
export function sameProgress(a: ProgressMap, b: ProgressMap): boolean {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const id of keys) {
    const x = a?.[id];
    const y = b?.[id];
    if (!!x?.completed !== !!y?.completed) return false;
    if ((x?.bestPct ?? -1) !== (y?.bestPct ?? -1)) return false;
    if ((x?.masteredAt ?? 0) !== (y?.masteredAt ?? 0)) return false;
  }
  return true;
}

/**
 * Firestore rejects `undefined`, and the store's records legitimately carry
 * absent fields. Strip them, and drop lessons that say nothing at all so an
 * empty touch never grows the document.
 */
export function toWireFormat(progress: ProgressMap): Record<string, LessonProgress> {
  const out: Record<string, LessonProgress> = {};
  for (const [id, rec] of Object.entries(progress ?? {})) {
    if (!rec) continue;
    const clean: LessonProgress = {};
    if (rec.completed) clean.completed = true;
    if (typeof rec.bestPct === 'number') clean.bestPct = rec.bestPct;
    if (typeof rec.masteredAt === 'number') clean.masteredAt = rec.masteredAt;
    if (typeof rec.levelUpAt === 'number') clean.levelUpAt = rec.levelUpAt;
    if (Object.keys(clean).length > 0) out[id] = clean;
  }
  return out;
}

/**
 * WHERE the merged map lives: `users/{uid}/mastery/lessons`.
 *
 * Both platforms must read and write the SAME document or mastery stops being
 * one claim about a student — the web and the phone would each keep half a
 * term's work and never disagree loudly enough to notice. That already nearly
 * happened once (the web was built against a per-course `progress` doc), so
 * the path is a shared constant rather than a string typed out twice.
 */
export const MASTERY_PATH = { collection: 'mastery', doc: 'lessons' } as const;
