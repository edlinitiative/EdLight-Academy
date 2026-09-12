/**
 * A stored snapshot of the internal top-performers answer.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * `top-performers.ts` computed its answer from scratch on every request, and
 * the computation is two full scans of the database:
 *
 *   loadIdentityRows   3 queries capped at USER_SCAN_CAP      (5,000 each)
 *   loadAllEvidence    3 collection-group queries capped at
 *                      EVIDENCE_SCAN_CAP                     (20,000 each)
 *
 * Firestore bills per document RETURNED, so one call costs as many reads as
 * this project has users, mastery docs, exam results and quiz attempts —
 * up to 75,000 of them. `edlight-academy` is on the Spark plan, whose free
 * tier is 50,000 reads per DAY. A single request could therefore exhaust the
 * day, and a handful certainly did: the endpoint started answering
 * `lookup_failed`, which is this handler's catch-all flattening a
 * RESOURCE_EXHAUSTED it could not distinguish from any other fault.
 *
 * Apply calls this endpoint every time a member of staff opens
 * /admin/scholars/candidates, and its own `?fresh=1` skips its cache. There was
 * no version of that traffic the quota could survive.
 *
 * ── One document instead of tens of thousands ───────────────────────────────
 * The computed ranking is written to a single document and served from it. A
 * cached call costs ONE read. A refresh costs the full scan plus one write,
 * and happens at most once per TTL.
 *
 * Writes are cheap here in a way reads are not: the Spark tier allows 20,000 a
 * day and this makes at most a couple of dozen.
 *
 * ── Why Firestore and not memory ────────────────────────────────────────────
 * These are serverless functions. A module-level Map is per-instance and dies
 * with the instance, so on a cold start — which is most calls, at this traffic
 * — it would scan again. The point is to survive cold starts, so the cache has
 * to live where the data does.
 *
 * ── Why it is not a cron ────────────────────────────────────────────────────
 * It could be, and refreshing on a schedule would be smoother. But Cloud
 * Functions are disabled on Spark, so a scheduled refresh would have to live in
 * another deployment; this needs no infrastructure and degrades the same way.
 */

import type { Firestore } from 'firebase-admin/firestore';

/** One document, not a collection: there is exactly one of these. */
export const PERFORMER_CACHE_PATH = 'internalCache/topPerformers';

/**
 * Half an hour.
 *
 * The question is "who are the top learners", asked by staff filling a licence
 * cohort. That ranking does not move meaningfully inside thirty minutes, and
 * the cost of being thirty minutes stale is nil next to the cost of being
 * unavailable for the rest of the day.
 */
export const PERFORMER_CACHE_TTL_MS = 30 * 60 * 1000;

export interface CachedPerformers {
  /** The whole response body, exactly as it was computed. */
  payload: unknown;
  computedAtMs: number;
}

export function isFresh(entry: CachedPerformers | null, nowMs: number): entry is CachedPerformers {
  return entry !== null && nowMs - entry.computedAtMs < PERFORMER_CACHE_TTL_MS;
}

export async function readPerformerCache(db: Firestore): Promise<CachedPerformers | null> {
  const snap = await db.doc(PERFORMER_CACHE_PATH).get();
  if (!snap.exists) return null;
  const data = snap.data() as Partial<CachedPerformers> | undefined;
  if (!data || typeof data.computedAtMs !== 'number' || data.payload === undefined) return null;
  return { payload: data.payload, computedAtMs: data.computedAtMs };
}

/**
 * Never throws.
 *
 * A refresh that cannot be stored is still a refresh: the caller already has
 * the answer and should return it. Failing the request because the CACHE could
 * not be written would turn a cost problem into an availability one.
 */
export async function writePerformerCache(
  db: Firestore,
  payload: unknown,
  nowMs: number
): Promise<void> {
  try {
    await db.doc(PERFORMER_CACHE_PATH).set({ payload, computedAtMs: nowMs });
  } catch (err) {
    console.error('[internal/top-performers] could not store cache:', err);
  }
}

/**
 * Did this fail because the project is out of Firestore quota?
 *
 * Worth separating from every other fault, because it is the one the caller can
 * neither retry nor fix, and the one whose remedy is a billing plan rather than
 * a code change. `lookup_failed` for all faults alike is what made this take a
 * day to find: Apply's console said "EdLight Academy is not available right
 * now" while the actual message, two projects away, was "Quota exceeded".
 */
export function isQuotaExhausted(err: unknown): boolean {
  // google-gax surfaces gRPC status 8 (RESOURCE_EXHAUSTED) as a numeric `code`.
  const code = (err as { code?: unknown } | null)?.code;
  if (code === 8) return true;
  return /RESOURCE_EXHAUSTED|Quota exceeded/i.test(
    err instanceof Error ? err.message : String(err ?? '')
  );
}
