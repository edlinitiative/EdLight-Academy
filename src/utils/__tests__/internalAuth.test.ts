/**
 * Tests for api/_lib/internalAuth.ts — the shared-secret gate on the
 * cross-platform endpoints (api/internal/*).
 *
 * These endpoints hand real learners' names and email addresses across a system
 * boundary, so the rejection path is the part that has to be right: every
 * failure must be an opaque 401, the secret must never be accepted from a query
 * parameter, and an unconfigured deployment must fail closed rather than open.
 */
import {
  INTERNAL_SECRET_ENV,
  isInternalRequestAuthorized,
  presentedSecret,
  requireInternalSecret,
  secretsMatch,
} from '../../../api/_lib/internalAuth';

const SECRET = 'a'.repeat(48);
const env = (value?: string) =>
  (value === undefined ? {} : { [INTERNAL_SECRET_ENV]: value }) as NodeJS.ProcessEnv;

/** Minimal VercelRequest/Response stand-ins — the handler only needs these. */
function fakeReq(headers: Record<string, unknown> = {}, query: Record<string, unknown> = {}) {
  return { headers, query, method: 'GET' } as never;
}

function fakeRes() {
  const state = {
    statusCode: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
  };
  const res = {
    setHeader(key: string, value: string) { state.headers[key] = value; return res; },
    status(code: number) { state.statusCode = code; return res; },
    json(payload: unknown) { state.body = payload; return res; },
  };
  return { res: res as never, state };
}

describe('presentedSecret', () => {
  it('reads a Bearer token, case-insensitively on the scheme', () => {
    expect(presentedSecret({ authorization: `Bearer ${SECRET}` })).toBe(SECRET);
    expect(presentedSecret({ authorization: `bearer  ${SECRET}` })).toBe(SECRET);
  });

  it('reads the x-internal-secret header', () => {
    expect(presentedSecret({ 'x-internal-secret': ` ${SECRET} ` })).toBe(SECRET);
  });

  it('is empty when no credential is present', () => {
    expect(presentedSecret({})).toBe('');
    expect(presentedSecret({ authorization: 'Basic abc' })).toBe('');
    expect(presentedSecret({ authorization: 'Bearer   ' })).toBe('');
  });
});

describe('secretsMatch', () => {
  it('accepts an exact match and rejects everything else', () => {
    expect(secretsMatch(SECRET, SECRET)).toBe(true);
    expect(secretsMatch(`${SECRET}x`, SECRET)).toBe(false);
    expect(secretsMatch(SECRET.slice(0, -1), SECRET)).toBe(false);
    expect(secretsMatch(SECRET.toUpperCase(), SECRET)).toBe(false);
  });

  it('does not throw on a length mismatch (both sides are digested first)', () => {
    expect(() => secretsMatch('short', SECRET)).not.toThrow();
    expect(secretsMatch('short', SECRET)).toBe(false);
  });

  it('rejects blanks on either side', () => {
    expect(secretsMatch('', SECRET)).toBe(false);
    expect(secretsMatch(SECRET, '')).toBe(false);
  });
});

describe('isInternalRequestAuthorized', () => {
  it('authorizes the configured secret via either header', () => {
    expect(isInternalRequestAuthorized({ authorization: `Bearer ${SECRET}` }, env(SECRET))).toBe(true);
    expect(isInternalRequestAuthorized({ 'x-internal-secret': SECRET }, env(SECRET))).toBe(true);
  });

  it('rejects a wrong, absent or blank secret', () => {
    expect(isInternalRequestAuthorized({ authorization: 'Bearer wrong' }, env(SECRET))).toBe(false);
    expect(isInternalRequestAuthorized({}, env(SECRET))).toBe(false);
    expect(isInternalRequestAuthorized({ authorization: 'Bearer ' }, env(SECRET))).toBe(false);
  });

  it('fails CLOSED when the deployment has no secret configured', () => {
    // An unset variable must not become "no auth required".
    expect(isInternalRequestAuthorized({ authorization: `Bearer ${SECRET}` }, env(undefined))).toBe(false);
    expect(isInternalRequestAuthorized({ authorization: 'Bearer ' }, env(''))).toBe(false);
    expect(isInternalRequestAuthorized({}, env(''))).toBe(false);
  });

  it('refuses a configured secret too short to resist guessing', () => {
    const weak = 'hunter2';
    expect(isInternalRequestAuthorized({ authorization: `Bearer ${weak}` }, env(weak))).toBe(false);
  });

  it('never accepts the secret from a query parameter', () => {
    // Query strings land in request logs, access logs and browser history.
    expect(isInternalRequestAuthorized({}, env(SECRET))).toBe(false);
    expect(
      isInternalRequestAuthorized({ secret: SECRET, token: SECRET }, env(SECRET)),
    ).toBe(false);
  });
});

describe('requireInternalSecret', () => {
  const original = process.env[INTERNAL_SECRET_ENV];
  afterEach(() => {
    if (original === undefined) delete process.env[INTERNAL_SECRET_ENV];
    else process.env[INTERNAL_SECRET_ENV] = original;
  });

  it('lets an authorized request through without responding', () => {
    process.env[INTERNAL_SECRET_ENV] = SECRET;
    const { res, state } = fakeRes();
    expect(requireInternalSecret(fakeReq({ authorization: `Bearer ${SECRET}` }), res)).toBe(true);
    expect(state.statusCode).toBe(0);
    expect(state.headers['Cache-Control']).toBe('no-store, max-age=0');
  });

  it('rejects with an opaque 401 that says nothing about why', () => {
    process.env[INTERNAL_SECRET_ENV] = SECRET;
    const { res, state } = fakeRes();
    expect(requireInternalSecret(fakeReq({ authorization: 'Bearer wrong' }), res)).toBe(false);
    expect(state.statusCode).toBe(401);
    expect(state.body).toEqual({ error: 'unauthorized' });
    expect(JSON.stringify(state.body)).not.toMatch(/secret|token|length|configur|env/i);
  });

  it('answers a missing credential and a missing configuration identically', () => {
    process.env[INTERNAL_SECRET_ENV] = SECRET;
    const configured = fakeRes();
    requireInternalSecret(fakeReq({}), configured.res);

    delete process.env[INTERNAL_SECRET_ENV];
    const unconfigured = fakeRes();
    requireInternalSecret(fakeReq({ authorization: `Bearer ${SECRET}` }), unconfigured.res);

    expect(unconfigured.state.statusCode).toBe(configured.state.statusCode);
    expect(unconfigured.state.body).toEqual(configured.state.body);
  });

  it('refuses to let the secret arrive in the query string', () => {
    process.env[INTERNAL_SECRET_ENV] = SECRET;
    const { res, state } = fakeRes();
    expect(requireInternalSecret(fakeReq({}, { secret: SECRET }), res)).toBe(false);
    expect(state.statusCode).toBe(401);
  });
});
