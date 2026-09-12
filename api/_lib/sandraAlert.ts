/**
 * Deciding whether to send an alert, and writing the one that gets sent.
 * ---------------------------------------------------------------------------
 * Separated from the probe (sandraHealth.ts) because the decision is the part
 * with the interesting rules and no I/O, so it can be tested exhaustively
 * without a network, a clock or a Firestore.
 *
 * ── The rule that matters: alert on the TRANSITION, not on the state ───────
 * A monitor that emails on every failed run is a monitor you filter to a
 * folder, and a filtered alert is no alert. This one writes when the answer
 * CHANGES — working to broken, broken to working — plus a reminder every six
 * hours while it stays broken so a long outage is not forgotten.
 *
 * ── How fast, and why it differs by failure ────────────────────────────────
 * Some failures cannot be a blip and should not wait for a second opinion:
 *   • config   — no model is configured. That is a deploy, not a hiccup.
 *   • route    — /api/chat is not answering 401. It is gone or it throws.
 *   • firestore— the database is unreachable. This is the closed-billing
 *                outage that took the whole product down for hours.
 * These alert on the first failed run.
 *
 * The rest are network calls to somebody else's API and DO blip:
 *   • embed, vector-search, llm
 * These need two consecutive failed runs, which at a ten-minute schedule means
 * an alert about ten minutes in — with one immediate in-run retry before the
 * first failure is even recorded, so a one-second stumble never counts.
 */
import type { HealthStage, ProbeResult } from './sandraProbes';

export interface HealthState {
  state: 'up' | 'down';
  consecutiveFailures: number;
  /** When the current state began. */
  since: number;
  /** Last time an outage email went out. 0 when none has. */
  lastAlertAt: number;
  lastStage: HealthStage | null;
}

export type AlertAction = 'none' | 'down' | 'recovered' | 'still-down';

export interface Decision {
  action: AlertAction;
  next: HealthState;
}

/** Failures that are never transient, and so never wait for confirmation. */
export const IMMEDIATE_STAGES: ReadonlySet<HealthStage> = new Set<HealthStage>(['config', 'route', 'firestore']);

/** Consecutive failed runs required before alerting on a flake-prone stage. */
export const CONFIRM_RUNS = 2;

/** While it stays down, say so again this often. */
export const REMIND_EVERY_MS = 6 * 60 * 60 * 1000;

export const INITIAL_STATE: HealthState = {
  state: 'up',
  consecutiveFailures: 0,
  since: 0,
  lastAlertAt: 0,
  lastStage: null,
};

/**
 * Given what we believed and what the probe just found, decide what to send.
 *
 * Pure. `now` is passed in so the six-hour reminder can be tested without
 * waiting six hours.
 */
export function decideAlert(previous: HealthState, probe: ProbeResult, now: number): Decision {
  if (probe.ok) {
    // Recovered — but only worth saying if we actually told anyone it broke.
    // Without this guard, a single failed run that never reached the alert
    // threshold would still produce an "it's back" email for an outage the
    // reader was never told about.
    const wasDown = previous.state === 'down';
    return {
      action: wasDown ? 'recovered' : 'none',
      next: {
        state: 'up',
        consecutiveFailures: 0,
        since: wasDown ? now : previous.since || now,
        lastAlertAt: 0,
        lastStage: null,
      },
    };
  }

  const failures = previous.consecutiveFailures + 1;
  const stage = probe.failedStage;
  const enough = (stage && IMMEDIATE_STAGES.has(stage)) || failures >= CONFIRM_RUNS;

  if (!enough) {
    // Counted, not announced. The state stays 'up' on purpose: one failed run
    // is not yet an outage, and calling it one here would make the eventual
    // recovery email fire for something nobody was told about.
    return {
      action: 'none',
      next: { ...previous, consecutiveFailures: failures, lastStage: stage },
    };
  }

  if (previous.state === 'up') {
    return {
      action: 'down',
      next: { state: 'down', consecutiveFailures: failures, since: now, lastAlertAt: now, lastStage: stage },
    };
  }

  const due = now - previous.lastAlertAt >= REMIND_EVERY_MS;
  return {
    action: due ? 'still-down' : 'none',
    next: {
      state: 'down',
      consecutiveFailures: failures,
      since: previous.since,
      lastAlertAt: due ? now : previous.lastAlertAt,
      lastStage: stage,
    },
  };
}

/** Plain-language name for each stage, for the subject line and the body. */
export const STAGE_LABEL: Record<HealthStage, string> = {
  config: 'No AI model is configured',
  firestore: 'Firestore is unreachable',
  embed: 'The embedding API is failing',
  'vector-search': 'Knowledge-base search is failing',
  llm: 'The AI model is not replying',
  route: '/api/chat is not responding',
  'sandra-app': 'sandra.edlight.org is not healthy',
};

/**
 * What to check first, per stage. An alert that only says "it broke" makes the
 * reader start from nothing at 2am; these are the actual causes each failure
 * has had here before.
 */
export const STAGE_HINT: Record<HealthStage, string> = {
  config: 'GEMINI_API_KEY is missing or blank in the Vercel environment. Check Project → Settings → Environment Variables, then redeploy.',
  firestore: 'Usually billing. A CLOSED billing account leaves billingEnabled:true but silently drops the project to free quota. Run: gcloud billing projects describe edlight-academy — and check the account it names is open.',
  embed: 'The embedding model or key was rejected. Check the Gemini key is live and that the embedding model id has not been retired.',
  'vector-search': 'The sandraKb vector index may be missing or rebuilding. Firestore drops findNearest without an index. Re-run: npm run kb:sandra',
  llm: 'Usually the model id. gemini-2.5-flash stopped being issued to new keys once before and Sandra went silent. Check the configured model still exists, and the key has quota.',
  route: 'A bad deploy. The function either is not there (404) or throws before its auth check (500). Check the latest deployment log for /api/chat.',
  'sandra-app': 'This is the standalone assistant, a different project (github.com/edlinitiative/sandra) on its own deployment. Check its Vercel deployment and its database — the detail above names the failing dependency when SANDRA_APP_ADMIN_KEY is configured.',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

function duration(msTotal: number): string {
  const mins = Math.round(msTotal / 60000);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'}`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return `${hours}h${rest ? ` ${rest}m` : ''}`;
}

export interface AlertEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Compose the alert.
 *
 * Deliberately plain: this is read on a phone, probably in a hurry, possibly
 * at night. Subject says what broke. First line says what broke. Then the
 * stage table, then what to check.
 */
export function buildAlertEmail(action: Exclude<AlertAction, 'none'>, probe: ProbeResult, state: HealthState, now: number): AlertEmail {
  const stage = probe.failedStage;
  const label = stage ? STAGE_LABEL[stage] : 'Unknown failure';
  const hint = stage ? STAGE_HINT[stage] : '';
  const down = now - (state.since || now);

  const subject = action === 'recovered'
    ? `Sandra is answering again (down ${duration(down)})`
    : action === 'still-down'
      ? `Sandra is STILL down — ${label} (${duration(down)})`
      : `Sandra is down — ${label}`;

  const headline = action === 'recovered'
    ? 'Sandra is answering again.'
    : action === 'still-down'
      ? `Sandra has been down for ${duration(down)}.`
      : 'Sandra has stopped answering.';

  const rows = probe.stages.map((s) => {
    const mark = s.ok ? '✓' : '✗';
    const colour = s.ok ? '#15803d' : '#b91c1c';
    const detail = s.detail ? `<div style="color:#7f1d1d;font-size:13px;margin-top:2px">${escapeHtml(s.detail)}</div>` : '';
    return `<tr>
      <td style="padding:6px 10px;color:${colour};font-weight:700;width:24px">${mark}</td>
      <td style="padding:6px 10px;font-family:ui-monospace,Menlo,monospace;font-size:13px">${escapeHtml(s.stage)}${detail}</td>
      <td style="padding:6px 10px;color:#64748b;font-size:13px;text-align:right;white-space:nowrap">${s.ms} ms</td>
    </tr>`;
  }).join('');

  const hintBlock = action === 'recovered' || !hint ? '' : `
    <div style="margin:18px 0;padding:14px 16px;background:#fef2f2;border-left:3px solid #b91c1c;border-radius:4px">
      <div style="font-weight:700;font-size:13px;color:#7f1d1d;margin-bottom:6px">What to check first</div>
      <div style="font-size:14px;line-height:1.55;color:#450a0a">${escapeHtml(hint)}</div>
    </div>`;

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <div style="font-size:12px;letter-spacing:0.08em;color:#64748b;margin-bottom:6px">EDLIGHT ACADEMY · SANDRA MONITOR</div>
  <h1 style="font-size:20px;margin:0 0 4px;color:${action === 'recovered' ? '#15803d' : '#b91c1c'}">${escapeHtml(headline)}</h1>
  <div style="font-size:14px;color:#475569;margin-bottom:18px">${escapeHtml(new Date(now).toISOString())} · probe took ${probe.ms} ms</div>
  <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:6px">${rows}</table>
  ${hintBlock}
  <div style="font-size:13px;color:#64748b;margin-top:20px;line-height:1.5">
    Checked every 10 minutes by <code>/api/cron-sandra-health</code>.
    You get one email when it breaks, one when it recovers, and a reminder every 6 hours in between — never one per check.
  </div>
</div>`;

  const textLines = [
    headline,
    '',
    ...probe.stages.map((s) => `${s.ok ? 'OK  ' : 'FAIL'} ${s.stage}${s.detail ? ` — ${s.detail}` : ''} (${s.ms} ms)`),
  ];
  if (hint && action !== 'recovered') textLines.push('', `What to check first: ${hint}`);

  return { subject, html, text: textLines.join('\n') };
}
