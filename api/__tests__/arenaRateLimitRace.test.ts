/**
 * checkRateLimit's own race, and the fix for it.
 *
 * CORRECTION, from an external audit: the check (read the count) and the
 * increment used to be two separate Firestore calls — `ref.get()` then
 * `ref.update()`. Two requests close enough together both read a count under
 * the cap, both passed, and both incremented, so the real ceiling was
 * "however many requests happened to race", not `limit.max`. This file is
 * a separate module from arenaRateLimit.test.ts because it needs a
 * `getDb()` that returns a working fake instead of one that throws.
 *
 * The fake below is not just "runs the callback" (arenaEvents.test.ts's fake
 * is, deliberately, and says why in its own header) — it tracks a version per
 * document and RE-RUNS the transaction body if a document it read has since
 * changed, the same optimistic-concurrency retry real Firestore does. That
 * retry is exactly the mechanism the fix depends on: without it, this test
 * cannot tell the old code from the new, because both would read the same
 * pre-race snapshot. `commitBoard`'s freshness check does not need that
 * (it is correct no matter what order transactions happen to run in), which
 * is why its test fake gets away with running bodies straight through. A
 * bare read-then-write rate limiter has no such freshness marker of its
 * own — its safety IS the transaction's retry — so the fake has to have one.
 */
jest.mock('../_lib/firebaseAdmin', () => ({
  isAdminConfigured: () => true,
  getDb: () => mockDb,
}));

import { checkRateLimit } from '../_lib/rateLimit';

interface StoredDoc { data: Record<string, unknown>; version: number }
interface Ref { id: string }

function isIncrement(v: unknown): v is { operand: number } {
  return !!v && typeof v === 'object' && typeof (v as { operand?: unknown }).operand === 'number';
}

function makeFakeDb() {
  const store = new Map<string, StoredDoc>();

  const applyPatch = (cur: Record<string, unknown>, patch: Record<string, unknown>) => {
    const next = { ...cur };
    for (const [k, v] of Object.entries(patch)) {
      next[k] = isIncrement(v) ? (Number(cur[k]) || 0) + v.operand : v;
    }
    return next;
  };

  async function runTransaction<T>(fn: (tx: {
    get: (ref: Ref) => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>;
    set: (ref: Ref, data: Record<string, unknown>) => void;
    update: (ref: Ref, patch: Record<string, unknown>) => void;
  }) => Promise<T>): Promise<T> {
    for (;;) {
      const readVersions = new Map<string, number>();
      const writes: Array<() => void> = [];

      const tx = {
        get: async (ref: Ref) => {
          const entry = store.get(ref.id);
          readVersions.set(ref.id, entry?.version ?? 0);
          const snapshotData = entry ? { ...entry.data } : undefined;
          return { exists: !!entry, data: () => snapshotData };
        },
        set: (ref: Ref, data: Record<string, unknown>) => {
          writes.push(() => {
            const cur = store.get(ref.id);
            store.set(ref.id, { data, version: (cur?.version ?? 0) + 1 });
          });
        },
        update: (ref: Ref, patch: Record<string, unknown>) => {
          writes.push(() => {
            const cur = store.get(ref.id);
            store.set(ref.id, {
              data: applyPatch(cur?.data ?? {}, patch),
              version: (cur?.version ?? 0) + 1,
            });
          });
        },
      };

      const result = await fn(tx);

      const conflicted = [...readVersions].some(
        ([id, seenVersion]) => (store.get(id)?.version ?? 0) !== seenVersion,
      );
      if (conflicted) continue; // a real transaction retries the whole callback

      for (const write of writes) write();
      return result;
    }
  }

  const fakeDb = {
    collection: () => ({ doc: (id: string) => ({ id }) }),
    runTransaction,
    _store: store,
  };
  return fakeDb;
}

// Named with the `mock` prefix Jest's hoisting check requires: jest.mock()'s
// factory above (hoisted to the top of the module) closes over this.
const mockDb = makeFakeDb();

describe('CLOSED: concurrent requests can no longer push the count past the cap', () => {
  afterEach(() => {
    (mockDb as ReturnType<typeof makeFakeDb>)._store.clear();
  });

  it('admits exactly limit.max requests when far more than that arrive at once', async () => {
    // arena-doors-close: { max: 20, windowSec: 3600 } — an admin's console
    // double-tapping "freeze now" while a retry is also in flight is exactly
    // the shape of concurrency this endpoint sees in practice.
    const swarm = Array.from({ length: 35 }, () => checkRateLimit('admin1', 'arena-doors-close'));
    const results = await Promise.all(swarm);

    const allowed = results.filter((r) => r.allowed).length;
    expect(allowed).toBe(20);
    expect(results.length - allowed).toBe(15);
  });

  it('never stores a count above limit.max, however many races land on the same window', async () => {
    const swarm = Array.from({ length: 35 }, () => checkRateLimit('admin2', 'arena-doors-close'));
    await Promise.all(swarm);

    const stored = (mockDb as ReturnType<typeof makeFakeDb>)._store.get('admin2_arena-doors-close');
    expect(stored?.data.count).toBe(20);
  });

  it('keeps the same guarantee for a fresh window (no pre-existing document)', async () => {
    // The first-hit-in-a-window branch (tx.set, not tx.update) is the other
    // half of the fix — it has to retry-and-recheck too, or the very first
    // burst of a new hour could itself overshoot.
    const swarm = Array.from({ length: 8 }, () => checkRateLimit('admin3', 'arena-claim'));
    const results = await Promise.all(swarm);
    // arena-claim: { max: 20, windowSec: 3600 } — 8 concurrent requests, all
    // under the cap, must all be admitted with correctly decreasing `remaining`.
    expect(results.every((r) => r.allowed)).toBe(true);
    const remainings = results.map((r) => r.remaining).sort((a, b) => b - a);
    expect(remainings).toEqual([19, 18, 17, 16, 15, 14, 13, 12]);
  });
});
