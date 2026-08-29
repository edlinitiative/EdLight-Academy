/**
 * Review model — the questions a student got wrong, kept until they get them
 * right.
 *
 * Mastery (utils/mastery) records how far a lesson has come; this records the
 * one thing mastery deliberately forgets: WHICH questions were missed. Without
 * it, a student who forgot one concept has to replay a whole lesson to find it.
 * With it, "Revizyon" can hand them exactly their own mistakes.
 *
 * An entry lives under the question's quiz-bank id and carries two timestamps:
 *
 *   missedAt   the last time the question was answered wrong
 *   correctAt  the last time it was answered right
 *
 * A question is DUE when it was missed more recently than it was answered
 * right. Answering it correctly in any context (a lesson's exercises, a chapter
 * test, a review session) resolves it — the point is knowing the thing, not
 * clearing a queue.
 *
 * Both timestamps only ever move forward, so merging two devices is the same
 * lattice join as mastery: take the latest of each, and nobody's work is lost.
 *
 * Everything here is pure; persistence lives in the store, sync in
 * services/masterySync.
 */

export type ReviewEntry = {
  /** Epoch ms of the last wrong answer. */
  missedAt?: number;
  /** Epoch ms of the last correct answer. */
  correctAt?: number;
  /** Where the question lives in the quiz bank, so a session can rebuild it. */
  subjectCode?: string;
  unitNo?: number;
  /** The lesson it counts toward, for "revise [lesson]" copy. */
  lessonId?: string;
};

export type ReviewMap = Record<string, ReviewEntry | undefined>;

/** Resolved entries older than this are dropped — they've served their purpose. */
export const RESOLVED_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Missed more recently than answered right. */
export function isDue(e?: ReviewEntry | null): boolean {
  if (!e?.missedAt) return false;
  return !e.correctAt || e.missedAt > e.correctAt;
}

/** Ids of due questions, most recently missed first. */
export function dueQuestionIds(map: ReviewMap): string[] {
  return Object.entries(map ?? {})
    .filter(([, e]) => isDue(e))
    .sort((a, b) => (b[1]?.missedAt ?? 0) - (a[1]?.missedAt ?? 0))
    .map(([id]) => id);
}

export type ReviewMeta = Pick<ReviewEntry, 'subjectCode' | 'unitNo' | 'lessonId'>;

/**
 * Record one answered question. A wrong answer stamps `missedAt`; a right
 * answer stamps `correctAt`, but only when the question was ever missed — a
 * student answering fresh questions correctly should not grow this map at all.
 * Returns `null` when nothing changed, so callers can skip a write.
 */
export function applyReviewOutcome(
  prev: ReviewEntry | undefined,
  correct: boolean,
  now: number,
  meta?: ReviewMeta,
): ReviewEntry | null {
  if (correct && !prev?.missedAt) return null;
  const next: ReviewEntry = { ...prev };
  if (correct) next.correctAt = Math.max(prev?.correctAt ?? 0, now);
  else next.missedAt = Math.max(prev?.missedAt ?? 0, now);
  if (meta?.subjectCode && !next.subjectCode) next.subjectCode = meta.subjectCode;
  if (meta?.unitNo != null && next.unitNo == null) next.unitNo = meta.unitNo;
  if (meta?.lessonId && !next.lessonId) next.lessonId = meta.lessonId;
  return next;
}

/**
 * Drop resolved entries once they're old news. Deterministic in (map, now), so
 * two devices pruning independently converge instead of ping-ponging entries
 * through the sync. Due entries are never dropped — a mistake from months ago
 * that was never fixed is still a mistake.
 */
export function pruneReview(map: ReviewMap, now: number): ReviewMap {
  const out: ReviewMap = {};
  for (const [id, e] of Object.entries(map ?? {})) {
    if (!e) continue;
    if (!isDue(e) && (e.correctAt ?? 0) < now - RESOLVED_TTL_MS) continue;
    out[id] = e;
  }
  return out;
}

/** Join two entries for the same question. Timestamps only move forward. */
export function mergeReviewEntry(a?: ReviewEntry, b?: ReviewEntry): ReviewEntry {
  const merged: ReviewEntry = {};
  const missedAt = Math.max(a?.missedAt ?? 0, b?.missedAt ?? 0);
  if (missedAt > 0) merged.missedAt = missedAt;
  const correctAt = Math.max(a?.correctAt ?? 0, b?.correctAt ?? 0);
  if (correctAt > 0) merged.correctAt = correctAt;
  const subjectCode = a?.subjectCode ?? b?.subjectCode;
  if (subjectCode) merged.subjectCode = subjectCode;
  const unitNo = a?.unitNo ?? b?.unitNo;
  if (unitNo != null) merged.unitNo = unitNo;
  const lessonId = a?.lessonId ?? b?.lessonId;
  if (lessonId) merged.lessonId = lessonId;
  return merged;
}

/** Join two maps. Questions present on only one side are carried through. */
export function mergeReview(local: ReviewMap, remote: ReviewMap): ReviewMap {
  const out: ReviewMap = {};
  for (const id of new Set([...Object.keys(local ?? {}), ...Object.keys(remote ?? {})])) {
    out[id] = mergeReviewEntry(local?.[id], remote?.[id]);
  }
  return out;
}

/** True when both maps say the same thing — used to skip pointless writes. */
export function sameReview(a: ReviewMap, b: ReviewMap): boolean {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const id of keys) {
    const x = a?.[id];
    const y = b?.[id];
    if ((x?.missedAt ?? 0) !== (y?.missedAt ?? 0)) return false;
    if ((x?.correctAt ?? 0) !== (y?.correctAt ?? 0)) return false;
  }
  return true;
}

/** Strip `undefined` fields (Firestore rejects them) and empty entries. */
export function toReviewWire(map: ReviewMap): Record<string, ReviewEntry> {
  const out: Record<string, ReviewEntry> = {};
  for (const [id, e] of Object.entries(map ?? {})) {
    if (!e) continue;
    const clean: ReviewEntry = {};
    if (typeof e.missedAt === 'number') clean.missedAt = e.missedAt;
    if (typeof e.correctAt === 'number') clean.correctAt = e.correctAt;
    if (e.subjectCode) clean.subjectCode = e.subjectCode;
    if (typeof e.unitNo === 'number') clean.unitNo = e.unitNo;
    if (e.lessonId) clean.lessonId = e.lessonId;
    if (Object.keys(clean).length > 0) out[id] = clean;
  }
  return out;
}
