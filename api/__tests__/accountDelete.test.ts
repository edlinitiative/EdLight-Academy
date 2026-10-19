const calls: string[] = [];
const empty = { get: async () => ({ docs: [] }) };
const mockDb = {
  recursiveDelete: async (ref: { path: string }) => { calls.push(`recursiveDelete:${ref.path}`); },
  collection: (name: string) => ({
    doc: (id: string) => ({ path: `${name}/${id}`, delete: async () => { calls.push(`delete:${name}/${id}`); } }),
    listDocuments: async () => [],
    where: () => empty,
  }),
  collectionGroup: () => ({ where: () => empty }),
  batch: () => ({ delete: () => undefined, commit: async () => undefined }),
};
const mockErase = jest.fn(async () => {
  calls.push('competition');
  return { warnings: ['competition_discover_audit: index missing'] };
});
jest.mock('../_lib/firebaseAdmin', () => ({
  getDb: () => mockDb,
  isAdminConfigured: () => true,
  getAuthAdmin: () => ({ deleteUser: async () => { calls.push('auth'); } }),
}));
jest.mock('../_lib/requireAuth', () => ({ requireAuth: async () => 'u1' }));
jest.mock('../_lib/competitionAccountDeletion', () => ({
  eraseCompetitionAccount: (...args: unknown[]) => mockErase(...(args as [])),
}));
import handler from '../users/delete';

function res() {
  const out: { status?: number; body?: any } = {};
  const r: any = {
    setHeader: () => r,
    status: (s: number) => { out.status = s; return r; },
    json: (b: unknown) => { out.body = b; return r; },
  };
  return { r, out };
}

beforeEach(() => { calls.length = 0; jest.spyOn(console, 'error').mockImplementation(() => undefined); });

it('erases competition records before the user tree and the Auth account, surfacing their warnings', async () => {
  const { r, out } = res();
  await handler({ method: 'POST', headers: {} } as any, r);
  expect(mockErase).toHaveBeenCalledWith(mockDb, 'u1', expect.any(Number));
  expect(calls.slice(0, 3)).toEqual(['competition', 'recursiveDelete:users/u1', 'auth']);
  // The server-only tombstone outlives everything else, so a retried deletion reuses it.
  expect(calls[calls.length - 1]).toBe('delete:accountDeletions/u1');
  expect(out.status).toBe(200);
  expect(out.body.warnings).toEqual(['competition_discover_audit: index missing']);
});

it('still deletes the account when the competition step throws', async () => {
  mockErase.mockImplementationOnce(async () => { throw new Error('boom'); });
  const { r, out } = res();
  await handler({ method: 'POST', headers: {} } as any, r);
  expect(calls).toContain('auth');
  expect(out.status).toBe(200);
  expect(out.body.warnings).toEqual(['competition: boom']);
});
