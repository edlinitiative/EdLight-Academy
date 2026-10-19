import type { Firestore } from 'firebase-admin/firestore';
import { FakeDb } from './helpers/fakeFirestore';

const mockDb = new FakeDb();
jest.mock('../_lib/firebaseAdmin', () => ({
  getDb: () => mockDb,
  isAdminConfigured: () => true,
}));
jest.mock('../_lib/rateLimit', () => ({
  checkRateLimit: async () => ({ allowed: true, remaining: 99, resetAt: 0 }),
}));
jest.mock('../_lib/requireAuth', () => ({
  requireAuthDecoded: async (req: any, res: any) => {
    const uid = String(req.headers.authorization || '').replace('Bearer ', '');
    if (!uid) {
      res.status(401).json({ error: 'unauthorized' });
      return null;
    }
    return { uid, name: uid };
  },
}));
jest.mock('../_lib/competitionNotify', () => ({
  deliverCompetitionNotices: jest.fn().mockResolvedValue(undefined),
}));

import handler from '../competition';
import { mutateCompetition } from '../_lib/competition';
import {
  CONFIG_PATH,
  competitionFlags,
  resetCompetitionFlagsCache,
} from '../_lib/platformConfig';
import { resolveCompetitionFlags } from '../../shared/competition/flags';

const db = mockDb as unknown as Firestore;
const ENV = ['COMPETITION_CREATION_ENABLED', 'COMPETITION_DISCOVERY_ENABLED', 'COMPETITION_TEAM_MODES_ENABLED'];

function call(body: Record<string, unknown>, uid?: string) {
  const res: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
  const req: any = {
    method: 'POST',
    headers: uid ? { authorization: `Bearer ${uid}` } : {},
    body,
    query: {},
    socket: {},
  };
  return { req, res, run: () => handler(req, res) };
}

beforeEach(() => {
  mockDb.store.clear();
  resetCompetitionFlagsCache();
  for (const k of ENV) delete process.env[k];
  mockDb.store.set('users/admin1', { role: 'admin', displayName: 'Ted' });
  mockDb.store.set('users/student1', { role: 'student', displayName: 'Ana' });
});
afterAll(() => {
  for (const k of ENV) delete process.env[k];
});

describe('resolveCompetitionFlags', () => {
  it('keeps the env-only semantics when nothing is stored', () => {
    const s = resolveCompetitionFlags(null, {});
    expect(s.effective).toEqual({ creationEnabled: false, discoveryEnabled: true, teamModesEnabled: false });
    expect(s.source).toEqual({ creationEnabled: 'env', discoveryEnabled: 'env', teamModesEnabled: 'env' });
    expect(resolveCompetitionFlags(null, { COMPETITION_DISCOVERY_ENABLED: 'false' }).effective.discoveryEnabled).toBe(false);
  });
  it('prefers a stored boolean over the env default, per flag', () => {
    const s = resolveCompetitionFlags(
      { creationEnabled: false, discoveryEnabled: false },
      { COMPETITION_CREATION_ENABLED: 'true', COMPETITION_TEAM_MODES_ENABLED: 'true' },
    );
    expect(s.effective.creationEnabled).toBe(false);
    expect(s.effective.discoveryEnabled).toBe(false);
    expect(s.source.creationEnabled).toBe('config');
    expect(s.source.teamModesEnabled).toBe('env');
  });
  it('team modes are effective only with creation', () => {
    const off = resolveCompetitionFlags({ teamModesEnabled: true }, {});
    expect(off.own.teamModesEnabled).toBe(true);
    expect(off.effective.teamModesEnabled).toBe(false);
    expect(resolveCompetitionFlags({ teamModesEnabled: true, creationEnabled: true }, {}).effective.teamModesEnabled).toBe(true);
  });
});

describe('competitionFlags cache', () => {
  it('caches the stored doc per instance and refreshes on an admin write', async () => {
    mockDb.store.set(CONFIG_PATH, { creationEnabled: true });
    expect((await competitionFlags(db)).creationEnabled).toBe(true);
    // A write behind the instance's back is not seen until the TTL passes…
    mockDb.store.set(CONFIG_PATH, { creationEnabled: false });
    expect((await competitionFlags(db)).creationEnabled).toBe(true);
    // …but an admin write through the API refreshes it at once.
    const r = call({ action: 'platform-config-set', changes: { creationEnabled: false } }, 'admin1');
    await r.run();
    expect(r.res.status).toHaveBeenCalledWith(200);
    expect((await competitionFlags(db)).creationEnabled).toBe(false);
  });
  it('env defaults are re-read every call while nothing is stored', async () => {
    expect((await competitionFlags(db)).creationEnabled).toBe(false);
    process.env.COMPETITION_CREATION_ENABLED = 'true';
    expect((await competitionFlags(db)).creationEnabled).toBe(true);
  });
});

describe('admin API (action platform-config / platform-config-set)', () => {
  it('401 without a token, 403 for a non-admin, 200 for an admin', async () => {
    const anon = call({ action: 'platform-config' });
    await anon.run();
    expect(anon.res.status).toHaveBeenCalledWith(401);
    const student = call({ action: 'platform-config-set', changes: { creationEnabled: true } }, 'student1');
    await student.run();
    expect(student.res.status).toHaveBeenCalledWith(403);
    expect(mockDb.store.has(CONFIG_PATH)).toBe(false);
    const admin = call({ action: 'platform-config' }, 'admin1');
    await admin.run();
    expect(admin.res.status).toHaveBeenCalledWith(200);
    const out = admin.res.json.mock.calls[0][0];
    expect(out.flags.effective.creationEnabled).toBe(false);
    expect(out.audit).toEqual([]);
  });
  it('rejects unknown flags and non-boolean values', async () => {
    for (const changes of [{ banana: true }, { creationEnabled: 'yes' }, {}, null]) {
      const r = call({ action: 'platform-config-set', changes }, 'admin1');
      await r.run();
      expect(r.res.status).toHaveBeenCalledWith(400);
    }
  });
  it('writes the doc and one audit record per changed flag; null resets to the default', async () => {
    const set = call({ action: 'platform-config-set', changes: { creationEnabled: true, teamModesEnabled: true } }, 'admin1');
    await set.run();
    const out = set.res.json.mock.calls[0][0];
    expect(out.flags.effective).toMatchObject({ creationEnabled: true, teamModesEnabled: true });
    expect(out.flags.source.creationEnabled).toBe('config');
    expect(mockDb.store.get(CONFIG_PATH)).toMatchObject({ creationEnabled: true, teamModesEnabled: true, updatedBy: 'admin1' });
    expect(out.audit).toHaveLength(2);
    expect(out.audit[0]).toMatchObject({ by: 'admin1', from: null, to: true });
    expect(out.people.admin1.name).toBeTruthy();

    // No-op change: no new audit.
    await call({ action: 'platform-config-set', changes: { creationEnabled: true } }, 'admin1').run();
    expect(mockDb.childrenOf('platformConfigAudit')).toHaveLength(2);

    const reset = call({ action: 'platform-config-set', changes: { creationEnabled: null } }, 'admin1');
    await reset.run();
    const after = reset.res.json.mock.calls[0][0];
    expect(after.flags.source.creationEnabled).toBe('env');
    expect(after.flags.effective).toMatchObject({ creationEnabled: false, teamModesEnabled: false });
    expect(mockDb.store.get(CONFIG_PATH)).not.toHaveProperty('creationEnabled');
    expect(mockDb.childrenOf('platformConfigAudit').map(([, d]) => d)).toContainEqual(
      expect.objectContaining({ flag: 'creationEnabled', from: true, to: null, by: 'admin1' }),
    );
  });
});

describe('enforcement follows the stored switch', () => {
  it('a stored "off" refuses creation even when the env says on, and "on" allows it', async () => {
    process.env.COMPETITION_CREATION_ENABLED = 'true';
    mockDb.store.set(CONFIG_PATH, { creationEnabled: false });
    await expect(
      mutateCompetition(db, 'student1', 'Ana', { action: 'team-create', operationId: 'op_a', name: 'Les étoiles' }, Date.now()),
    ).rejects.toMatchObject({ code: 'pilot_not_enabled' });
    delete process.env.COMPETITION_CREATION_ENABLED;
    mockDb.store.set(CONFIG_PATH, { creationEnabled: true });
    resetCompetitionFlagsCache();
    await expect(
      mutateCompetition(db, 'student1', 'Ana', { action: 'team-create', operationId: 'op_b', name: 'Les étoiles' }, Date.now()),
    ).resolves.toMatchObject({ ok: true });
  });
  it('mine and directory surface the effective values', async () => {
    mockDb.store.set(CONFIG_PATH, { creationEnabled: true, teamModesEnabled: true, discoveryEnabled: false });
    const mine = call({ action: 'mine' }, 'student1');
    await mine.run();
    expect(mine.res.json.mock.calls[0][0]).toMatchObject({ creationEnabled: true, teamModesEnabled: true });
    mockDb.store.set('competitionDirectory/e1', { id: 'e1', startsAt: Date.now() + 1000, title: 'X' });
    const dir = call({ action: 'directory' });
    await dir.run();
    expect(dir.res.json.mock.calls[0][0].events).toEqual([]);
    mockDb.store.set(CONFIG_PATH, { discoveryEnabled: true });
    resetCompetitionFlagsCache();
    const open = call({ action: 'directory' });
    await open.run();
    expect(open.res.json.mock.calls[0][0].events).toHaveLength(1);
  });
});
