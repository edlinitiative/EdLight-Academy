const mockAuth = jest.fn(), mockAdmin = jest.fn(), mockApplication = jest.fn(), mockTeacher = jest.fn(), mockSet = jest.fn(), mockJoin = jest.fn();
jest.mock('../_lib/requireAuth', () => ({ requireAuthDecoded: (...args: unknown[]) => mockAuth(...args) }));
jest.mock('../_lib/firebaseAdmin', () => ({
  getDb: () => ({ doc: () => ({ get: () => mockApplication(), set: (...args: unknown[]) => mockSet(...args) }) }),
  getAuthAdmin: () => ({ getUserByEmail: (...args: unknown[]) => mockTeacher(...args) }),
}));
jest.mock('../arena/_shared', () => ({ isAdminUid: (...args: unknown[]) => mockAdmin(...args) }));
jest.mock('../_lib/rateLimit', () => ({ checkRateLimit: async () => ({ allowed: true }) }));
jest.mock('../_lib/classSpaces', () => ({ joinClass: (...args: unknown[]) => mockJoin(...args) }));
import handler from '../classes';
async function call(body: any) {
  const out: any = {}; const res: any = { setHeader: jest.fn(), status: (status: number) => { out.status = status; return res; }, json: (data: unknown) => { out.body = data; } };
  await handler({ method: 'POST', body } as any, res); return out;
}
beforeEach(() => { jest.clearAllMocks(); mockAuth.mockResolvedValue({ uid: 'caller', name: 'Alias' }); mockAdmin.mockResolvedValue(false); });
it('requires explicit consent before sending a join request', async () => {
  expect((await call({ action: 'join', code: 'ABC234' })).status).toBe(400); expect(mockJoin).not.toHaveBeenCalled();
});
it('takes membership identity from the token, never a uid supplied in the body', async () => {
  mockJoin.mockResolvedValue({ pending: true });
  expect((await call({ action: 'join', code: 'ABC234', consent: true, uid: 'victim' })).status).toBe(200);
  expect(mockJoin).toHaveBeenCalledWith(expect.anything(), 'caller', 'Alias', 'ABC234', expect.any(Number));
});
it('only administrators can authorize classroom teachers', async () => {
  expect((await call({ action: 'grant-teacher', applicationId: 'app1' })).status).toBe(403); expect(mockTeacher).not.toHaveBeenCalled();
});
it('binds an approved application to its verified email account', async () => {
  mockAdmin.mockResolvedValue(true); mockApplication.mockResolvedValue({ exists: true, id: 'app1', data: () => ({ status: 'approved', email: 'teacher@example.org' }) });
  mockTeacher.mockResolvedValue({ uid: 'teacher', emailVerified: false });
  expect((await call({ action: 'grant-teacher', applicationId: 'app1', teacherUid: 'victim' })).status).toBe(403);
  mockTeacher.mockResolvedValue({ uid: 'teacher', emailVerified: true });
  expect((await call({ action: 'grant-teacher', applicationId: 'app1' })).status).toBe(200);
  expect(mockTeacher).toHaveBeenCalledWith('teacher@example.org'); expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ active: true, grantedBy: 'caller' }));
});
