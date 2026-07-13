/**
 * Tests for api/_lib/planEmail.ts — the study-plan email HTML builder and the
 * Resend sender (email phase of the Sandra v2 tool-calling design).
 *
 * `buildPlanEmailHtml` is pure; `sendPlanEmail` is exercised with a mocked
 * global fetch and controlled RESEND_API_KEY / EMAIL_FROM env vars.
 */

import { buildPlanEmailHtml, sendPlanEmail } from '../../../api/_lib/planEmail';
import { buildPlanIcs } from '../planIcs';

// Local-midnight epochs so date formatting is timezone-stable in tests.
const JUL_15 = new Date(2026, 6, 15).getTime();
const JUL_18 = new Date(2026, 6, 18).getTime();

const PLAN = {
  title: 'Plan Chimie 4 semaines',
  dailyTargetMinutes: 60,
  tasks: [
    { type: 'exam', examId: 'ex-1', subject: 'Chimie', examTitle: 'Chimie Bac 2019', nextReviewMs: JUL_15 },
    { type: 'exam', examId: 'ex-2', subject: 'Chimie', examTitle: 'Chimie Bac 2020', nextReviewMs: JUL_18 },
    { type: 'exam', examId: 'ex-3', subject: 'Physique', examTitle: 'Physique Bac 2021', nextReviewMs: JUL_15 },
    { type: 'exam', examId: 'ex-4', subject: 'Physique', examTitle: 'Physique Bac 2022', nextReviewMs: null },
  ],
};

describe('buildPlanEmailHtml', () => {
  it('renders the EdLight branding, plan title and daily target in French by default', () => {
    const html = buildPlanEmailHtml(PLAN, 'fr');
    expect(html).toContain('EdLight Academy');
    expect(html).toContain('Plan Chimie 4 semaines');
    expect(html).toMatch(/60\s*minutes par jour/);
  });

  it('lists every task grouped by subject with its scheduled date', () => {
    const html = buildPlanEmailHtml(PLAN, 'fr');
    // Subject group headings
    expect(html).toContain('Chimie');
    expect(html).toContain('Physique');
    // Task titles
    for (const t of ['Chimie Bac 2019', 'Chimie Bac 2020', 'Physique Bac 2021', 'Physique Bac 2022']) {
      expect(html).toContain(t);
    }
    // Dates (dd/mm/yyyy, local)
    expect(html).toContain('15/07/2026');
    expect(html).toContain('18/07/2026');
    // Undated task gets the "to schedule" label instead of a date
    expect(html).toMatch(/À planifier/);
  });

  it('links to the production study-plan page', () => {
    const html = buildPlanEmailHtml(PLAN, 'fr');
    expect(html).toContain('https://academy.edlight.org/study-plan');
  });

  it('renders in Haitian Creole when lang is ht', () => {
    const html = buildPlanEmailHtml(PLAN, 'ht');
    expect(html).toContain('EdLight Academy');
    expect(html).toContain('Plan Chimie 4 semaines');
    expect(html).toMatch(/minit chak jou/);
    expect(html).not.toMatch(/minutes par jour/);
    expect(html).toContain('https://academy.edlight.org/study-plan');
  });

  it('escapes HTML in task and plan titles', () => {
    const html = buildPlanEmailHtml(
      {
        title: 'Plan <script>',
        tasks: [{ examId: 'x', subject: 'Chimie', examTitle: 'A & B <i>', nextReviewMs: JUL_15 }],
      },
      'fr',
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<i>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A &amp; B &lt;i&gt;');
  });
});

describe('sendPlanEmail', () => {
  const savedKey = process.env.RESEND_API_KEY;
  const savedFrom = process.env.EMAIL_FROM;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    fetchMock = jest.fn();
    (global as Record<string, unknown>).fetch = fetchMock;
  });

  afterAll(() => {
    if (savedKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = savedKey;
    if (savedFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = savedFrom;
  });

  it('returns the not-configured French error (and never calls fetch) without RESEND_API_KEY', async () => {
    const out = await sendPlanEmail({ to: 'jean@gmail.com', plan: PLAN, lang: 'fr' });
    expect(out).toEqual({ error: "l'envoi d'email n'est pas encore configuré" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs the branded email + base64 ics attachment to the Resend API', async () => {
    process.env.RESEND_API_KEY = 'rk_test_123';
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'em_1' }) });

    const out = await sendPlanEmail({ to: 'jean@gmail.com', plan: PLAN, lang: 'fr' });
    expect(out).toEqual({ sent: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer rk_test_123');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');

    const body = JSON.parse(String(init.body)) as {
      from: string;
      to: string;
      subject: string;
      html: string;
      attachments: Array<{ filename: string; content: string }>;
    };
    expect(body.from).toBe('Sandra · EdLight Academy <sandra@edlight.org>'); // default sender
    expect(body.to).toBe('jean@gmail.com');
    expect(body.subject).toContain('Plan Chimie 4 semaines');
    expect(body.html).toBe(buildPlanEmailHtml(PLAN, 'fr'));

    // The attachment is exactly buildPlanIcs(plan), base64-encoded.
    expect(body.attachments).toHaveLength(1);
    expect(body.attachments[0].filename).toBe('plan-etude-edlight.ics');
    expect(body.attachments[0].content).toBe(Buffer.from(buildPlanIcs(PLAN), 'utf8').toString('base64'));
    const decoded = Buffer.from(body.attachments[0].content, 'base64').toString('utf8');
    expect(decoded).toContain('BEGIN:VCALENDAR');
  });

  it('honours the EMAIL_FROM env override', async () => {
    process.env.RESEND_API_KEY = 'rk_test_123';
    process.env.EMAIL_FROM = 'EdLight <bonjour@edlight.org>';
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'em_2' }) });

    await sendPlanEmail({ to: 'jean@gmail.com', plan: PLAN, lang: 'fr' });
    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.from).toBe('EdLight <bonjour@edlight.org>');
  });

  it('returns a short French error (logging the detail server-side) on a non-2xx Resend response', async () => {
    process.env.RESEND_API_KEY = 'rk_test_123';
    fetchMock.mockResolvedValue({ ok: false, status: 422, text: async () => 'domain not verified' });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const out = await sendPlanEmail({ to: 'jean@gmail.com', plan: PLAN, lang: 'fr' });

    expect(out).toEqual({ error: expect.stringMatching(/email/i) });
    const error = (out as { error: string }).error;
    expect(error).not.toBe("l'envoi d'email n'est pas encore configuré");
    expect(error).not.toContain('domain not verified'); // detail stays server-side
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('422'));
    errorSpy.mockRestore();
  });

  it('returns the same French error when fetch itself rejects', async () => {
    process.env.RESEND_API_KEY = 'rk_test_123';
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const out = await sendPlanEmail({ to: 'jean@gmail.com', plan: PLAN, lang: 'fr' });
    expect(out).toEqual({ error: expect.stringMatching(/email/i) });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
