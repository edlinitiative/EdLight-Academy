/**
 * Every Arena endpoint `vercel.json` schedules must actually be reachable by
 * the scheduler.
 *
 * CORRECTION, from shipping a broken fix: scheduling `api/arena/advance` was
 * supposed to close the audit's E3 ("no working runner is present in
 * repository configuration"). It did nothing. Vercel's scheduler issues a
 * **GET**, and that handler answered `405 method_not_allowed` to anything but
 * POST — so the cron fired every minute into a closed door, and the round
 * clock was exactly as manual as before. `aggregate.ts` and `doors-close.ts`
 * both say "a Vercel cron fires a GET" in their own method guards; `advance`
 * was the one that did not, and nothing anywhere asserted it.
 *
 * So this is deliberately NOT a test about `advance`. It reads the cron list
 * out of `vercel.json` and holds every Arena entry to the same contract, which
 * is the only version of this test that protects the NEXT endpoint somebody
 * schedules.
 *
 * The contract checked here is narrow on purpose: a GET must get PAST the
 * method gate. A request with no credentials then stops at the auth door with
 * a 401, and 401 is the pass condition — it proves the handler was willing to
 * consider the request rather than refusing its verb. What the endpoint does
 * once authorized is every other test in this directory.
 */
jest.mock('../_lib/firebaseAdmin', () => ({
  isAdminConfigured: () => true,
  // A stub, not a thrower: these handlers call getDb() before they authorize,
  // and the auth door is where we want an unauthenticated GET to land.
  getDb: () => ({}),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { VercelRequest, VercelResponse } from '@vercel/node';

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void>;

/** The Arena cron paths exactly as the deploy config declares them. */
function scheduledArenaPaths(): string[] {
  const config = JSON.parse(readFileSync(join(__dirname, '..', '..', 'vercel.json'), 'utf8'));
  const crons: Array<{ path?: string }> = Array.isArray(config.crons) ? config.crons : [];
  return crons
    .map((c) => String(c.path ?? ''))
    // Strip any query string: `/api/arena/claim?action=sweep` is one module.
    .map((p) => p.split('?')[0])
    .filter((p) => p.startsWith('/api/arena/'));
}

function fakeRes() {
  const sent: { status: number | null; body: unknown } = { status: null, body: null };
  const res = {
    status(code: number) { sent.status = code; return res; },
    json(payload: unknown) { sent.body = payload; return res; },
    setHeader() { return res; },
    end() { return res; },
  };
  return { res: res as unknown as VercelResponse, sent };
}

const getRequest = () => ({
  method: 'GET',
  headers: {},
  query: {},
  body: undefined,
}) as unknown as VercelRequest;

describe('every Arena endpoint vercel.json schedules answers a GET', () => {
  const paths = scheduledArenaPaths();

  it('finds the scheduled Arena endpoints at all', () => {
    // Guards the test itself: a parsing slip that produced an empty list would
    // make every assertion below vacuously pass.
    expect(paths.length).toBeGreaterThan(0);
    expect(paths).toContain('/api/arena/advance');
  });

  it.each(paths)('%s does not refuse a GET at the method gate', async (path) => {
    const moduleName = path.replace('/api/arena/', '');
    const mod = await import(`../arena/${moduleName}`);
    const handler: Handler = mod.default;

    const { res, sent } = fakeRes();
    await handler(getRequest(), res);

    // The whole point. A scheduler's GET must never be turned away by the verb.
    expect(sent.status).not.toBe(405);
    // And it should have reached the auth door, which is what an
    // unauthenticated request is supposed to hit.
    expect(sent.status).toBe(401);
  });
});
