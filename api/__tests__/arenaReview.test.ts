/**
 * The integrity review endpoint, driven through its real handler.
 *
 * The pure decisions are tested in `src/utils/__tests__/arenaReview.test.ts`.
 * What is tested HERE is the part that only exists at the Firestore boundary,
 * and that the audit found missing entirely:
 *
 *  · a verdict actually WRITES `eligible`, which nothing in the product could
 *    do before — every read of it was wired to a switch that did not exist;
 *  · the evidence door is shut while the keys are still secret;
 *  · a disqualification takes the prize back and rolls it down;
 *  · a scheduler cannot rule on a child.
 *
 * The fake Firestore is deliberately small: documents in a Map, a transaction
 * that runs the body against the same Map. It models what these paths use and
 * nothing else.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

const NOW = 1_800_000_000_000;

// ── A very small Firestore ──────────────────────────────────────────────────

type Row = Record<string, unknown>;

interface Store { docs: Map<string, Row> }

function makeDb(seed: Record<string, Row>) {
  const store: Store = { docs: new Map(Object.entries(seed)) };

  const snapshot = (path: string) => ({
    id: path.split('/').pop() as string,
    get exists() { return store.docs.has(path); },
    data: () => store.docs.get(path),
    ref: { path },
  });

  const docRef = (path: string) => ({
    path,
    get: async () => snapshot(path),
    set: async (value: Row, opts?: { merge?: boolean }) => {
      store.docs.set(path, opts?.merge ? { ...(store.docs.get(path) ?? {}), ...value } : value);
    },
    update: async (value: Row) => {
      if (!store.docs.has(path)) throw new Error(`no document at ${path}`);
      store.docs.set(path, { ...(store.docs.get(path) as Row), ...value });
    },
  });

  const collectionDocs = (prefix: string) => [...store.docs.keys()]
    .filter((key) => key.startsWith(`${prefix}/`) && !key.slice(prefix.length + 1).includes('/'))
    .map(snapshot);

  const collectionRef = (prefix: string) => ({
    get: async () => ({ docs: collectionDocs(prefix) }),
    where: (field: string, _op: string, value: unknown) => ({
      get: async () => ({ docs: collectionDocs(prefix).filter((d) => (d.data() as Row)?.[field] === value) }),
    }),
  });

  const mockDb = {
    doc: (path: string) => docRef(path),
    collection: (path: string) => collectionRef(path),
    getAll: async (...refs: Array<{ path: string }>) => refs.map((r) => snapshot(r.path)),
    runTransaction: async <T>(fn: (tx: {
      get: (ref: { path: string }) => Promise<ReturnType<typeof snapshot>>;
      set: (ref: { path: string }, value: Row, opts?: { merge?: boolean }) => void;
      update: (ref: { path: string }, value: Row) => void;
      create: (ref: { path: string }, value: Row) => void;
    }) => Promise<T>): Promise<T> => fn({
      get: async (ref) => snapshot(ref.path),
      set: (ref, value, opts) => {
        store.docs.set(ref.path, opts?.merge ? { ...(store.docs.get(ref.path) ?? {}), ...value } : value);
      },
      update: (ref, value) => {
        store.docs.set(ref.path, { ...(store.docs.get(ref.path) ?? {}), ...value });
      },
      create: (ref, value) => { store.docs.set(ref.path, value); },
    }),
    __store: store,
  };
  return mockDb;
}

let mockDb = makeDb({});

jest.mock('../_lib/firebaseAdmin', () => ({
  isAdminConfigured: () => true,
  getDb: () => mockDb,
  getConsentBucket: () => { throw new Error('not used in these tests'); },
}));
jest.mock('../_lib/requireAuth', () => ({
  requireAuthDecoded: async () => ({ uid: 'admin-1' }),
}));
jest.mock('../_lib/rateLimit', () => ({
  checkRateLimit: async () => ({ allowed: true, remaining: 99, resetAt: NOW + 60_000 }),
}));
jest.mock('../_lib/arenaConsentEmail', () => ({ sendConsentEmail: async () => undefined }));

// The aggregator is a separate, separately-tested machine; what matters here
// is WHETHER the verdict asks it to run.
const mockAggregateOne = jest.fn(async () => ({ status: 200, body: { ok: true } }));
jest.mock('../arena/aggregate', () => {
  const actual = jest.requireActual('../arena/aggregate');
  return { ...actual, aggregateOne: (...args: unknown[]) => mockAggregateOne(...(args as [])) };
});

import handler, { validateVerdict } from '../arena/review';

// ── Request/response doubles ────────────────────────────────────────────────

function call(req: Partial<VercelRequest>) {
  const out: { status: number; body: Row } = { status: 0, body: {} };
  const res = {
    status(code: number) { out.status = code; return this; },
    json(body: Row) { out.body = body; return this; },
    setHeader() { return this; },
  } as unknown as VercelResponse;

  return handler(
    { method: 'GET', query: {}, body: {}, headers: {}, ...req } as VercelRequest,
    res,
  ).then(() => out);
}

// ── A tournament mid-review ─────────────────────────────────────────────────

const TID = 'sept-2026';

function seed(over: { state?: string; players?: Record<string, Row>; claims?: Record<string, Row> } = {}) {
  const state = over.state ?? 'provisional';
  const base: Record<string, Row> = {
    'users/admin-1': { role: 'admin' },
    [`tournaments/${TID}`]: {
      state,
      prizes: { individual: [10_000, 5_000, 2_500] },
      questionCount: 20,
    },
    [`tournaments/${TID}/standings/current`]: {
      individuals: [
        { uid: 'w1', rank: 1, displayName: 'Rose', schoolKey: 'codosa', schoolShort: 'CODOSA', score: 900 },
        { uid: 'w2', rank: 2, displayName: 'Jean', schoolKey: 'sldg', schoolShort: 'SLDG', score: 800 },
        { uid: 'w3', rank: 3, displayName: 'Mika', schoolKey: 'cmdm', schoolShort: 'CMDM', score: 700 },
        { uid: 'w4', rank: 4, displayName: 'Nadia', schoolKey: 'codosa', schoolShort: 'CODOSA', score: 600 },
      ],
    },
    [`tournaments/${TID}/players/w1`]: {
      uid: 'w1', displayName: 'Rose', score: 900, eligible: true, flags: ['impossible:4', 'focus:4:3'],
    },
    [`tournaments/${TID}/players/w2`]: { uid: 'w2', displayName: 'Jean', score: 800, eligible: true },
    [`tournaments/${TID}/players/w3`]: { uid: 'w3', displayName: 'Mika', score: 700, eligible: true },
    [`tournaments/${TID}/players/w4`]: { uid: 'w4', displayName: 'Nadia', score: 600, eligible: true },
    [`tournaments/${TID}/answers/w1_4`]: {
      uid: 'w1', index: 4, choice: 2, correct: true, points: 500, tier: 'full',
      elapsedMs: -200, impossible: true, clientShownAt: NOW - 30_000, clampedShownAt: NOW - 200,
      serverReceivedAt: NOW - 400, focusLosses: 3, flags: ['impossible:4', 'focus:4:3'],
    },
    [`tournaments/${TID}/answers/w1_1`]: {
      uid: 'w1', index: 1, choice: 0, correct: true, points: 400, tier: 'full',
      elapsedMs: 4_000, focusLosses: 0, flags: [],
    },
    [`tournaments/${TID}/answers/w2_1`]: { uid: 'w2', index: 1, choice: 1, correct: false, points: 0 },
    ...Object.fromEntries(Object.entries(over.players ?? {}).map(([uid, row]) => [`tournaments/${TID}/players/${uid}`, row])),
  };

  const claims = over.claims ?? {
    w1: { uid: 'w1', rank: 1, prizeCents: 10_000, state: 'claimed', expiresAt: NOW + 48 * 3_600_000 },
  };
  for (const [uid, row] of Object.entries(claims)) base[`tournaments/${TID}/claims/${uid}`] = row;

  return base;
}

beforeEach(() => {
  mockAggregateOne.mockClear();
  mockDb = makeDb(seed());
});

// ── The door ────────────────────────────────────────────────────────────────

describe('authorization', () => {
  it('refuses a scheduler even with the cron secret', async () => {
    process.env.CRON_SECRET = 'shhh';
    const out = await call({
      method: 'POST',
      headers: { authorization: 'Bearer shhh' },
      body: { action: 'decide', tournamentId: TID, uid: 'w1', decision: 'disqualified', note: 'automated' },
    });
    delete process.env.CRON_SECRET;
    expect(out.status).toBe(403);
    expect(out.body.error).toBe('cron_not_allowed');
    expect((mockDb.__store.docs.get(`tournaments/${TID}/players/w1`) as Row).eligible).toBe(true);
  });

  it('refuses a signed-in user who is not an admin', async () => {
    mockDb = makeDb({ ...seed(), 'users/admin-1': { role: 'student' } });
    const out = await call({ query: { tournamentId: TID, action: 'queue' } });
    expect(out.status).toBe(403);
  });
});

// ── The queue ───────────────────────────────────────────────────────────────

describe('queue', () => {
  it('puts the unruled flagged player in the money first', async () => {
    const out = await call({ query: { tournamentId: TID, action: 'queue' } });
    expect(out.status).toBe(200);
    const rows = out.body.rows as Array<Row>;
    expect(rows[0]).toMatchObject({ uid: 'w1', decision: null, eligible: true });
    expect((rows[0].summary as Row).impossible).toBe(1);
    expect((rows[0].summary as Row).worstFocusLosses).toBe(3);
  });

  it('reports the same blockers the finalise gate will refuse on', async () => {
    const out = await call({ query: { tournamentId: TID, action: 'queue' } });
    const blockers = out.body.blockers as Array<Row>;
    // rank 1 is claimed-not-verified; ranks 2 and 3 were never claimed at all.
    expect(blockers).toEqual([
      { rank: 1, uids: ['w1'], why: 'claim_unresolved' },
      { rank: 2, uids: ['w2'], why: 'prize_unassigned' },
      { rank: 3, uids: ['w3'], why: 'prize_unassigned' },
    ]);
  });
});

// ── The evidence ────────────────────────────────────────────────────────────

describe('evidence', () => {
  it('is shut while the tournament is still live', async () => {
    mockDb = makeDb(seed({ state: 'live' }));
    const out = await call({ query: { tournamentId: TID, action: 'evidence', uid: 'w1' } });
    expect(out.status).toBe(409);
    expect(out.body.error).toBe('wrong_state');
  });

  it('opens once every question has closed', async () => {
    mockDb = makeDb(seed({ state: 'grading' }));
    const out = await call({ query: { tournamentId: TID, action: 'evidence', uid: 'w1' } });
    expect(out.status).toBe(200);
    const answers = out.body.answers as Array<Row>;
    expect(answers.map((a) => a.index)).toEqual([1, 4]);
  });

  it('shows both ends of the timing span, not just the clamped result', async () => {
    const out = await call({ query: { tournamentId: TID, action: 'evidence', uid: 'w1' } });
    const impossible = (out.body.answers as Array<Row>).find((a) => a.index === 4)!;
    expect(impossible.clientShownAt).toBe(NOW - 30_000);
    expect(impossible.serverReceivedAt).toBe(NOW - 400);
    expect(impossible.elapsedMs).toBe(-200);
  });

  it('returns only the player asked about', async () => {
    const out = await call({ query: { tournamentId: TID, action: 'evidence', uid: 'w2' } });
    expect((out.body.answers as Array<Row>).every((a) => a.index === 1)).toBe(true);
    expect(out.body.uid).toBe('w2');
  });

  it('404s on a uid that never registered', async () => {
    const out = await call({ query: { tournamentId: TID, action: 'evidence', uid: 'nobody' } });
    expect(out.status).toBe(404);
  });
});

// ── The verdict ─────────────────────────────────────────────────────────────

describe('validateVerdict', () => {
  it('demands a reason for a disqualification', () => {
    expect(validateVerdict({ uid: 'w1', decision: 'disqualified' }))
      .toEqual({ ok: false, reason: 'note_required' });
  });

  it('does not demand one for clearing somebody', () => {
    expect(validateVerdict({ uid: 'w1', decision: 'cleared' }).ok).toBe(true);
  });

  it('refuses a decision it does not recognise', () => {
    expect(validateVerdict({ uid: 'w1', decision: 'banned' }).ok).toBe(false);
  });
});

describe('decide', () => {
  const disqualify = (over: Row = {}) => call({
    method: 'POST',
    body: {
      action: 'decide', tournamentId: TID, uid: 'w1',
      decision: 'disqualified', note: 'Answer stamped before the question rendered.', ...over,
    },
  });

  /*
   * THE FINDING: before this endpoint existed, `eligible` could not be set to
   * false by anything in the product. This assertion is the switch.
   */
  it('writes the eligibility flag four other files were already reading', async () => {
    const out = await disqualify();
    expect(out.status).toBe(200);
    expect((mockDb.__store.docs.get(`tournaments/${TID}/players/w1`) as Row).eligible).toBe(false);
  });

  it('records what the reviewer was looking at, not just the verdict', async () => {
    await disqualify();
    const review = mockDb.__store.docs.get(`tournaments/${TID}/reviews/w1`) as Row;
    expect(review).toMatchObject({
      uid: 'w1',
      decision: 'disqualified',
      reviewedBy: 'admin-1',
      flags: ['impossible:4', 'focus:4:3'],
    });
    expect(review.note).toContain('before the question rendered');
  });

  it('takes the prize back and rolls it down', async () => {
    const out = await disqualify();
    const claim = mockDb.__store.docs.get(`tournaments/${TID}/claims/w1`) as Row;
    expect(claim.state).toBe('rejected');
    expect(out.body.rollDown).toBeTruthy();
  });

  it('reinstating writes eligibility back', async () => {
    await disqualify();
    const out = await call({
      method: 'POST',
      body: { action: 'decide', tournamentId: TID, uid: 'w1', decision: 'cleared', note: 'Old device clock.' },
    });
    expect(out.status).toBe(200);
    expect((mockDb.__store.docs.get(`tournaments/${TID}/players/w1`) as Row).eligible).toBe(true);
  });

  /*
   * A prize that has already moved is not taken back from the student who was
   * told they had won it. The endpoint says so rather than doing it quietly.
   */
  it('says out loud when a reinstated player’s prize has already gone', async () => {
    await disqualify();
    const out = await call({
      method: 'POST',
      body: { action: 'decide', tournamentId: TID, uid: 'w1', decision: 'cleared', note: 'Cleared on appeal.' },
    });
    expect(out.body.rolledDownAway).toBe(true);
  });

  it('re-aggregates in grading, where the board has not been announced yet', async () => {
    mockDb = makeDb(seed({ state: 'grading' }));
    const out = await disqualify();
    expect(mockAggregateOne).toHaveBeenCalledTimes(1);
    expect(out.body.board).toBe('aggregated');
  });

  /*
   * `mockAggregateOne` refuses to run in `provisional` on purpose — that board has
   * been read out on a stream. The correction is applied at `final` instead,
   * and the response says which of the two happened.
   */
  it('does not touch an announced board in provisional', async () => {
    const out = await disqualify();
    expect(mockAggregateOne).not.toHaveBeenCalled();
    expect(out.body.board).toBe('deferred_to_final');
  });

  it('refuses a verdict during live', async () => {
    mockDb = makeDb(seed({ state: 'live' }));
    const out = await disqualify();
    expect(out.status).toBe(409);
    expect((mockDb.__store.docs.get(`tournaments/${TID}/players/w1`) as Row).eligible).toBe(true);
  });

  it('refuses a verdict after the prizes are out', async () => {
    mockDb = makeDb(seed({ state: 'final' }));
    const out = await disqualify();
    expect(out.status).toBe(409);
    expect(String(out.body.message)).toContain('refund');
  });

  it('404s rather than inventing a player row', async () => {
    const out = await disqualify({ uid: 'ghost' });
    expect(out.status).toBe(404);
    expect(mockDb.__store.docs.has(`tournaments/${TID}/reviews/ghost`)).toBe(false);
  });
});
