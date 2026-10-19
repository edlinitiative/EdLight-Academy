/**
 * outbox — a small persisted write queue, per account.
 * ─────────────────────────────────────────────────────
 * Some writes must survive the app being killed before the server answers:
 * React Native Firestore keeps its offline queue in memory only (O-3), so a
 * lesson completed offline was lost on a kill (L-3), and a leaderboard XP
 * award whose POST failed was never retried (D-3).
 *
 * The rules this module enforces, so callers cannot get them wrong:
 *   • per account: operations are stored under the owner's uid and carry it;
 *     a drain for account B never sees account A's operations (shared phones);
 *   • idempotent: an operation has an id, enqueueing the same id twice keeps
 *     the first, and the handler is expected to be safe to repeat (the server
 *     dedupes by the same id where repetition would matter);
 *   • bounded: at most `maxOps` per account (oldest dropped) and nothing older
 *     than `maxAgeMs`;
 *   • removed only on a confirmed handler result ('done' or 'drop'); a throw or
 *     'retry' keeps it for the next launch / reconnect.
 *
 * Storage is injected (AsyncStorage on the phone, localStorage on the web) and
 * may be async. Every read-modify-write of one account's list runs under a
 * per-key lock, and handlers run OUTSIDE the lock, so a handler may enqueue.
 */

export type OutboxResult = 'done' | 'retry' | 'drop';

export interface OutboxOp<P = any> {
  id: string;
  uid: string;
  kind: string;
  payload: P;
  createdAt: number;
  attempts: number;
}

export interface OutboxStorage {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

export type OutboxHandlers = Record<string, (op: OutboxOp) => Promise<OutboxResult>>;

export interface OutboxOptions {
  prefix: string;
  maxOps?: number;
  maxAgeMs?: number;
  now?: () => number;
}

const ID_RE = /^[A-Za-z0-9_:.-]{1,200}$/;

/** A random, url-safe operation id (time-ordered prefix + randomness). */
export function newOperationId(): string {
  let rand = '';
  const c: any = (globalThis as any).crypto;
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = new Uint8Array(12);
    c.getRandomValues(bytes);
    rand = Array.from(bytes, (b) => (b % 36).toString(36)).join('');
  } else {
    while (rand.length < 12) rand += Math.random().toString(36).slice(2);
    rand = rand.slice(0, 12);
  }
  return `${Date.now().toString(36)}-${rand}`;
}

/** In-memory storage, for tests and as a fallback when nothing persists. */
export function memoryOutboxStorage(): OutboxStorage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k, v) => { m.set(k, v); },
    removeItem: (k) => { m.delete(k); },
  };
}

export function createOutbox(storage: OutboxStorage, opts: OutboxOptions) {
  const maxOps = opts.maxOps ?? 50;
  const maxAgeMs = opts.maxAgeMs ?? 30 * 86_400_000;
  const now = opts.now ?? (() => Date.now());
  const keyFor = (uid: string) => `${opts.prefix}:${uid}`;

  const locks = new Map<string, Promise<unknown>>();
  /** Told the new queue length whenever an account's list is written. */
  const listeners = new Set<(uid: string, pending: number) => void>();
  function notify(uid: string, pending: number) {
    listeners.forEach((fn) => { try { fn(uid, pending); } catch { /* a listener's problem */ } });
  }
  const drains = new Map<string, Promise<{ done: number; remaining: number }>>();

  /** Serialize async work on one key. */
  function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = locks.get(key) || Promise.resolve();
    const next = prev.then(fn, fn);
    const settled = next.catch(() => undefined);
    locks.set(key, settled);
    settled.then(() => { if (locks.get(key) === settled) locks.delete(key); });
    return next;
  }

  async function readRaw(uid: string): Promise<OutboxOp[]> {
    let raw: string | null = null;
    try { raw = await storage.getItem(keyFor(uid)); } catch { return []; }
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /** Valid, owned by `uid`, not expired, bounded. */
  function clean(uid: string, ops: OutboxOp[]): OutboxOp[] {
    const t = now();
    const out = ops.filter((o) =>
      o && typeof o === 'object' && o.uid === uid && typeof o.id === 'string' && ID_RE.test(o.id)
      && typeof o.kind === 'string' && typeof o.createdAt === 'number' && t - o.createdAt <= maxAgeMs,
    );
    return out.length > maxOps ? out.slice(out.length - maxOps) : out;
  }

  async function write(uid: string, ops: OutboxOp[]) {
    try {
      if (ops.length) await storage.setItem(keyFor(uid), JSON.stringify(ops));
      else await storage.removeItem(keyFor(uid));
    } catch {
      /* storage full / unavailable: the write path still tried the server */
    }
    notify(uid, ops.length);
  }

  async function list(uid: string): Promise<OutboxOp[]> {
    if (!uid) return [];
    return clean(uid, await readRaw(uid));
  }

  async function enqueue<P>(uid: string, op: { id?: string; kind: string; payload: P }): Promise<OutboxOp<P> | null> {
    if (!uid) return null;
    const id = op.id || newOperationId();
    if (!ID_RE.test(id)) return null;
    return withLock(keyFor(uid), async () => {
      const ops = clean(uid, await readRaw(uid));
      const existing = ops.find((o) => o.id === id);
      if (existing) return existing as OutboxOp<P>;
      const entry: OutboxOp<P> = { id, uid, kind: op.kind, payload: op.payload, createdAt: now(), attempts: 0 };
      await write(uid, clean(uid, [...ops, entry]));
      return entry;
    });
  }

  async function remove(uid: string, id: string): Promise<void> {
    if (!uid) return;
    await withLock(keyFor(uid), async () => {
      const ops = clean(uid, await readRaw(uid));
      const next = ops.filter((o) => o.id !== id);
      if (next.length !== ops.length) await write(uid, next);
    });
  }

  async function bumpAttempts(uid: string, id: string): Promise<void> {
    await withLock(keyFor(uid), async () => {
      const ops = clean(uid, await readRaw(uid));
      await write(uid, ops.map((o) => (o.id === id ? { ...o, attempts: (o.attempts || 0) + 1 } : o)));
    });
  }

  /** Forget everything stored for an account (e.g. account deletion). */
  async function clear(uid: string): Promise<void> {
    if (!uid) return;
    await withLock(keyFor(uid), async () => { await write(uid, []); });
  }

  /**
   * Replay this account's operations in order. A second call while one runs
   * joins it (no operation is ever handed out twice at once).
   */
  function drain(uid: string, handlers: OutboxHandlers): Promise<{ done: number; remaining: number }> {
    if (!uid) return Promise.resolve({ done: 0, remaining: 0 });
    const running = drains.get(uid);
    if (running) return running;
    const p = (async () => {
      const ops = await list(uid);
      let done = 0;
      for (const op of ops) {
        const handler = handlers[op.kind];
        if (!handler) continue; // another surface owns this kind
        let result: OutboxResult;
        try {
          result = await handler(op);
        } catch {
          result = 'retry';
        }
        if (result === 'done' || result === 'drop') {
          await remove(uid, op.id);
          if (result === 'done') done += 1;
        } else {
          await bumpAttempts(uid, op.id);
        }
      }
      return { done, remaining: (await list(uid)).length };
    })();
    drains.set(uid, p);
    p.finally(() => { if (drains.get(uid) === p) drains.delete(uid); }).catch(() => undefined);
    return p;
  }

  /** How many operations this account still has waiting for the server. */
  async function pendingCount(uid: string): Promise<number> {
    return (await list(uid)).length;
  }

  /**
   * Hear about queue changes (enqueue, confirmed removal, retry bookkeeping),
   * for a "N en attente de synchronisation" indicator. Returns unsubscribe.
   */
  function subscribe(fn: (uid: string, pending: number) => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }

  return { enqueue, list, remove, drain, clear, pendingCount, subscribe };
}

export type Outbox = ReturnType<typeof createOutbox>;

/**
 * What an HTTP status means for a queued operation: success is done; a request
 * the server will never accept (bad input, forbidden) is dropped; auth expiry,
 * rate limits and server errors are retried later.
 */
export function classifyHttpStatus(status: number): OutboxResult {
  if (status >= 200 && status < 300) return 'done';
  if (status === 401 || status === 408 || status === 425 || status === 429 || status >= 500) return 'retry';
  return 'drop';
}
