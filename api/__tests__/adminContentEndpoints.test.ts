/**
 * Admin-only endpoints for reviewed explanations and essay calibration:
 * 401 without a valid token, 403 for a non-admin (role on users/{uid}, as in
 * firestore.rules), 200 for an admin. The student vote path of
 * /api/explanations needs a signed-in user but no role.
 */
import { FakeDb } from './helpers/fakeFirestore';

const mockDb = new FakeDb();
jest.mock('../_lib/firebaseAdmin', () => ({
  getDb: () => mockDb,
  isAdminConfigured: () => true,
  verifyIdToken: async (token: string) => {
    if (token === 'admin-token') return { uid: 'adm1', name: 'Admin' };
    if (token === 'student-token') return { uid: 'stu1' };
    throw new Error('bad token');
  },
}));
jest.mock('../_lib/rateLimit', () => ({ checkRateLimit: async () => ({ allowed: true, remaining: 9, resetAt: 0 }) }));
jest.mock('../_lib/sandraProbes', () => ({ resolveOrigin: () => 'https://example.test' }));
jest.mock('../_lib/essayGrader', () => ({
  gradeEssay: async () => ({ ok: true, body: { graded: true, ratio: 0.6, criteria: [{ label: 'Plan', level: 1 }], wordStatus: 'ok', rubricProfile: 'dissertation' } }),
}));

import explanations from '../explanations';
import calibration from '../essay-calibration';

type Out = { status?: number; body?: any };
function invoke(h: (req: any, res: any) => Promise<void>, req: { method: string; token?: string; body?: any; query?: any }): Promise<Out> {
  const out: Out = {};
  const res: any = {
    headersSent: false,
    setHeader: () => res,
    status: (s: number) => { out.status = s; return res; },
    json: (b: unknown) => { out.body = b; res.headersSent = true; return res; },
  };
  const headers = req.token ? { authorization: `Bearer ${req.token}` } : {};
  return h({ method: req.method, headers, body: req.body, query: req.query || {} }, res).then(() => out);
}

beforeEach(() => {
  mockDb.store.clear();
  mockDb.store.set('users/adm1', { role: 'admin', full_name: 'Ted Admin' });
  mockDb.store.set('users/stu1', { role: 'student' });
  mockDb.store.set('explanations/exam_ex_abc-0_fr', { key: 'exam_ex_abc-0_fr', status: 'approved', text: 'T', uses: 3, helpful: 0, notHelpful: 0, lang: 'fr' });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('/api/explanations', () => {
  it('admin list: 401 without token, 401 bad token, 403 student, 200 admin', async () => {
    expect((await invoke(explanations, { method: 'GET' })).status).toBe(401);
    expect((await invoke(explanations, { method: 'GET', token: 'nope' })).status).toBe(401);
    expect((await invoke(explanations, { method: 'GET', token: 'student-token' })).status).toBe(403);
    const ok = await invoke(explanations, { method: 'GET', token: 'admin-token', query: { status: 'approved' } });
    expect(ok.status).toBe(200);
    expect(ok.body.explanations).toHaveLength(1);
  });

  it('admin review: 403 for a student, 200 with audit fields for an admin', async () => {
    const body = { action: 'review', id: 'exam_ex_abc-0_fr', decision: 'reject' };
    expect((await invoke(explanations, { method: 'POST', body })).status).toBe(401);
    expect((await invoke(explanations, { method: 'POST', token: 'student-token', body })).status).toBe(403);
    expect(mockDb.store.get('explanations/exam_ex_abc-0_fr')?.status).toBe('approved');
    const ok = await invoke(explanations, { method: 'POST', token: 'admin-token', body });
    expect(ok.status).toBe(200);
    expect(ok.body.explanation).toMatchObject({ status: 'rejected', reviewedBy: 'adm1', reviewedByName: 'Ted Admin' });
    expect((await invoke(explanations, { method: 'POST', token: 'admin-token', body: { ...body, id: '../x' } })).status).toBe(400);
  });

  it('student vote: 401 signed out, 200 signed in, deduped', async () => {
    const body = { action: 'vote', id: 'exam_ex_abc-0_fr', helpful: true };
    expect((await invoke(explanations, { method: 'POST', body })).status).toBe(401);
    const first = await invoke(explanations, { method: 'POST', token: 'student-token', body });
    expect(first).toMatchObject({ status: 200, body: { outcome: 'counted' } });
    const again = await invoke(explanations, { method: 'POST', token: 'student-token', body });
    expect(again).toMatchObject({ status: 200, body: { outcome: 'duplicate' } });
    expect(mockDb.store.get('explanations/exam_ex_abc-0_fr')?.helpful).toBe(1);
    expect((await invoke(explanations, { method: 'POST', token: 'student-token', body: { ...body, helpful: 'yes' } })).status).toBe(400);
  });
});

describe('/api/essay-calibration', () => {
  const rows = [{ prompt: 'Le bonheur dépend-il de nous ?', studentText: 'Un texte inventé.', teacherScore: 12, maxScore: 20 }];

  it('401 without token, 403 student, 200 admin (list, create, step, get, delete)', async () => {
    expect((await invoke(calibration, { method: 'GET' })).status).toBe(401);
    expect((await invoke(calibration, { method: 'GET', token: 'student-token' })).status).toBe(403);
    expect((await invoke(calibration, { method: 'POST', token: 'student-token', body: { action: 'create', rows } })).status).toBe(403);
    expect((await invoke(calibration, { method: 'GET', token: 'admin-token' })).body.runs).toEqual([]);

    const created = await invoke(calibration, { method: 'POST', token: 'admin-token', body: { action: 'create', rows } });
    expect(created.status).toBe(200);
    const { runId } = created.body;
    expect(runId).toMatch(/^cal_[a-f0-9]{20}$/);
    const step = await invoke(calibration, { method: 'POST', token: 'admin-token', body: { action: 'step', runId } });
    expect(step).toMatchObject({ status: 200, body: { processed: 1, graded: 1, total: 1, complete: true } });
    const got = await invoke(calibration, { method: 'GET', token: 'admin-token', query: { runId } });
    expect(got.body.items[0]).toMatchObject({ status: 'graded', ai: { ratio: 0.6 } });
    expect(got.body.run).toMatchObject({ createdBy: 'adm1', status: 'complete' });
    const del = await invoke(calibration, { method: 'POST', token: 'admin-token', body: { action: 'delete', runId } });
    expect(del.status).toBe(200);
    expect([...mockDb.store.keys()].some((k) => k.startsWith('essayCalibration/'))).toBe(false);
  });

  it('rejects an invalid row server-side', async () => {
    const bad = await invoke(calibration, { method: 'POST', token: 'admin-token', body: { action: 'create', rows: [{ prompt: 'x', studentText: 't', teacherScore: 25, maxScore: 20 }] } });
    expect(bad).toMatchObject({ status: 400, body: { error: 'invalid_row', row: 1 } });
  });
});
