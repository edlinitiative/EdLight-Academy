/**
 * The parts of the Sandra probe that talk HTTP and nothing else.
 * ---------------------------------------------------------------------------
 * Split out from sandraHealth.ts for one concrete reason: that module imports
 * firebaseAdmin, and importing firebaseAdmin pulls the whole Admin SDK into
 * the process at load time, which a unit test cannot do. This repo already
 * follows the rule — internalPerformerCache.ts takes a Firestore handle as an
 * argument rather than importing one — and the rule exists so the logic that
 * is easy to get quietly wrong stays testable.
 *
 * What is quietly wrong-able here is WHICH HOST to probe. See resolveOrigin.
 */
/** The dependency chain, in the order /api/chat walks it. */
export type HealthStage = 'config' | 'firestore' | 'embed' | 'vector-search' | 'llm' | 'route' | 'sandra-app';

export interface StageResult {
  stage: HealthStage;
  ok: boolean;
  ms: number;
  /** Present only on failure. Safe to put in an email — never a secret. */
  detail?: string;
}

export interface ProbeResult {
  ok: boolean;
  ms: number;
  stages: StageResult[];
  /** The first stage that failed, or null when everything passed. */
  failedStage: HealthStage | null;
  failedDetail: string | null;
}

function ms(from: number): number {
  return Date.now() - from;
}

/** Error text fit for an email: first line, truncated, never a stack. */
export function readableError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.split('\n')[0].slice(0, 200);
}

/** The public domain, used when nothing is configured. */
export const DEFAULT_CHAT_ORIGIN = 'https://academy.edlight.org';

/**
 * Which host to probe for route liveness.
 *
 * NOTE the deliberate absence of VERCEL_URL, which api/chat.ts's own
 * resolveOrigin falls back to. Measured on this project: a deployment URL sits
 * behind Vercel Authentication and answers 401 to everything with a
 * {"protection":{...}} body. Probing it would have reported Sandra as down on
 * every single run from the moment this shipped — a monitor crying wolf every
 * ten minutes, which is worse than no monitor, because it teaches the reader
 * to ignore the mail that matters.
 *
 * So this resolves to the PUBLIC domain: what a student actually loads. Set
 * SANDRA_CHAT_ORIGIN to override (a preview deployment, a renamed domain).
 */
export function resolveOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.SANDRA_CHAT_ORIGIN || env.PUBLIC_ORIGIN || env.CANONICAL_ORIGIN;
  if (explicit) return explicit.replace(/\/+$/, '');
  // Vercel's own name for the PRODUCTION domain, as opposed to VERCEL_URL,
  // which is the per-deployment one that sits behind the auth wall.
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return DEFAULT_CHAT_ORIGIN;
}

/**
 * The route-liveness check described above.
 *
 * 401 is the PASS. Any other status, or a network error, is the failure —
 * including 200, which would mean /api/chat had stopped requiring a token.
 */
export async function probeChatRoute(origin: string): Promise<StageResult> {
  const started = Date.now();
  try {
    const res = await fetch(`${origin}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'health probe' }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 401) {
      /*
        401 alone is not enough.

        Vercel Deployment Protection answers 401 to every request with an HTML
        login wall. A probe that accepted any 401 would report a protected —
        and therefore completely unreachable — deployment as healthy, which is
        the exact failure it exists to catch, passing for the wrong reason.
        So the body has to be OUR rejection: JSON, naming the missing token.
      */
      const body = await res.text().catch(() => '');
      if (/unauthorized/i.test(body)) return { stage: 'route', ok: true, ms: ms(started) };
      return {
        stage: 'route',
        ok: false,
        ms: ms(started),
        detail: 'POST /api/chat answered 401 but not with the API\'s own JSON rejection — '
          + 'this is probably Vercel Deployment Protection, which makes the whole deployment unreachable.',
      };
    }
    if (res.status === 200) {
      return {
        stage: 'route',
        ok: false,
        ms: ms(started),
        detail: 'POST /api/chat answered 200 WITHOUT a token — the auth gate is open.',
      };
    }
    return {
      stage: 'route',
      ok: false,
      ms: ms(started),
      detail: `POST /api/chat answered ${res.status}; expected 401. `
        + (res.status === 404 ? 'The function is not deployed.' : 'The handler fails before its auth check.'),
    };
  } catch (err) {
    return { stage: 'route', ok: false, ms: ms(started), detail: `cannot reach ${origin}/api/chat: ${readableError(err)}` };
  }
}


/**
 * The standalone assistant at sandra.edlight.org.
 *
 * With SANDRA_APP_ADMIN_KEY set, its health route reports its real
 * dependencies and a failing database is caught here. Without the key it
 * answers a bare {status:'ok'}, which still proves the app is deployed and
 * serving — so the check is worth running either way, and degrades rather
 * than failing when the key is absent.
 */
export async function probeSandraApp(origin: string, adminKey?: string): Promise<StageResult> {
  const started = Date.now();
  try {
    const res = await fetch(`${origin}/api/health`, {
      headers: adminKey ? { 'x-api-key': adminKey } : {},
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return { stage: 'sandra-app', ok: false, ms: ms(started), detail: `GET ${origin}/api/health answered ${res.status}` };
    }

    const body = (await res.json().catch(() => null)) as { status?: string; checks?: Record<string, string> } | null;
    if (!body || body.status !== 'ok') {
      return { stage: 'sandra-app', ok: false, ms: ms(started), detail: `health reported status=${body?.status ?? 'missing'}` };
    }

    // Only present when the admin key was accepted. When it is, a broken
    // dependency is a failure even though the endpoint answered 200.
    const failing = Object.entries(body.checks ?? {}).filter(([, v]) => v !== 'ok');
    if (failing.length > 0) {
      return {
        stage: 'sandra-app',
        ok: false,
        ms: ms(started),
        detail: `health reports ${failing.map(([k, v]) => `${k}=${v}`).join(', ')}`,
      };
    }
    return { stage: 'sandra-app', ok: true, ms: ms(started) };
  } catch (err) {
    return { stage: 'sandra-app', ok: false, ms: ms(started), detail: `cannot reach ${origin}/api/health: ${readableError(err)}` };
  }
}
