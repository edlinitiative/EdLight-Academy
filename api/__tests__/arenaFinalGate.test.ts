/**
 * `provisional → final` — the transition that releases the prize money.
 *
 * It had no gate of any kind. `canTransition` allows the move and nothing else
 * looked, so the button could be pressed with a claim window still running, a
 * tie nobody had adjudicated, or a flagged finisher nobody had ruled on. Every
 * test here fails against that shape.
 *
 * Driven through the real handler against the same small fake Firestore the
 * review endpoint's tests use.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;

type Row = Record<string, unknown>;

function makeDb(seed: Record<string, Row>) {
  const docs = new Map<string, Row>(Object.entries(seed));

  const snapshot = (path: string) => ({
    id: path.split('/').pop() as string,
    get exists() { return docs.has(path); },
    data: () => docs.get(path),
    ref: { path },
  });

  const collectionDocs = (prefix: string) => [...docs.keys()]
    .filter((key) => key.startsWith(`${prefix}/`) && !key.slice(prefix.length + 1).includes('/'))
    .map(snapshot);

  return {
    doc: (path: string) => ({
      path,
      get: async () => snapshot(path),
      set: async (value: Row) => { docs.set(path, value); },
      update: async (value: Row) => { docs.set(path, { ...(docs.get(path) ?? {}), ...value }); },
    }),
    collection: (path: string) => ({
      get: async () => ({ docs: collectionDocs(path) }),
      where: (field: string, _op: string, value: unknown) => ({
        get: async () => ({ docs: collectionDocs(path).filter((d) => (d.data() as Row)?.[field] === value) }),
      }),
    }),
    getAll: async (...refs: Array<{ path: string }>) => refs.map((r) => snapshot(r.path)),
    runTransaction: async <T>(fn: (tx: {
      get: (ref: { path: string }) => Promise<ReturnType<typeof snapshot>>;
      set: (ref: { path: string }, value: Row) => void;
      update: (ref: { path: string }, value: Row) => void;
      create: (ref: { path: string }, value: Row) => void;
    }) => Promise<T>): Promise<T> => fn({
      get: async (ref) => snapshot(ref.path),
      set: (ref, value) => { docs.set(ref.path, value); },
      update: (ref, value) => { docs.set(ref.path, { ...(docs.get(ref.path) ?? {}), ...value }); },
      create: (ref, value) => {
        if (docs.has(ref.path)) throw Object.assign(new Error('already exists'), { code: 6 });
        docs.set(ref.path, value);
      },
    }),
    __docs: docs,
  };
}

let mockDb = makeDb({});

jest.mock('../_lib/firebaseAdmin', () => ({
  isAdminConfigured: () => true,
  getDb: () => mockDb,
  getConsentBucket: () => { throw new Error('not used'); },
}));
jest.mock('../_lib/requireAuth', () => ({ requireAuthDecoded: async () => ({ uid: 'admin-1' }) }));
jest.mock('../_lib/rateLimit', () => ({
  checkRateLimit: async () => ({ allowed: true, remaining: 99, resetAt: NOW + 60_000 }),
}));
jest.mock('../_lib/arenaConsentEmail', () => ({ sendConsentEmail: async () => undefined }));

import handler from '../arena/state';

const TID = 'sept-2026';

function finalise(body: Row = {}) {
  const out: { status: number; body: Row } = { status: 0, body: {} };
  const res = {
    status(code: number) { out.status = code; return this; },
    json(value: Row) { out.body = value; return this; },
    setHeader() { return this; },
  } as unknown as VercelResponse;

  return handler(
    { method: 'POST', query: {}, headers: {}, body: { tournamentId: TID, to: 'final', ...body } } as VercelRequest,
    res,
  ).then(() => out);
}

const verified = (uid: string, rank: number, cents: number): Row => ({
  uid, rank, prizeCents: cents, state: 'verified', expiresAt: NOW + 48 * HOUR,
});

function seed(over: { claims?: Row[]; reviews?: Record<string, string>; players?: Record<string, Row> } = {}) {
  const base: Record<string, Row> = {
    'users/admin-1': { role: 'admin' },
    [`tournaments/${TID}`]: { state: 'provisional', prizes: { individual: [10_000, 5_000, 2_500] } },
    [`tournaments/${TID}/standings/current`]: {
      individuals: [
        { uid: 'w1', rank: 1, displayName: 'Rose', schoolKey: 'codosa', score: 900 },
        { uid: 'w2', rank: 2, displayName: 'Jean', schoolKey: 'sldg', score: 800 },
        { uid: 'w3', rank: 3, displayName: 'Mika', schoolKey: 'cmdm', score: 700 },
        { uid: 'w4', rank: 4, displayName: 'Nadia', schoolKey: 'codosa', score: 600 },
      ],
      schools: [],
    },
  };
  for (const uid of ['w1', 'w2', 'w3', 'w4']) {
    base[`tournaments/${TID}/players/${uid}`] = { uid, eligible: true, ...(over.players?.[uid] ?? {}) };
  }
  const claims = over.claims ?? [
    verified('w1', 1, 10_000), verified('w2', 2, 5_000), verified('w3', 3, 2_500),
  ];
  for (const claim of claims) base[`tournaments/${TID}/claims/${claim.uid as string}`] = claim;
  for (const [uid, decision] of Object.entries(over.reviews ?? {})) {
    base[`tournaments/${TID}/reviews/${uid}`] = { uid, decision };
  }
  return base;
}

const stateNow = () => (mockDb.__docs.get(`tournaments/${TID}`) as Row).state;

beforeEach(() => { mockDb = makeDb(seed()); });

describe('the gate', () => {
  it('lets a fully verified podium finalise', async () => {
    const out = await finalise();
    expect(out.status).toBe(200);
    expect(stateNow()).toBe('final');
  });

  it('refuses while a claim window is still running', async () => {
    mockDb = makeDb(seed({
      claims: [
        { uid: 'w1', rank: 1, prizeCents: 10_000, state: 'open', expiresAt: NOW + 12 * HOUR },
        verified('w2', 2, 5_000), verified('w3', 3, 2_500),
      ],
    }));
    const out = await finalise();
    expect(out.status).toBe(409);
    expect(out.body.error).toBe('verification_incomplete');
    expect(out.body.blockers).toEqual([{ rank: 1, uids: ['w1'], why: 'claim_unresolved' }]);
    expect(stateNow()).toBe('provisional');
  });

  it('refuses while a flagged finisher in the money has no verdict', async () => {
    mockDb = makeDb(seed({ players: { w2: { uid: 'w2', eligible: true, flags: ['impossible:7'] } } }));
    const out = await finalise();
    expect(out.status).toBe(409);
    expect((out.body.blockers as Row[])[0]).toMatchObject({ rank: 2, why: 'unreviewed_flags' });
  });

  it('accepts once that verdict is recorded', async () => {
    mockDb = makeDb(seed({
      players: { w2: { uid: 'w2', eligible: true, flags: ['impossible:7'] } },
      reviews: { w2: 'cleared' },
    }));
    expect((await finalise()).status).toBe(200);
  });

  it('refuses a disqualified student who is still holding the prize', async () => {
    mockDb = makeDb(seed({ reviews: { w1: 'disqualified' } }));
    const out = await finalise();
    expect(out.status).toBe(409);
    expect((out.body.blockers as Row[])[0]).toMatchObject({ rank: 1, why: 'disqualified_holder' });
  });
});

describe('the override', () => {
  const blocked = () => makeDb(seed({
    claims: [
      { uid: 'w1', rank: 1, prizeCents: 10_000, state: 'open', expiresAt: NOW + 12 * HOUR },
      verified('w2', 2, 5_000), verified('w3', 3, 2_500),
    ],
  }));

  it('costs a stated reason', async () => {
    mockDb = blocked();
    const out = await finalise({ override: true });
    expect(out.status).toBe(400);
    expect(out.body.error).toBe('reason_required');
    expect(stateNow()).toBe('provisional');
  });

  it('goes through with one', async () => {
    mockDb = blocked();
    const out = await finalise({ override: true, reason: 'Winner reached by phone; declined the prize.' });
    expect(out.status).toBe(200);
    expect(stateNow()).toBe('final');
  });

  /* An escape hatch that cannot be used silently is a different object. */
  it('writes down what it overrode, by whom and why', async () => {
    mockDb = blocked();
    await finalise({ override: true, reason: 'Winner reached by phone; declined the prize.' });
    const tournament = mockDb.__docs.get(`tournaments/${TID}`) as Row;
    const override = tournament.finalOverride as Row;
    expect(override.by).toBe('admin-1');
    expect(String(override.reason)).toContain('declined');
    expect(override.blockers).toEqual([{ rank: 1, uids: ['w1'], why: 'claim_unresolved' }]);
  });

  it('records nothing when there was nothing to override', async () => {
    await finalise({ override: true, reason: 'belt and braces' });
    expect((mockDb.__docs.get(`tournaments/${TID}`) as Row).finalOverride).toBeUndefined();
  });
});

describe('the corrected official board', () => {
  const withDisqualification = () => makeDb(seed({
    reviews: { w1: 'disqualified' },
    players: { w1: { uid: 'w1', eligible: false } },
    claims: [
      { uid: 'w1', rank: 1, prizeCents: 10_000, state: 'rejected', expiresAt: NOW - HOUR },
      { uid: 'w4', rank: 1, prizeCents: 10_000, state: 'verified', expiresAt: NOW + 70 * HOUR },
      verified('w2', 2, 5_000), verified('w3', 3, 2_500),
    ],
  }));

  it('removes the disqualified row and closes the gap', async () => {
    mockDb = withDisqualification();
    const out = await finalise();
    expect(out.status).toBe(200);
    const board = mockDb.__docs.get(`tournaments/${TID}/standings/current`) as Row;
    expect((board.individuals as Row[]).map((r) => [r.uid, r.rank]))
      .toEqual([['w2', 1], ['w3', 2], ['w4', 3]]);
    expect(out.body.removedFromBoard).toEqual(['w1']);
  });

  it('keeps the announced board rather than overwriting it into nothing', async () => {
    mockDb = withDisqualification();
    await finalise();
    const archived = mockDb.__docs.get(`tournaments/${TID}/standings/provisional`) as Row;
    expect((archived.individuals as Row[]).map((r) => r.uid)).toEqual(['w1', 'w2', 'w3', 'w4']);
    expect(archived.archivedAt).toBeTruthy();
  });

  it('names the school whose mean can no longer be trusted', async () => {
    mockDb = withDisqualification();
    const out = await finalise();
    expect(out.body.schoolsNeedRecount).toEqual(['codosa']);
    const board = mockDb.__docs.get(`tournaments/${TID}/standings/current`) as Row;
    expect(board.schoolsNeedRecount).toEqual(['codosa']);
  });

  it('leaves the board completely alone when nobody was disqualified', async () => {
    const out = await finalise();
    const board = mockDb.__docs.get(`tournaments/${TID}/standings/current`) as Row;
    expect((board.individuals as Row[]).map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(board.correctedAt).toBeUndefined();
    expect(mockDb.__docs.has(`tournaments/${TID}/standings/provisional`)).toBe(false);
    expect(out.body.removedFromBoard).toEqual([]);
  });
});
