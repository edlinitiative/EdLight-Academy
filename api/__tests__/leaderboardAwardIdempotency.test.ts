/**
 * D-3: a leaderboard XP award is retried by the client outbox, so the server
 * must apply each operation id at most once.
 */
type Data = Record<string, any>;
const store = new Map<string, Data>();

function applyWrite(path: string, data: Data, merge: boolean) {
  const prev = merge ? { ...(store.get(path) || {}) } : {};
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && '__inc' in v) prev[k] = (Number(prev[k]) || 0) + v.__inc;
    else prev[k] = v;
  }
  store.set(path, prev);
}
const ref = (path: string) => ({
  path,
  get: async () => ({ exists: store.has(path), data: () => (store.has(path) ? { ...store.get(path) } : undefined) }),
  set: async (d: Data, o?: { merge?: boolean }) => applyWrite(path, d, !!o?.merge),
  collection: (name: string): any => ({ doc: (id: string) => ref(`${path}/${name}/${id}`) }),
});
const mockDb = {
  doc: (p: string) => ref(p),
  collection: (path: string): any => ({
    where: (_field: string, _op: string, uid: string) => ({ limit: () => ({ get: async () => ({ docs: [...store.entries()]
      .filter(([key, data]) => key.startsWith(`${path}/`) && key.split('/').length === 2 && data.memberUids?.includes(uid))
      .map(([key, data]) => ({ ref: ref(key), data: () => data })) }) }) }),
  }),
  runTransaction: async (fn: (tx: any) => Promise<any>) => {
    const ops: Array<() => void> = [];
    const out = await fn({
      get: (r: any) => r.get(),
      set: (r: any, d: Data, o?: { merge?: boolean }) => { ops.push(() => applyWrite(r.path, d, !!o?.merge)); },
    });
    ops.forEach((op) => op());
    return out;
  },
};

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { increment: (n: number) => ({ __inc: n }), serverTimestamp: () => 'ts' },
}));
jest.mock('../_lib/firebaseAdmin', () => ({ getDb: () => mockDb }));
jest.mock('../_lib/requireAuth', () => ({ requireAuthDecoded: async () => ({ uid: 'u1', name: 'Ted Jacquet' }) }));
jest.mock('../_lib/rateLimit', () => ({ checkRateLimit: async () => ({ allowed: true, remaining: 10, resetAt: 0 }) }));

import handler from '../leaderboard/award';

function call(body: Data) {
  const out: { status?: number; body?: any } = {};
  const r: any = {
    setHeader: () => r,
    status: (s: number) => { out.status = s; return r; },
    json: (b: unknown) => { out.body = b; return r; },
  };
  return handler({ method: 'POST', headers: {}, body } as any, r).then(() => out);
}

const allTimeXp = () => store.get('leaderboards/all-time/entries/u1')?.xp;

beforeEach(() => { store.clear(); jest.spyOn(console, 'error').mockImplementation(() => undefined); });

it('applies a retried operation id once and reports the duplicate', async () => {
  store.set('classes/c1', { memberUids: ['u1'], members: { u1: { name: 'A' } }, archived: false });
  const first = await call({ xpDelta: 30, opId: 'lbx-abc12345' });
  const retry = await call({ xpDelta: 30, opId: 'lbx-abc12345' });
  expect(first.status).toBe(200);
  expect(retry.status).toBe(200);
  expect(retry.body.duplicate).toBe(true);
  expect(allTimeXp()).toBe(30);
  const classWeek = [...store.entries()].find(([p]) => p.startsWith('classes/c1/weeks/'));
  expect(classWeek?.[1].xp.u1).toBe(30);
  const weekly = [...store.entries()].find(([p]) => /^leaderboards\/\d{4}-W\d{2}\/entries\/u1$/.test(p));
  expect(weekly?.[1].xp).toBe(30);
});

it('applies distinct operation ids separately', async () => {
  await call({ xpDelta: 10, opId: 'op-00000001' });
  await call({ xpDelta: 15, opId: 'op-00000002' });
  expect(allTimeXp()).toBe(25);
});

it('still accepts an award without an operation id (older app builds)', async () => {
  await call({ xpDelta: 10 });
  await call({ xpDelta: 10 });
  expect(allTimeXp()).toBe(20);
});

it('rejects a malformed operation id instead of silently skipping dedupe', async () => {
  const res = await call({ xpDelta: 10, opId: 'bad id with spaces' });
  expect(res.status).toBe(400);
  expect(allTimeXp()).toBeUndefined();
});

it('keeps the dedupe record bounded', async () => {
  for (let i = 0; i < 260; i += 1) await call({ xpDelta: 1, opId: `op-${String(i).padStart(8, '0')}` });
  const ops = store.get('users/u1/serverOps/leaderboardAward')?.ops || {};
  expect(Object.keys(ops).length).toBeLessThanOrEqual(200);
  expect(allTimeXp()).toBe(260);
});
