const mockAuth = jest.fn(), mockAdmin = jest.fn(), mockDesignate = jest.fn(), mockDashboard = jest.fn(), mockDirectory = jest.fn(), mockReport = jest.fn();
jest.mock('../_lib/requireAuth', () => ({ requireAuth: (...args: unknown[]) => mockAuth(...args) }));
jest.mock('../_lib/firebaseAdmin', () => ({
  getDb: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({}) }) }) }),
  getAuthAdmin: () => ({ getUserByEmail: async () => ({ uid: 'student', emailVerified: true }) }),
}));
jest.mock('../_lib/rateLimit', () => ({ checkRateLimit: async () => ({ allowed: true }) }));
jest.mock('../arena/_shared', () => ({ isAdminUid: (...args: unknown[]) => mockAdmin(...args) }));
jest.mock('../_lib/ambassadors', () => ({
  designateAmbassador: (...args: unknown[]) => mockDesignate(...args),
  ambassadorDashboard: (...args: unknown[]) => mockDashboard(...args),
  ambassadorDirectory: (...args: unknown[]) => mockDirectory(...args),
  ambassadorReport: (...args: unknown[]) => mockReport(...args),
  revokeAmbassador: jest.fn(), ambassadorRecruitDetail: jest.fn(), setReward: jest.fn(),
}));
import handler from '../ambassadors';
import { AmbassadorError } from '../../shared/ambassadors';
import { signAmbassadorWebhook } from '../_lib/ambassadorApplications';

async function call(req: any) {
  const out: any = { headers: {} };
  const res: any = {
    setHeader: (k: string, v: string) => { out.headers[k] = v; return res; },
    status: (s: number) => { out.status = s; return res; },
    json: (b: unknown) => { out.body = b; return res; },
  };
  await handler({ headers: {}, query: {}, ...req }, res);
  return out;
}
beforeEach(() => { jest.clearAllMocks(); mockAuth.mockResolvedValue('caller'); mockAdmin.mockResolvedValue(false); });

it('serves the badge directory publicly from the CDN', async () => {
  mockDirectory.mockResolvedValue({ uids: ['a'] });
  const out = await call({ method: 'GET', query: { view: 'directory' } });
  expect(out.body).toEqual({ uids: ['a'] });
  expect(out.headers['Cache-Control']).toMatch(/s-maxage=300/);
  expect(mockAuth).not.toHaveBeenCalled();
});

it('only administrators can designate, report or record rewards', async () => {
  for (const action of ['designate', 'revoke', 'report', 'recruits', 'reward']) {
    const out = await call({ method: 'POST', body: { action, uid: 'x', school: 'École', period: '2026-10' } });
    expect(out.status).toBe(403);
  }
  expect(mockDesignate).not.toHaveBeenCalled();
  expect(mockReport).not.toHaveBeenCalled();
  mockAdmin.mockResolvedValue(true);
  mockDesignate.mockResolvedValue({ ok: true });
  expect((await call({ method: 'POST', body: { action: 'designate', uid: 'x', school: 'École' } })).status).toBe(200);
  expect(mockDesignate).toHaveBeenCalledWith(expect.anything(), 'caller', 'x', 'École', expect.any(Number));
});

it('the dashboard belongs to the token holder and refuses non-ambassadors', async () => {
  mockDashboard.mockRejectedValue(new AmbassadorError('forbidden'));
  const out = await call({ method: 'POST', body: { action: 'dashboard', uid: 'victim' } });
  expect(out.status).toBe(403);
  expect(mockDashboard).toHaveBeenCalledWith(expect.anything(), 'caller', expect.any(Number));
});

describe('EdLight Apply webhook', () => {
  const SECRET = 'route-secret-0123456789abcdef';
  const body = JSON.stringify({ applicationId: 'app_1', academyEmail: 'jean@example.org', school: 'Lycée Pétion', decision: 'approve', reviewerName: 'Marie' });
  const signed = (raw = body, at = Math.floor(Date.now() / 1000), secret = SECRET) => ({
    method: 'POST', query: { action: 'ambassador-application' }, body: raw,
    headers: { 'x-edlight-timestamp': String(at), 'x-edlight-signature': signAmbassadorWebhook(secret, String(at), raw) },
  });
  beforeEach(() => { process.env.AMBASSADOR_WEBHOOK_SECRET = SECRET; });
  afterAll(() => { delete process.env.AMBASSADOR_WEBHOOK_SECRET; });

  it('designates on a valid signature alone, with Apply provenance and a ledger id', async () => {
    mockDesignate.mockResolvedValue({ ok: true, uid: 'student' });
    const out = await call(signed());
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ ok: true, uid: 'student' });
    expect(mockAuth).not.toHaveBeenCalled();
    expect(mockDesignate).toHaveBeenCalledWith(expect.anything(), 'edlight-apply', 'student', 'Lycée Pétion', expect.any(Number),
      { source: 'edlight-apply', applicationId: 'app_1', reviewerName: 'Marie', ledgerId: 'app_1_approve' });
    expect(out.headers['Cache-Control']).toBe('private, no-store');
  });

  it('accepts a pre-parsed JSON body (same bytes as JSON.stringify)', async () => {
    mockDesignate.mockResolvedValue({ ok: true, uid: 'student' });
    const req = signed();
    expect((await call({ ...req, body: JSON.parse(body) })).status).toBe(200);
  });

  it('refuses a bad or stale signature before touching any account', async () => {
    const bad = await call(signed(body, Math.floor(Date.now() / 1000), 'wrong-secret-0123456789abcdef'));
    expect(bad).toMatchObject({ status: 401, body: { error: 'invalid_signature' } });
    const stale = await call(signed(body, Math.floor(Date.now() / 1000) - 600));
    expect(stale).toMatchObject({ status: 401, body: { error: 'stale_request' } });
    const tampered = { ...signed(), body: body.replace('approve', 'revoke') };
    expect((await call(tampered)).body).toEqual({ error: 'invalid_signature' });
    expect(mockDesignate).not.toHaveBeenCalled();
  });

  it('is closed when the secret is not set, and passes refusal codes through', async () => {
    delete process.env.AMBASSADOR_WEBHOOK_SECRET;
    expect(await call(signed())).toMatchObject({ status: 503, body: { error: 'not_configured' } });
    process.env.AMBASSADOR_WEBHOOK_SECRET = SECRET;
    mockDesignate.mockRejectedValue(new AmbassadorError('school_full'));
    expect(await call(signed())).toMatchObject({ status: 409, body: { error: 'school_full' } });
  });
});
