/**
 * D-8 / D-9: duel scores are graded on the server from the picks, against the
 * bank the duel was minted on; client-only scores (older builds, other banks)
 * stay accepted but are recorded as unverified.
 */
import { FakeDb } from './helpers/fakeFirestore';
import { bankHash, decideDuelScore, gradeDuel } from '../../shared/duelGrading';

const mockBank = [
  { q: 'Capitale de la France ?', options: ['Lyon', 'Paris', 'Nice', 'Lille'], answer: 1 },
  { q: '2 + 2 ?', options: ['4', '3', '5', '22'], answer: 0 },
  { q: 'De quel pays est ce drapeau ?', flag: '🇭🇹', options: ['Cuba', 'Haïti', 'Chili', 'Togo'], answer: 1 },
];

const mockDb = new FakeDb();
let mockUid = 'opp';
jest.mock('../_lib/firebaseAdmin', () => ({ getDb: () => mockDb }));
jest.mock('../_lib/requireAuth', () => ({ requireAuthDecoded: async () => ({ uid: mockUid, name: 'Ana B' }) }));
jest.mock('../_lib/rateLimit', () => ({ checkRateLimit: async () => ({ allowed: true, remaining: 5, resetAt: 0 }) }));
jest.mock('../_lib/expoPush', () => ({ sendExpoPushToUser: async () => undefined }));
jest.mock('../_lib/duelBank', () => ({ serverDuelBank: (id: string) => (id === 'capitals' ? mockBank : null) }));
jest.mock('firebase-admin/firestore', () => {
  class Timestamp {
    mockMs: number;
    constructor(v: number) { this.mockMs = v; }
    static fromMillis(ms: number) { return new Timestamp(ms); }
    static now() { return new Timestamp(Date.now()); }
    toMillis() { return this.mockMs; }
    toJSON() { return this.mockMs; }
  }
  return { Timestamp, FieldValue: { increment: (n: number) => n, serverTimestamp: () => 0 } };
});

import createHandler from '../challenges/create';
import acceptHandler from '../challenges/accept';

function call(h: any, body: Record<string, unknown>) {
  const out: { status?: number; body?: any } = {};
  const r: any = {
    setHeader: () => r,
    status: (s: number) => { out.status = s; return r; },
    json: (b: unknown) => { out.body = b; return r; },
  };
  return h({ method: 'POST', headers: {}, body }, r).then(() => out);
}
const HASH = bankHash(mockBank) as string;
const idxs = [0, 1, 2];

beforeEach(() => { mockDb.store.clear(); jest.spyOn(console, 'error').mockImplementation(() => undefined); });

describe('grading', () => {
  it('grades by option text, ignoring order, case and spacing; null picks are timeouts', () => {
    expect(gradeDuel(mockBank, idxs, ['paris', ' 4 ', null])).toEqual({ score: 2, total: 3 });
    expect(gradeDuel(mockBank, idxs, ['Paris'])).toBeNull();
    expect(gradeDuel(mockBank, [0, 9], ['Paris', null])).toBeNull();
  });

  it('the bank hash ignores option order but not question order', () => {
    const shuffled = mockBank.map((q) => ({ ...q, options: [...q.options].reverse(), answer: q.options.length - 1 - q.answer }));
    expect(bankHash(shuffled)).toBe(HASH);
    expect(bankHash([mockBank[1], mockBank[0], mockBank[2]])).not.toBe(HASH);
  });

  it('refuses an opponent on another bank', () => {
    expect(decideDuelScore({ serverBank: mockBank, duelHash: HASH, clientHash: 'b00000000', idxs, picks: [], clientScore: 3, total: 3 }))
      .toEqual({ ok: false, error: 'bank_mismatch' });
  });
});

describe('create + accept', () => {
  it('records the server-graded score, not the claimed one', async () => {
    mockUid = 'chal';
    const c = await call(createHandler, { categoryId: 'capitals', questionIdxs: idxs, score: 3, answers: ['Paris', 'faux', null], bankHash: HASH });
    expect(c.status).toBe(200);
    const doc = mockDb.store.get(`challenges/${c.body.code}`) as any;
    expect(doc).toMatchObject({ challengerScore: 1, challengerScoreSource: 'server', bankHash: HASH });

    mockUid = 'opp';
    const a = await call(acceptHandler, { code: c.body.code, score: 3, answers: ['Paris', '4', null], bankHash: HASH });
    expect(a.status).toBe(200);
    expect(a.body).toMatchObject({ opponentScore: 2, challengerScore: 1, result: 'won' });
    expect((mockDb.store.get(`challenges/${c.body.code}`) as any).opponent).toMatchObject({ score: 2, scoreSource: 'server' });
  });

  it('an older build (score only) still works, recorded as unverified', async () => {
    mockUid = 'chal';
    const c = await call(createHandler, { categoryId: 'capitals', questionIdxs: idxs, score: 2 });
    expect(mockDb.store.get(`challenges/${c.body.code}`)).toMatchObject({ challengerScore: 2, challengerScoreSource: 'client' });
    mockUid = 'opp';
    const a = await call(acceptHandler, { code: c.body.code, score: 9 });
    expect(a.body).toMatchObject({ opponentScore: 3 }); // clamped to the round
    expect((mockDb.store.get(`challenges/${c.body.code}`) as any).opponent.scoreSource).toBe('client');
  });

  it('a duel already in flight (no bank hash) is graded when the new client sends picks', async () => {
    const code = 'ABCDEFGH';
    mockDb.store.set(`challenges/${code}`, {
      code, challengerUid: 'chal', categoryId: 'capitals', questionIdxs: idxs, total: 3, challengerScore: 1, opponent: null, status: 'open',
    });
    mockUid = 'opp';
    const a = await call(acceptHandler, { code, score: 3, answers: ['Lyon', '4', 'Haïti'], bankHash: HASH });
    expect(a.body).toMatchObject({ opponentScore: 2, result: 'won' });
  });

  it('an opponent on a different bank build is refused before anything is recorded', async () => {
    mockUid = 'chal';
    const c = await call(createHandler, { categoryId: 'capitals', questionIdxs: idxs, score: 0, answers: [null, null, null], bankHash: HASH });
    mockUid = 'opp';
    const a = await call(acceptHandler, { code: c.body.code, score: 3, answers: ['Paris', '4', 'Haïti'], bankHash: 'b12345678' });
    expect(a.status).toBe(409);
    expect(a.body.error).toBe('bank_mismatch');
    expect((mockDb.store.get(`challenges/${c.body.code}`) as any).opponent).toBeNull();
  });
});
