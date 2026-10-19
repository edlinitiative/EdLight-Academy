import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';
import { sanitizeDiagnostic, type DiagnosticEvent } from '../shared/telemetry';

// Firebase Admin and the aggregate writer load lazily: a batch of plain
// product events never pays for them on a cold start.
const admin = () => import('./_lib/firebaseAdmin');
const aggregates = () => import('./_lib/diagnosticsAggregate');

// Local burst protection, bounded even under address churn. No raw IP is stored
// or logged. Distributed limits belong in the hosting firewall.
const windows = new Map<string, { count: number; expires: number }>();
/** Aggregation never holds the response longer than this. */
const AGGREGATE_BUDGET_MS = 2500;

/**
 * GET /api/telemetry?view=errors&days=7 — admin console "Diagnostics /
 * Erreurs" (src/pages/admin/AdminDiagnostics.tsx). Bearer ID token of a user
 * whose `users/{uid}.role` is 'admin'. Returns aggregated, already-sanitized
 * signatures only — never raw events.
 */
async function readForAdmin(req: VercelRequest, res: VercelResponse) {
  const { requireAuth } = await import('./_lib/requireAuth');
  const uid = await requireAuth(req, res);
  if (!uid) return;
  const db = (await admin()).getDb();
  const user = await db.doc(`users/${uid}`).get();
  if ((user.data() as { role?: string } | undefined)?.role !== 'admin') {
    return res.status(403).json({ error: 'not_admin' });
  }
  const days = Number(req.query?.days ?? 7);
  const errors = await (await aggregates()).readErrorSummaries(db, Date.now(), days);
  return res.status(200).json({ errors });
}

async function aggregate(events: DiagnosticEvent[], now: number) {
  if (!events.some((e) => e.type === 'error')) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { getDb, isAdminConfigured } = await admin();
    if (!isAdminConfigured()) return;
    const { recordErrorAggregates } = await aggregates();
    await Promise.race([
      recordErrorAggregates(getDb(), events, now),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, AGGREGATE_BUDGET_MS); }),
    ]);
  } catch {
    /* aggregation is best effort; the log line already exists */
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET' && req.query?.view === 'errors') {
    try {
      return await readForAdmin(req, res);
    } catch {
      return res.status(500).json({ error: 'read_failed' });
    }
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  // Same-origin browsers and native requests (which have no Origin) only.
  const origin = req.headers.origin;
  const deploymentOrigin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined;
  if (origin && origin !== 'https://academy.edlight.org' && origin !== deploymentOrigin &&
      !(process.env.NODE_ENV !== 'production' && /^http:\/\/localhost:\d+$/.test(origin))) {
    return res.status(403).json({ error: 'origin_not_allowed' });
  }
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    return res.status(415).json({ error: 'json_required' });
  }
  const now = Date.now();
  const address = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const key = createHash('sha256').update(address).digest('hex');
  for (const [id, window] of windows) if (window.expires <= now) windows.delete(id);
  const window = windows.get(key) || { count: 0, expires: now + 60_000 };
  if (window.count >= 120 || (!windows.has(key) && windows.size >= 1000)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'rate_limited' });
  }
  window.count += 1;
  windows.set(key, window);
  let events: DiagnosticEvent[];
  try {
    const text = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (!text || Buffer.byteLength(text) > 64_000) return res.status(413).json({ error: 'batch_too_large' });
    const body = JSON.parse(text);
    if (!Array.isArray(body?.events) || !body.events.length || body.events.length > 20) {
      return res.status(400).json({ error: 'invalid_batch' });
    }
    const sanitized = body.events.map(sanitizeDiagnostic);
    if (sanitized.some((event: unknown) => !event)) return res.status(400).json({ error: 'invalid_event' });
    events = sanitized as DiagnosticEvent[];
  } catch {
    return res.status(400).json({ error: 'invalid_json' });
  }
  // The reporting destination is the hosting runtime log stream. Never log
  // request bodies, headers, identities or unsanitized exceptions.
  for (const event of events) {
    console.info(JSON.stringify({ service: 'student_diagnostics', receivedAt: now,
      serverRelease: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
      serverEnvironment: process.env.VERCEL_ENV || 'development', event }));
  }
  // Queryable per-signature/day aggregates + fatal alerts (sanitized events only).
  await aggregate(events, now);
  return res.status(202).json({ accepted: events.length });
}
