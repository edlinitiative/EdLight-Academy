/**
 * shared/outbox — the persisted write queue that survives an app kill (L-3,
 * O-3) and retries leaderboard awards (D-3) without ever double-applying.
 */
import { createOutbox, memoryOutboxStorage, newOperationId } from '../../../shared/outbox';

const T0 = 1_900_000_000_000;

function setup(opts: Partial<Parameters<typeof createOutbox>[1]> = {}) {
  const storage = memoryOutboxStorage();
  let now = T0;
  const box = createOutbox(storage, { prefix: 'test-outbox', now: () => now, ...opts });
  return { box, storage, advance: (ms: number) => { now += ms; } };
}

describe('outbox', () => {
  it('persists an operation per account, so a new instance (an app relaunch) still sees it', async () => {
    const { box, storage } = setup();
    await box.enqueue('alice', { id: 'op1', kind: 'lesson-complete', payload: { lessonId: 'l1' } });
    const relaunched = createOutbox(storage, { prefix: 'test-outbox', now: () => T0 });
    expect((await relaunched.list('alice')).map((o) => o.id)).toEqual(['op1']);
    expect(await relaunched.list('bob')).toEqual([]);
  });

  it('is idempotent by operation id', async () => {
    const { box } = setup();
    await box.enqueue('alice', { id: 'op1', kind: 'k', payload: { n: 1 } });
    await box.enqueue('alice', { id: 'op1', kind: 'k', payload: { n: 2 } });
    const ops = await box.list('alice');
    expect(ops).toHaveLength(1);
    expect(ops[0].payload).toEqual({ n: 1 });
  });

  it('removes an operation only when its handler confirms it', async () => {
    const { box } = setup();
    await box.enqueue('alice', { id: 'ok', kind: 'k', payload: {} });
    await box.enqueue('alice', { id: 'later', kind: 'k', payload: {} });
    const res = await box.drain('alice', { k: async (op) => (op.id === 'ok' ? 'done' : 'retry') });
    expect(res).toMatchObject({ done: 1, remaining: 1 });
    const left = await box.list('alice');
    expect(left.map((o) => o.id)).toEqual(['later']);
    expect(left[0].attempts).toBe(1);
  });

  it('keeps the operation when the handler throws (offline), and drops it on "drop"', async () => {
    const { box } = setup();
    await box.enqueue('alice', { id: 'net', kind: 'k', payload: {} });
    await box.enqueue('alice', { id: 'bad', kind: 'k', payload: {} });
    await box.drain('alice', {
      k: async (op) => {
        if (op.id === 'net') throw new Error('offline');
        return 'drop';
      },
    });
    expect((await box.list('alice')).map((o) => o.id)).toEqual(['net']);
  });

  it('never hands one account\'s operations to a drain for another account', async () => {
    const { box } = setup();
    await box.enqueue('alice', { id: 'a1', kind: 'k', payload: {} });
    const seen: string[] = [];
    await box.drain('bob', { k: async (op) => { seen.push(op.uid); return 'done'; } });
    expect(seen).toEqual([]);
    expect(await box.list('alice')).toHaveLength(1);
  });

  it('drops an operation whose stored owner does not match the key it was found under', async () => {
    const { box, storage } = setup();
    await box.enqueue('alice', { id: 'a1', kind: 'k', payload: {} });
    // Simulate a corrupted / moved entry: alice's list copied under bob's key.
    const raw = await storage.getItem('test-outbox:alice');
    await storage.setItem('test-outbox:bob', raw as string);
    const seen: string[] = [];
    await box.drain('bob', { k: async (op) => { seen.push(op.id); return 'done'; } });
    expect(seen).toEqual([]);
  });

  it('is bounded: the oldest operations are dropped past maxOps', async () => {
    const { box, advance } = setup({ maxOps: 3 });
    for (let i = 0; i < 5; i += 1) {
      await box.enqueue('alice', { id: `op${i}`, kind: 'k', payload: {} });
      advance(1);
    }
    expect((await box.list('alice')).map((o) => o.id)).toEqual(['op2', 'op3', 'op4']);
  });

  it('expires operations older than maxAgeMs', async () => {
    const { box, advance } = setup({ maxAgeMs: 1000 });
    await box.enqueue('alice', { id: 'old', kind: 'k', payload: {} });
    advance(2000);
    expect(await box.list('alice')).toEqual([]);
  });

  it('runs one drain at a time per account (a second call joins the first)', async () => {
    const { box } = setup();
    await box.enqueue('alice', { id: 'op', kind: 'k', payload: {} });
    let calls = 0;
    const handler = { k: async () => { calls += 1; await new Promise((r) => setTimeout(r, 5)); return 'done' as const; } };
    await Promise.all([box.drain('alice', handler), box.drain('alice', handler)]);
    expect(calls).toBe(1);
  });

  it('an operation enqueued during a drain is not lost when the drain writes back', async () => {
    const { box } = setup();
    await box.enqueue('alice', { id: 'first', kind: 'k', payload: {} });
    await box.drain('alice', {
      k: async () => {
        await box.enqueue('alice', { id: 'second', kind: 'k', payload: {} });
        return 'done';
      },
    });
    expect((await box.list('alice')).map((o) => o.id)).toEqual(['second']);
  });

  it('newOperationId is unique and url-safe', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newOperationId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });
});
