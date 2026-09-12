/**
 * GET|POST /api/cron-sandra-health  (every 10 minutes)
 * ---------------------------------------------------------------------------
 * Asks Sandra a question on a schedule and emails when the answer stops
 * coming. See _lib/sandraHealth.ts for what it probes and why, and
 * _lib/sandraAlert.ts for when it decides to write.
 *
 * ── The monitor must outlive the outage it reports ─────────────────────────
 * Two failure modes are specific to a monitor and both are silent, so both are
 * handled deliberately here rather than left to chance:
 *
 *   1. It must never throw. An uncaught error means no email and no log that
 *      anyone reads — the monitor fails exactly when it is needed. Everything
 *      below is wrapped, and the handler always answers 200 with a body saying
 *      what happened.
 *
 *   2. It must survive Firestore being the thing that is broken. The worst
 *      outage this product has had was a closed billing account, which made
 *      every Firestore read fail — including, if it were naive, the read of
 *      its own state document. So a state read/write failure never blocks the
 *      email. It falls back to module-level memory, and says in the response
 *      that it did.
 *
 *      The honest limitation: with Firestore down AND a cold start, the
 *      in-memory throttle is empty and a duplicate alert can go out. Being
 *      told twice that the database is down is the right way to be wrong.
 *
 * Security: the CRON_SECRET bearer scheme used by every other cron here.
 * `?dryRun=1` runs the probe and returns the verdict without emailing or
 * writing state — safe to hit by hand.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_lib/firebaseAdmin';
import { probeSandra, type ProbeResult } from './_lib/sandraHealth';
import { decideAlert, buildAlertEmail, INITIAL_STATE, type HealthState } from './_lib/sandraAlert';

const STATE_DOC = 'internalCache/sandraHealth';
const RESEND_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'EdLight Monitor <sandra@edlight.org>';
const DEFAULT_TO = 'ted.jacquet@edlight.org';

/**
 * Last known state, kept in the module so it survives warm invocations.
 * Only consulted when Firestore cannot be read — see the docblock above.
 */
let memoryState: HealthState | null = null;

async function readState(): Promise<{ state: HealthState; durable: boolean }> {
  try {
    const snap = await getDb().doc(STATE_DOC).get();
    const data = snap.exists ? (snap.data() as Partial<HealthState>) : null;
    if (!data) return { state: memoryState ?? INITIAL_STATE, durable: true };
    return {
      state: {
        state: data.state === 'down' ? 'down' : 'up',
        consecutiveFailures: Number(data.consecutiveFailures) || 0,
        since: Number(data.since) || 0,
        lastAlertAt: Number(data.lastAlertAt) || 0,
        lastStage: data.lastStage ?? null,
      },
      durable: true,
    };
  } catch {
    return { state: memoryState ?? INITIAL_STATE, durable: false };
  }
}

async function writeState(state: HealthState): Promise<boolean> {
  memoryState = state;
  try {
    await getDb().doc(STATE_DOC).set({ ...state, updatedAt: Date.now() }, { merge: true });
    return true;
  } catch {
    return false;
  }
}

/** Send one alert. Never throws; returns why it could not send, if it could not. */
async function sendAlert(subject: string, html: string, text: string): Promise<{ sent: true } | { error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { error: 'RESEND_API_KEY is not set' };
  const to = (process.env.SANDRA_ALERT_TO || DEFAULT_TO).split(',').map((s) => s.trim()).filter(Boolean);
  if (to.length === 0) return { error: 'no recipient configured' };

  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM || DEFAULT_FROM, to, subject, html, text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { error: `Resend ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const secret = process.env.CRON_SECRET || '';
  if (secret) {
    const auth = (req.headers.authorization as string) || '';
    const header = (req.headers['x-cron-secret'] as string) || '';
    const bearer = auth.replace(/^Bearer\s+/i, '').trim();
    if (bearer !== secret && header !== secret) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
  }

  const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';

  try {
    let probe: ProbeResult = await probeSandra();

    /*
      One immediate retry before a failure is allowed to count.

      Every stage but `config` is a network call, and a single timeout is not
      an outage. Retrying three seconds later costs one extra probe on the rare
      failing run and removes the whole class of one-second false alarms. A
      real outage fails both.
    */
    if (!probe.ok && probe.failedStage !== 'config') {
      await new Promise((r) => setTimeout(r, 3000));
      probe = await probeSandra();
    }

    const now = Date.now();
    const { state: previous, durable } = await readState();
    const { action, next } = decideAlert(previous, probe, now);

    if (dryRun) {
      res.status(200).json({ dryRun: true, ok: probe.ok, wouldSend: action, probe, previous, next });
      return;
    }

    let email: { sent: true } | { error: string } | null = null;
    if (action !== 'none') {
      const { subject, html, text } = buildAlertEmail(action, probe, next, now);
      email = await sendAlert(subject, html, text);
      if ('error' in email) console.error(`[sandra-health] could not send "${subject}": ${email.error}`);
    }

    const persisted = await writeState(next);

    if (!probe.ok) {
      console.error(`[sandra-health] FAIL at ${probe.failedStage}: ${probe.failedDetail} (action=${action})`);
    }

    res.status(200).json({
      ok: probe.ok,
      failedStage: probe.failedStage,
      action,
      email,
      stateReadFromFirestore: durable,
      statePersisted: persisted,
      ms: probe.ms,
    });
  } catch (err) {
    // The monitor itself broke. Say so loudly in the response and the log,
    // and still answer 200 so Vercel does not retry-storm the endpoint.
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[sandra-health] the monitor itself threw:', detail);
    res.status(200).json({ ok: false, monitorError: detail });
  }
}
