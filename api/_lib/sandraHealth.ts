/**
 * Is Sandra actually answering right now?
 * ---------------------------------------------------------------------------
 * Sandra has failed twice in production, and neither failure announced itself.
 * The first was a retired model id (`gemini-2.5-flash` stopped being issued to
 * new keys); the second was a closed billing account that made every Firestore
 * read fail, which took the knowledge base with it. Both times the app looked
 * fine — the chat box opened, the student typed, and nothing came back.
 *
 * So this module answers one question, out loud, on a schedule: would a student
 * asking Sandra something right now get an answer?
 *
 * ── Why it probes the LIBRARIES and not POST /api/chat ─────────────────────
 * /api/chat requires a Firebase ID token. Minting one on a schedule means
 * either shipping a service account a synthetic student identity, or storing a
 * real learner's credentials in the environment — a standing risk added to
 * catch an occasional one. Instead the probe calls the same four dependencies
 * /api/chat calls, in the same order, so the failure the student would hit is
 * the failure this reports:
 *
 *      config → firestore → embed → vector search → llm
 *
 * ── The gap that leaves, and how it is covered ─────────────────────────────
 * Exercising the libraries proves the dependencies work; it does NOT prove the
 * route is deployed and loads. A bad build, a deleted file or a module-level
 * throw would leave every dependency healthy and the endpoint dead.
 *
 * So there is a fifth check that needs no credential at all: an unauthenticated
 * POST to /api/chat must answer 401. A 401 proves the function exists, cold
 * starts, imports cleanly and reaches its auth gate. A 404 means it is not
 * deployed; a 500 means it throws before it can even reject a caller. Both are
 * exactly the outage the library probe cannot see.
 *
 * ── There are two Sandras, and this watches both ───────────────────────────
 * The chat box inside Academy (this repo, POST /api/chat) and the standalone
 * assistant at sandra.edlight.org, which is its own Next.js app in its own
 * repo. Both are "Sandra" to the person who gets woken up, so both are probed
 * here and both feed the one alert pipeline — two monitors would mean two sets
 * of thresholds, two state documents and two ways to silently stop working.
 *
 * The standalone app is checked through its own GET /api/health, which returns
 * a real dependency report (database, vector store) when given an admin key
 * and a bare {status:'ok'} without one. Both are useful: with the key this
 * catches its database going down, and without it, it still catches the app
 * being gone. It is NOT probed by sending it a chat message, deliberately —
 * that would spend tokens and write a synthetic session into its analytics
 * every ten minutes, and 144 fake conversations a day would quietly corrupt
 * its usage numbers to test something the health route already reports.
 *
 * ── What it deliberately does NOT do ───────────────────────────────────────
 * No conversation is written, no rate-limit budget is spent, and no student
 * document is touched. The probe reads the KB and calls the model; that is all.
 */
import { getDb } from './firebaseAdmin';
import { resolveLLMConfig, embed, chatText, EMBED_DIM } from './llm';
import { SANDRA_LIMITS } from './sandraPrompt';
import { FieldValue } from 'firebase-admin/firestore';

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

/**
 * A question with a knowable answer, phrased the way a student would ask.
 * Kept short on purpose: this runs every ten minutes, and the whole point is
 * that it costs almost nothing to know Sandra is alive.
 */
const PROBE_QUESTION = 'Bonjou Sandra, èske ou la ? Reponn yon sèl fraz kout.';

/** Anything longer than this and something is wrong with the model, not us. */
const PROBE_TIMEOUT_MS = 20_000;

function ms(from: number): number {
  return Date.now() - from;
}

/** Error text fit for an email: first line, truncated, never a stack. */
export function readableError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.split('\n')[0].slice(0, 200);
}

export function resolveOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.PUBLIC_ORIGIN || env.CANONICAL_ORIGIN;
  if (explicit) return explicit.replace(/\/+$/, '');
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return 'http://localhost:3000';
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
 * Run the whole chain. Never throws: a monitor that can crash is not a monitor.
 *
 * Stops at the first failure, because the stages are dependencies of each
 * other and a cascade of five failures says less than the one that caused it.
 * The route check runs regardless, since it shares nothing with the rest.
 */
export async function probeSandra(): Promise<ProbeResult> {
  const startedAll = Date.now();
  const stages: StageResult[] = [];

  const record = (s: StageResult) => { stages.push(s); return s.ok; };

  const finish = (): ProbeResult => {
    const failed = stages.find((s) => !s.ok);
    return {
      ok: !failed,
      ms: ms(startedAll),
      stages,
      failedStage: failed?.stage ?? null,
      failedDetail: failed?.detail ?? null,
    };
  };

  // 1. Is a model configured at all? This is the check that would have caught
  //    the retired-model outage on the first run after the key was reissued.
  let t = Date.now();
  const config = resolveLLMConfig();
  if (!record({
    stage: 'config',
    ok: !!config,
    ms: ms(t),
    detail: config ? undefined : 'no LLM provider configured (GEMINI_API_KEY / OPENAI_* unset)',
  })) return finish();

  // 2. Firestore. The closed-billing outage surfaced exactly here.
  t = Date.now();
  let kbSize = 0;
  try {
    const snap = await getDb().collection('sandraKb').limit(1).get();
    kbSize = snap.size;
    if (!record({
      stage: 'firestore',
      ok: kbSize > 0,
      ms: ms(t),
      detail: kbSize > 0 ? undefined : 'the sandraKb collection is empty — Sandra has nothing to ground answers in',
    })) return finish();
  } catch (err) {
    record({ stage: 'firestore', ok: false, ms: ms(t), detail: readableError(err) });
    return finish();
  }

  // 3. Embedding. Its own API surface, and its own way to break.
  t = Date.now();
  let queryVector: number[] = [];
  try {
    const [vec] = await embed([PROBE_QUESTION]);
    queryVector = vec ?? [];
    if (!record({
      stage: 'embed',
      ok: queryVector.length === EMBED_DIM,
      ms: ms(t),
      detail: queryVector.length === EMBED_DIM
        ? undefined
        : `embedding returned ${queryVector.length} dimensions, expected ${EMBED_DIM}`,
    })) return finish();
  } catch (err) {
    record({ stage: 'embed', ok: false, ms: ms(t), detail: readableError(err) });
    return finish();
  }

  // 4. Vector search. This is the one that degrades SILENTLY in /api/chat —
  //    retrieveChunks catches its own error and answers ungrounded — so a
  //    student would still get a reply, just a worse one. Nothing else notices.
  t = Date.now();
  try {
    const snap = await getDb()
      .collection('sandraKb')
      .findNearest({
        vectorField: 'embedding',
        queryVector: FieldValue.vector(queryVector),
        limit: SANDRA_LIMITS.topK,
        distanceMeasure: 'COSINE',
      })
      .get();
    if (!record({
      stage: 'vector-search',
      ok: snap.docs.length > 0,
      ms: ms(t),
      detail: snap.docs.length > 0 ? undefined : 'the KB index returned no neighbours — retrieval is broken or unindexed',
    })) return finish();
  } catch (err) {
    record({ stage: 'vector-search', ok: false, ms: ms(t), detail: readableError(err) });
    return finish();
  }

  // 5. The model itself.
  t = Date.now();
  try {
    const reply = await chatText({
      system: 'You are a health probe. Answer in one short sentence.',
      messages: [{ role: 'user', content: PROBE_QUESTION }],
      maxTokens: 64,
      timeoutMs: PROBE_TIMEOUT_MS,
      config,
    });
    record({
      stage: 'llm',
      ok: reply.trim().length > 0,
      ms: ms(t),
      detail: reply.trim().length > 0 ? undefined : 'the model returned an empty reply',
    });
  } catch (err) {
    record({ stage: 'llm', ok: false, ms: ms(t), detail: readableError(err) });
  }

  // 6. Route liveness — independent of everything above, so always run.
  stages.push(await probeChatRoute(resolveOrigin()));

  // 7. The other Sandra. Also independent, also always run.
  const appOrigin = (process.env.SANDRA_APP_ORIGIN ?? 'https://sandra.edlight.org').replace(/\/+$/, '');
  if (appOrigin) stages.push(await probeSandraApp(appOrigin, process.env.SANDRA_APP_ADMIN_KEY));

  return finish();
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
