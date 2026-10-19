const mockAuth = jest.fn(), mockAdmin = jest.fn(), mockDesignate = jest.fn(), mockDashboard = jest.fn(), mockDirectory = jest.fn(), mockReport = jest.fn();
jest.mock('../_lib/requireAuth', () => ({ requireAuth: (...args: unknown[]) => mockAuth(...args) }));
jest.mock('../_lib/firebaseAdmin', () => ({ getDb: () => ({}) }));
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
