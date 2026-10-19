const mockAuth = jest.fn(), mockLimit = jest.fn(), mockView = jest.fn(), mockCreate = jest.fn();
jest.mock('../_lib/requireAuth', () => ({ requireAuth: (...args: unknown[]) => mockAuth(...args) }));
jest.mock('../_lib/firebaseAdmin', () => ({ getDb: () => ({}) }));
jest.mock('../_lib/rateLimit', () => ({ checkRateLimit: (...args: unknown[]) => mockLimit(...args) }));
jest.mock('../_lib/progressShare', () => ({
  viewShare: (...args: unknown[]) => mockView(...args),
  createShare: (...args: unknown[]) => mockCreate(...args),
  listShares: jest.fn(), revokeShare: jest.fn(),
}));
import handler from '../progress-share';

async function call(req: any) {
  const out: any = { headers: {} };
  const res: any = {
    setHeader: (k: string, v: string) => { out.headers[k] = v; return res; },
    status: (s: number) => { out.status = s; return res; },
    json: (b: unknown) => { out.body = b; return res; },
  };
  await handler({ headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }, query: {}, ...req }, res);
  return out;
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  mockLimit.mockResolvedValue({ allowed: true });
});

it('serves the public view signed out, never cached or indexed, keyed by a hashed address', async () => {
  mockView.mockResolvedValue({ status: 'revoked' });
  const out = await call({ method: 'GET', query: { token: 'a'.repeat(32) } });
  expect(out.status).toBe(200);
  expect(out.body).toEqual({ status: 'revoked' });
  expect(out.headers['Cache-Control']).toBe('private, no-store');
  expect(out.headers['X-Robots-Tag']).toMatch(/noindex/);
  expect(mockAuth).not.toHaveBeenCalled();
  const [key, bucket] = mockLimit.mock.calls[0];
  expect(bucket).toBe('progress-share-view');
  expect(key).toMatch(/^ip_[a-f0-9]{24}$/);
  expect(key).not.toContain('203.0.113.9');
});

it('rate-limits the public view before any lookup', async () => {
  mockLimit.mockResolvedValue({ allowed: false });
  const out = await call({ method: 'GET', query: { token: 'a'.repeat(32) } });
  expect(out.status).toBe(429);
  expect(mockView).not.toHaveBeenCalled();
});

it('logs the view with no token, uid or address', async () => {
  mockView.mockResolvedValue({ status: 'ok', progress: {} });
  const spy = console.info as jest.Mock;
  await call({ method: 'GET', query: { token: 'b'.repeat(32) } });
  const line = spy.mock.calls.map((c) => c[0]).join('\n');
  expect(line).toContain('releve_link_viewed');
  expect(line).not.toContain('b'.repeat(32));
  expect(line).not.toContain('203.0.113.9');
});

it('owner actions require sign-in and take the owner from the token, never the body', async () => {
  mockAuth.mockImplementationOnce(async (_req: unknown, res: any) => { res.status(401).json({ error: 'unauthorized' }); return null; });
  expect((await call({ method: 'POST', body: { action: 'create' } })).status).toBe(401);
  mockAuth.mockResolvedValue('owner');
  mockCreate.mockResolvedValue({ token: 't', id: 'h' });
  const out = await call({ method: 'POST', body: { action: 'create', days: 30, uid: 'victim' } });
  expect(out.status).toBe(200);
  expect(mockCreate).toHaveBeenCalledWith(expect.anything(), 'owner', 30, expect.any(Number));
});
