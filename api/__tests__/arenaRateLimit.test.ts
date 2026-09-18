import { checkRateLimit } from '../_lib/rateLimit';

// The rate limiter normally fails OPEN so a feature never breaks because its
// bucket was forgotten. The Arena inverts that trade: an uncapped tournament
// endpoint is not a degraded feature, it is a result somebody can buy.
jest.mock('../_lib/firebaseAdmin', () => ({
  isAdminConfigured: () => true,
  getDb: () => { throw new Error('firestore down'); },
}));

describe('arena endpoints fail closed', () => {
  it('refuses an arena bucket nobody declared', async () => {
    // A new /api/arena/* route shipped without adding its bucket must not run
    // uncapped — it must not run at all.
    const r = await checkRateLimit('u1', 'arena-not-declared-yet');
    expect(r.allowed).toBe(false);
  });

  it('refuses a declared arena bucket when the limiter itself is down', async () => {
    // getDb throws above. A limiter that is down during a tournament must not
    // quietly become no limiter.
    const r = await checkRateLimit('u1', 'arena-answer');
    expect(r.allowed).toBe(false);
  });

  it('still lets an ordinary unknown endpoint through', async () => {
    // The open default is deliberate everywhere else: a Firestore blip should
    // not break a feature that costs nothing.
    const r = await checkRateLimit('u1', 'some-new-feature');
    expect(r.allowed).toBe(true);
  });
});
