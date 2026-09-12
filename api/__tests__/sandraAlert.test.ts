/**
 * The alerting rules, which are the part of the monitor that can be wrong
 * quietly: an over-eager rule trains the reader to ignore the mail, and a
 * too-lax one means an outage nobody hears about.
 */
import {
  decideAlert,
  buildAlertEmail,
  INITIAL_STATE,
  CONFIRM_RUNS,
  REMIND_EVERY_MS,
  type HealthState,
} from '../_lib/sandraAlert';
import { resolveOrigin, DEFAULT_CHAT_ORIGIN } from '../_lib/sandraProbes';
import type { ProbeResult, HealthStage } from '../_lib/sandraProbes';

const T0 = 1_800_000_000_000;

const healthy: ProbeResult = {
  ok: true, ms: 900, stages: [{ stage: 'llm', ok: true, ms: 800 }], failedStage: null, failedDetail: null,
};

function broken(stage: HealthStage, detail = 'boom'): ProbeResult {
  return {
    ok: false,
    ms: 500,
    stages: [{ stage, ok: false, ms: 400, detail }],
    failedStage: stage,
    failedDetail: detail,
  };
}

const down = (over: Partial<HealthState> = {}): HealthState => ({
  state: 'down', consecutiveFailures: 3, since: T0 - 60_000, lastAlertAt: T0 - 60_000, lastStage: 'llm', ...over,
});

describe('when the monitor decides to write', () => {
  it('says nothing at all while everything works', () => {
    expect(decideAlert(INITIAL_STATE, healthy, T0).action).toBe('none');
  });

  it('alerts on the FIRST failure for faults that cannot be a blip', () => {
    for (const stage of ['config', 'route', 'firestore'] as HealthStage[]) {
      expect(decideAlert(INITIAL_STATE, broken(stage), T0).action).toBe('down');
    }
  });

  it('waits for a second run before alerting on a flaky dependency', () => {
    for (const stage of ['embed', 'vector-search', 'llm'] as HealthStage[]) {
      const first = decideAlert(INITIAL_STATE, broken(stage), T0);
      expect(first.action).toBe('none');
      expect(first.next.consecutiveFailures).toBe(1);
      // ...and the state stays 'up', so the recovery email below cannot fire
      // for an outage nobody was ever told about.
      expect(first.next.state).toBe('up');

      expect(decideAlert(first.next, broken(stage), T0 + 600_000).action).toBe('down');
    }
  });

  it('needs exactly CONFIRM_RUNS failures, so the constant is not decorative', () => {
    let state = INITIAL_STATE;
    for (let i = 1; i < CONFIRM_RUNS; i += 1) {
      const step = decideAlert(state, broken('llm'), T0 + i * 1000);
      expect(step.action).toBe('none');
      state = step.next;
    }
    expect(decideAlert(state, broken('llm'), T0 + CONFIRM_RUNS * 1000).action).toBe('down');
  });

  it('does not repeat itself on every failed run once it has alerted', () => {
    expect(decideAlert(down(), broken('llm'), T0).action).toBe('none');
  });

  it('reminds after six hours if it is still broken', () => {
    const stale = down({ lastAlertAt: T0 - REMIND_EVERY_MS - 1 });
    const d = decideAlert(stale, broken('llm'), T0);
    expect(d.action).toBe('still-down');
    expect(d.next.lastAlertAt).toBe(T0);
    // the outage's start time is preserved, so "down for 9h" stays true
    expect(d.next.since).toBe(stale.since);
  });

  it('does not remind a minute early', () => {
    expect(decideAlert(down({ lastAlertAt: T0 - REMIND_EVERY_MS + 60_000 }), broken('llm'), T0).action).toBe('none');
  });

  it('says so when it recovers', () => {
    const d = decideAlert(down(), healthy, T0);
    expect(d.action).toBe('recovered');
    expect(d.next.state).toBe('up');
    expect(d.next.consecutiveFailures).toBe(0);
  });

  it('does NOT send a recovery note for a blip that never alerted', () => {
    // One failed run, then fine again. The reader was never told anything
    // broke, so telling them it is fixed is noise.
    const blip = decideAlert(INITIAL_STATE, broken('llm'), T0).next;
    expect(decideAlert(blip, healthy, T0 + 600_000).action).toBe('none');
  });

  it('re-arms after recovery, so the next outage alerts again', () => {
    const recovered = decideAlert(down(), healthy, T0).next;
    expect(decideAlert(recovered, broken('firestore'), T0 + 1000).action).toBe('down');
  });
});

describe('the alert itself', () => {
  it('names the failure in the subject, so the phone lock screen is enough', () => {
    const { subject } = buildAlertEmail('down', broken('firestore'), down({ since: T0 }), T0);
    expect(subject).toContain('Sandra is down');
    expect(subject).toContain('Firestore');
  });

  it('carries the failing detail and a first thing to check', () => {
    const { html, text } = buildAlertEmail('down', broken('llm', 'model not found: gemini-9'), down({ since: T0 }), T0);
    expect(text).toContain('model not found: gemini-9');
    expect(html).toContain('What to check first');
    expect(html).toContain('gemini-2.5-flash'); // the hint recalls the outage this already caused
  });

  it('reports how long it has been down', () => {
    const { subject } = buildAlertEmail('still-down', broken('llm'), down({ since: T0 - 3 * 60 * 60 * 1000 }), T0);
    expect(subject).toContain('3h');
  });

  it('escapes the error text rather than pasting it into the markup', () => {
    const { html } = buildAlertEmail('down', broken('llm', '<script>alert(1)</script>'), down(), T0);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('does not tell the reader what to check when the news is good', () => {
    const { html } = buildAlertEmail('recovered', healthy, down(), T0);
    expect(html).not.toContain('What to check first');
    expect(html).toContain('answering again');
  });
});

/**
 * Which host the route probe points at.
 *
 * This is here because getting it wrong is silent and expensive: the first
 * version fell back to VERCEL_URL, and every deployment URL on this project
 * sits behind Vercel Authentication, which answers 401 with a
 * {"protection":{...}} body to every request. The monitor would have reported
 * an outage on its very first run and every ten minutes thereafter.
 */
describe('the host the route probe points at', () => {
  it('never falls back to the deployment URL, which is auth-walled', () => {
    expect(resolveOrigin({ VERCEL_URL: 'something.vercel.app' } as NodeJS.ProcessEnv))
      .toBe(DEFAULT_CHAT_ORIGIN);
  });

  it('uses the public domain when nothing is configured', () => {
    expect(resolveOrigin({} as NodeJS.ProcessEnv)).toBe('https://academy.edlight.org');
  });

  it('lets an explicit origin win, and strips a trailing slash', () => {
    expect(resolveOrigin({ SANDRA_CHAT_ORIGIN: 'https://preview.example.com/' } as NodeJS.ProcessEnv))
      .toBe('https://preview.example.com');
  });
});

describe('the production-domain fallback', () => {
  it("prefers Vercel's PRODUCTION url over the auth-walled deployment url", () => {
    // Both set is the real production case. VERCEL_URL must lose: on this
    // project it 302s to a Vercel SSO page, which is why Sandra's exam
    // catalog tool was failing before this resolver was shared with chat.ts.
    expect(resolveOrigin({
      VERCEL_URL: 'deployment-abc123.vercel.app',
      VERCEL_PROJECT_PRODUCTION_URL: 'academy.edlight.org',
    } as NodeJS.ProcessEnv)).toBe('https://academy.edlight.org');
  });
});
