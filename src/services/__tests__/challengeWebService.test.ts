const mockUser = { uid: 'u1', getIdToken: jest.fn().mockResolvedValue('tok') };
jest.mock('../firebase', () => ({
  auth: { authStateReady: jest.fn().mockResolvedValue(undefined), get currentUser() { return mockUser; } },
  db: {},
}));

import { acceptChallenge, createChallenge, rememberReceived, receivedCodes, toChallenge } from '../challengeWebService';

const fetchMock = jest.fn();
beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  (global as any).fetch = fetchMock;
});

const respond = (status: number, body: unknown) => fetchMock.mockResolvedValueOnce({ status, json: async () => body });

describe('server calls', () => {
  it('mints a duel with the bearer token and the exact payload the server validates', async () => {
    respond(200, { ok: true, code: 'AB2CD3EF', url: 'https://academy.edlight.org/defi/AB2CD3EF', appUrl: 'edlight://defi/AB2CD3EF', expiresAt: 99 });
    const r = await createChallenge({ categoryId: 'capitals', questionIdxs: [3, 1], score: 2 });
    expect(r).toEqual({ ok: true, challenge: { code: 'AB2CD3EF', url: 'https://academy.edlight.org/defi/AB2CD3EF', appUrl: 'edlight://defi/AB2CD3EF', expiresAt: 99 } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/challenges/create');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ categoryId: 'capitals', questionIdxs: [3, 1], score: 2 });
  });
  it('reports the server’s refusal code', async () => {
    respond(409, { error: 'already_played' });
    expect(await acceptChallenge({ code: 'AB2CD3EF', score: 5 })).toEqual({ ok: false, error: 'already_played' });
    respond(429, { error: 'rate_limit_exceeded' });
    expect((await createChallenge({ categoryId: 'x', questionIdxs: [0], score: 0 })).error).toBe('rate_limit_exceeded');
  });
  it('reports a network failure distinctly', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await acceptChallenge({ code: 'AB2CD3EF', score: 5 })).toEqual({ ok: false, error: 'network' });
  });
  it('passes the server’s outcome through untouched', async () => {
    respond(200, { ok: true, result: 'won', challengerScore: 4, opponentScore: 7, total: 10, xpAwarded: 20 });
    expect(await acceptChallenge({ code: 'AB2CD3EF', score: 7 })).toEqual({
      ok: true, result: 'won', challengerScore: 4, opponentScore: 7, total: 10, xpAwarded: 20,
    });
  });
});

describe('toChallenge', () => {
  it('reads Timestamps and plain numbers, and an unplayed duel', () => {
    const ts = (ms: number) => ({ toMillis: () => ms });
    const c = toChallenge('AB2CD3EF', {
      challengerUid: 'a', challengerName: 'Ana B.', categoryId: 'flags', questionIdxs: [1, 2], total: 2,
      challengerScore: 1, createdAt: ts(10), expiresAt: 20, opponent: null, status: 'open',
    });
    expect(c).toMatchObject({ code: 'AB2CD3EF', createdAt: 10, expiresAt: 20, opponent: null, status: 'open' });
  });
  it('reads a played duel', () => {
    const c = toChallenge('X', { status: 'played', opponent: { uid: 'b', name: null, score: '3', playedAt: 5 } });
    expect(c.opponent).toEqual({ uid: 'b', name: null, score: 3, playedAt: 5 });
    expect(c.status).toBe('played');
  });
});

describe('duels received on this device', () => {
  it('remembers codes per account, newest first, without duplicates', () => {
    rememberReceived('u1', 'AAAAAAAA');
    rememberReceived('u1', 'BBBBBBBB');
    rememberReceived('u1', 'AAAAAAAA');
    rememberReceived('u2', 'CCCCCCCC');
    expect(receivedCodes('u1')).toEqual(['AAAAAAAA', 'BBBBBBBB']);
    expect(receivedCodes('u2')).toEqual(['CCCCCCCC']);
    expect(receivedCodes(null)).toEqual([]);
  });
  it('survives corrupt storage', () => {
    localStorage.setItem('edlight:duels:received', 'not json');
    expect(receivedCodes('u1')).toEqual([]);
    rememberReceived('u1', 'AAAAAAAA');
  });
});
