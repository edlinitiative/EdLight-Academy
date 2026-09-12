/**
 * The snapshot that stopped one request from costing a day's quota.
 *
 * `top-performers` recomputed from scratch on every call, and the computation
 * is two full scans: three identity queries capped at 5,000 and three
 * collection-group evidence queries capped at 20,000. Firestore bills per
 * document returned, so one call could cost up to 75,000 reads against a Spark
 * tier that allows 50,000 a DAY. Apply calls this endpoint whenever staff open
 * /admin/scholars/candidates. The project ran out, and every fault came back as
 * `lookup_failed`, so the console two projects away said only "not available".
 */
import {
  PERFORMER_CACHE_TTL_MS,
  isFresh,
  isQuotaExhausted,
  readPerformerCache,
  writePerformerCache,
  type CachedPerformers,
} from '../_lib/internalPerformerCache';

const NOW = 1_800_000_000_000;

describe('the performer snapshot', () => {
  it('is stale exactly at the TTL, not after a grace period', () => {
    const at = (ageMs: number): CachedPerformers => ({
      payload: { rows: [] },
      computedAtMs: NOW - ageMs,
    });
    expect(isFresh(at(0), NOW)).toBe(true);
    expect(isFresh(at(PERFORMER_CACHE_TTL_MS - 1), NOW)).toBe(true);
    expect(isFresh(at(PERFORMER_CACHE_TTL_MS), NOW)).toBe(false);
    expect(isFresh(null, NOW)).toBe(false);
  });

  it('treats a half-written document as no cache at all', async () => {
    // Serving `undefined` rows as a hit would answer with an empty leaderboard
    // and look like "nobody qualified", which is worse than recomputing.
    for (const data of [undefined, {}, { payload: { rows: [] } }, { computedAtMs: NOW }]) {
      const db = { doc: () => ({ get: async () => ({ exists: true, data: () => data }) }) };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(await readPerformerCache(db as any)).toBeNull();
    }
  });

  it('reads nothing when the document does not exist yet', async () => {
    const db = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }) }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await readPerformerCache(db as any)).toBeNull();
  });

  it('returns a complete document', async () => {
    const payload = { rows: [{ id: 'u1' }] };
    const db = {
      doc: () => ({ get: async () => ({ exists: true, data: () => ({ payload, computedAtMs: NOW }) }) }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await readPerformerCache(db as any)).toEqual({ payload, computedAtMs: NOW });
  });

  it('does not fail the request when the cache cannot be written', async () => {
    // The caller already has the answer. Failing because the CACHE could not be
    // stored would turn a cost problem into an availability one.
    const db = { doc: () => ({ set: async () => { throw new Error('permission denied'); } }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(writePerformerCache(db as any, { rows: [] }, NOW)).resolves.toBeUndefined();
  });
});

describe('recognising an exhausted quota', () => {
  it('reads the gRPC status code', () => {
    // google-gax surfaces RESOURCE_EXHAUSTED as numeric code 8.
    expect(isQuotaExhausted(Object.assign(new Error('boom'), { code: 8 }))).toBe(true);
  });

  it('reads the message when there is no code', () => {
    expect(isQuotaExhausted(new Error('8 RESOURCE_EXHAUSTED: Quota exceeded.'))).toBe(true);
    expect(isQuotaExhausted('Quota exceeded')).toBe(true);
  });

  it('does not claim every failure is the quota', () => {
    // Reporting a permission or network fault as "out of quota until midnight"
    // sends somebody to the billing console for a problem that is not there.
    expect(isQuotaExhausted(new Error('permission denied'))).toBe(false);
    expect(isQuotaExhausted(Object.assign(new Error('unavailable'), { code: 14 }))).toBe(false);
    expect(isQuotaExhausted(null)).toBe(false);
    expect(isQuotaExhausted(undefined)).toBe(false);
  });
});
