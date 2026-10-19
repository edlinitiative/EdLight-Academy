import { MetaDb } from './helpers/metaDb';
import {
  parseAmbassadorApplication, processAmbassadorApplication, resolveAcademyAccount, signAmbassadorWebhook, verifyAmbassadorWebhook, WEBHOOK_MAX_SKEW_MS,
} from '../_lib/ambassadorApplications';
import { ambassadorReport, designateAmbassador } from '../_lib/ambassadors';
import { seedSchools } from '../../shared/schools';

const SECRET = 'test-secret-0123456789abcdef';
const now = Date.UTC(2026, 9, 19, 15);
const ts = String(Math.floor(now / 1000));
let memory: MetaDb;
const db = () => memory as any;
const accounts: Record<string, string> = { 'jean@example.org': 'amb', 'rose@example.org': 'rose', 'third@example.org': 'third', 'ghost@example.org': 'ghost', 'unverified@example.org': 'amb' };
const auth = {
  getUserByEmail: jest.fn(async (email: string) => {
    const uid = accounts[email];
    if (!uid) throw Object.assign(new Error('no user'), { code: 'auth/user-not-found' });
    return { uid, emailVerified: email !== 'unverified@example.org' };
  }),
};
const payload = (extra: Record<string, unknown> = {}) => ({
  applicationId: 'app_1', academyEmail: 'Jean@Example.org', school: 'Lycée Pétion', decision: 'approve', reviewerName: 'Marie Revue', ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  memory = new MetaDb();
  memory.put('users/amb', { full_name: 'Jean Baptiste' });
  memory.put('users/rose', { full_name: 'Rose Michel' });
  memory.put('users/third', { full_name: 'Third Person' });
  // `ghost` exists in Auth but never opened Academy: no users/ profile.
});

describe('signature', () => {
  const body = JSON.stringify(payload());
  const check = (over: Partial<Parameters<typeof verifyAmbassadorWebhook>[0]> = {}) => verifyAmbassadorWebhook({
    secret: SECRET, timestamp: ts, signature: signAmbassadorWebhook(SECRET, ts, body), rawBody: body, now, ...over,
  });
  it('accepts a fresh request signed with the shared secret', () => {
    expect(check()).toBeNull();
    expect(signAmbassadorWebhook(SECRET, ts, body)).toMatch(/^sha256=[0-9a-f]{64}$/);
  });
  it('refuses a wrong secret, a tampered body, a moved timestamp or a missing header', () => {
    expect(check({ signature: signAmbassadorWebhook('another-secret-0123456789', ts, body) })).toBe('invalid_signature');
    expect(check({ rawBody: body.replace('Pétion', 'Petion') })).toBe('invalid_signature');
    // The timestamp is signed: changing it to look fresh breaks the signature.
    expect(check({ timestamp: String(Number(ts) + 1) })).toBe('invalid_signature');
    expect(check({ signature: undefined })).toBe('invalid_signature');
    expect(check({ timestamp: 'yesterday' })).toBe('invalid_signature');
    expect(check({ signature: 'sha256=short' })).toBe('invalid_signature');
  });
  it('refuses a correctly signed request older or newer than 5 minutes', () => {
    const old = String(Math.floor((now - WEBHOOK_MAX_SKEW_MS - 1000) / 1000));
    expect(check({ timestamp: old, signature: signAmbassadorWebhook(SECRET, old, body) })).toBe('stale_request');
    const future = String(Math.floor((now + WEBHOOK_MAX_SKEW_MS + 1000) / 1000));
    expect(check({ timestamp: future, signature: signAmbassadorWebhook(SECRET, future, body) })).toBe('stale_request');
    const edge = String(Math.floor((now - WEBHOOK_MAX_SKEW_MS + 2000) / 1000));
    expect(check({ timestamp: edge, signature: signAmbassadorWebhook(SECRET, edge, body) })).toBeNull();
  });
  it('is closed until the secret is configured', () => {
    expect(check({ secret: undefined })).toBe('not_configured');
    expect(check({ secret: 'short' })).toBe('not_configured');
  });
});

describe('payload', () => {
  it('validates ids, email and decision, and prefers a known Academy school key', () => {
    expect(() => parseAmbassadorApplication(payload({ applicationId: '../x' }))).toThrow('invalid_input');
    expect(() => parseAmbassadorApplication(payload({ academyEmail: 'nope' }))).toThrow('invalid_input');
    expect(() => parseAmbassadorApplication(payload({ decision: 'maybe' }))).toThrow('invalid_input');
    expect(() => parseAmbassadorApplication(payload({ school: '' }))).toThrow('invalid_input');
    expect(parseAmbassadorApplication(payload()).academyEmail).toBe('jean@example.org');
    const seeded = seedSchools()[0];
    expect(parseAmbassadorApplication(payload({ school: 'typed differently', schoolKey: seeded.key })).school).toBe(seeded.name);
    expect(parseAmbassadorApplication(payload({ schoolKey: 'not a key' })).school).toBe('Lycée Pétion');
  });
});

describe('account resolution', () => {
  it('needs an Auth account with an Academy profile', async () => {
    expect(await resolveAcademyAccount(db(), auth, 'jean@example.org')).toBe('amb');
    await expect(resolveAcademyAccount(db(), auth, 'nobody@example.org')).rejects.toMatchObject({ code: 'account_not_found' });
    await expect(resolveAcademyAccount(db(), auth, 'ghost@example.org')).rejects.toMatchObject({ code: 'account_not_found' });
  });
  it('refuses an account whose email is not verified, even with a profile', async () => {
    await expect(resolveAcademyAccount(db(), auth, 'unverified@example.org')).rejects.toMatchObject({ code: 'email_unverified' });
    await expect(processAmbassadorApplication(db(), auth, payload({ academyEmail: 'unverified@example.org' }), now)).rejects.toMatchObject({ code: 'email_unverified' });
    expect(memory.store.has('ambassadors/amb')).toBe(false);
  });
  it('does not hide an Auth outage as a missing account', async () => {
    const down = { getUserByEmail: async () => { throw Object.assign(new Error('x'), { code: 'auth/internal-error' }); } };
    await expect(resolveAcademyAccount(db(), down, 'jean@example.org')).rejects.toThrow('x');
  });
});

describe('decisions', () => {
  it('approval designates with Apply provenance and an audit record', async () => {
    expect(await processAmbassadorApplication(db(), auth, payload(), now)).toEqual({ ok: true, uid: 'amb' });
    expect(memory.store.get('ambassadors/amb')).toMatchObject({
      active: true, school: 'Lycée Pétion', designatedBy: 'edlight-apply', source: 'edlight-apply', applicationId: 'app_1', reviewerName: 'Marie Revue', name: 'Jean',
    });
    const audit = [...memory.store.entries()].filter(([k]) => k.startsWith('ambassadorAudit/')).map(([, v]) => v);
    expect(audit).toEqual([expect.objectContaining({ action: 'designate', uid: 'amb', source: 'edlight-apply', applicationId: 'app_1', reviewerName: 'Marie Revue' })]);
    const { rows } = await ambassadorReport(db(), '2026-10', now);
    expect(rows[0]).toMatchObject({ source: 'edlight-apply', applicationId: 'app_1', reviewerName: 'Marie Revue' });
  });

  it('a retried approval is applied once', async () => {
    await processAmbassadorApplication(db(), auth, payload(), now);
    const again = await processAmbassadorApplication(db(), auth, payload(), now + 1000);
    expect(again).toEqual({ ok: true, uid: 'amb', replayed: true });
    expect([...memory.store.keys()].filter((k) => k.startsWith('ambassadorAudit/'))).toHaveLength(1);
    expect(memory.store.get('ambassadorApplications/app_1_approve')).toMatchObject({ uid: 'amb', decision: 'approve' });
  });

  it('keeps the two-per-school cap and records nothing when refused', async () => {
    await processAmbassadorApplication(db(), auth, payload(), now);
    await processAmbassadorApplication(db(), auth, payload({ applicationId: 'app_2', academyEmail: 'rose@example.org', school: 'lycee petion' }), now);
    await expect(processAmbassadorApplication(db(), auth, payload({ applicationId: 'app_3', academyEmail: 'third@example.org', school: 'LYCÉE  PÉTION' }), now))
      .rejects.toMatchObject({ code: 'school_full' });
    expect(memory.store.has('ambassadors/third')).toBe(false);
    // Not ledgered: once a place frees up, the same application can be retried.
    expect(memory.store.has('ambassadorApplications/app_3_approve')).toBe(false);
  });

  it('refuses a student who is already an ambassador through another application', async () => {
    await designateAmbassador(db(), 'admin', 'amb', 'Collège Canado', now);
    await expect(processAmbassadorApplication(db(), auth, payload({ applicationId: 'app_9' }), now)).rejects.toMatchObject({ code: 'already_ambassador' });
    expect(memory.store.get('ambassadors/amb')).toMatchObject({ school: 'Collège Canado', source: 'admin' });
  });

  it('reports an unknown or unused account', async () => {
    await expect(processAmbassadorApplication(db(), auth, payload({ academyEmail: 'nobody@example.org' }), now)).rejects.toMatchObject({ code: 'account_not_found' });
    await expect(processAmbassadorApplication(db(), auth, payload({ academyEmail: 'ghost@example.org' }), now)).rejects.toMatchObject({ code: 'account_not_found' });
  });

  it('revocation ends the designation once, and needs a designation', async () => {
    await expect(processAmbassadorApplication(db(), auth, payload({ decision: 'revoke' }), now)).rejects.toMatchObject({ code: 'not_ambassador' });
    await processAmbassadorApplication(db(), auth, payload(), now);
    expect(await processAmbassadorApplication(db(), auth, payload({ decision: 'revoke' }), now + 5)).toEqual({ ok: true, uid: 'amb' });
    expect(memory.store.get('ambassadors/amb')).toMatchObject({ active: false, revokedBy: 'edlight-apply', revokedAt: now + 5 });
    expect(await processAmbassadorApplication(db(), auth, payload({ decision: 'revoke' }), now + 9)).toMatchObject({ replayed: true });
    expect(memory.store.get('ambassadors/amb').revokedAt).toBe(now + 5);
  });
});
