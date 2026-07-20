/**
 * Tests for api/_lib/reminderEmail.ts — the study-reminder email HTML builder
 * and the Resend sender used by the send-reminders cron.
 *
 * `buildReminderEmailHtml` is pure; `sendReminderEmail` is exercised with a
 * mocked global fetch and controlled RESEND_API_KEY / EMAIL_FROM env vars.
 */

import {
  buildReminderEmailHtml,
  sendReminderEmail,
  isEmailConfigured,
} from '../../../api/_lib/reminderEmail';

const BASE = {
  title: 'Continue ta révision de Chimie',
  message: "C'est l'heure de réviser ! Tu as un chapitre en attente.",
  url: '/courses/chimie-ns1',
  lang: 'fr' as const,
};

describe('buildReminderEmailHtml', () => {
  it('renders EdLight branding, the title, the message and a CTA', () => {
    const html = buildReminderEmailHtml(BASE);
    expect(html).toContain('EdLight Academy');
    expect(html).toContain('Continue ta révision de Chimie');
    expect(html).toContain('en attente');
    expect(html).toContain('Continuer à réviser'); // fr CTA
  });

  it('absolutizes a relative url to the academy origin', () => {
    const html = buildReminderEmailHtml(BASE);
    expect(html).toContain('https://academy.edlight.org/courses/chimie-ns1');
  });

  it('keeps an absolute url as-is', () => {
    const html = buildReminderEmailHtml({ ...BASE, url: 'https://academy.edlight.org/dashboard' });
    expect(html).toContain('https://academy.edlight.org/dashboard');
  });

  it('uses Haitian Creole copy when lang = ht', () => {
    const html = buildReminderEmailHtml({ ...BASE, lang: 'ht' });
    expect(html).toContain('Kontinye revize'); // ht CTA
    expect(html).toContain('rapèl etid'); // ht footer
  });

  it('escapes HTML in user-facing strings', () => {
    const html = buildReminderEmailHtml({ ...BASE, title: 'Chimie <script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('includes an unsubscribe / manage-preferences link', () => {
    const html = buildReminderEmailHtml(BASE);
    expect(html).toContain('academy.edlight.org/profile');
  });
});

describe('sendReminderEmail', () => {
  const savedKey = process.env.RESEND_API_KEY;
  const savedFrom = process.env.EMAIL_FROM;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = savedKey;
    if (savedFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = savedFrom;
    jest.restoreAllMocks();
  });

  it('returns an error and does not call fetch when RESEND_API_KEY is unset', async () => {
    delete process.env.RESEND_API_KEY;
    const r = await sendReminderEmail({ ...BASE, to: 'a@b.com' });
    expect('error' in r).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(isEmailConfigured()).toBe(false);
  });

  it('POSTs to Resend with auth + payload and returns sent on 200', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.EMAIL_FROM = 'EdLight <sandra@edlight.org>';
    fetchMock.mockResolvedValue({ ok: true, text: async () => '' });

    const r = await sendReminderEmail({ ...BASE, to: 'student@example.com' });
    expect(r).toEqual({ sent: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(opts.headers.Authorization).toBe('Bearer test-key');
    const body = JSON.parse(opts.body);
    expect(body.to).toBe('student@example.com');
    expect(body.from).toBe('EdLight <sandra@edlight.org>');
    expect(body.subject).toContain('EdLight Academy');
    expect(body.html).toContain('Continuer à réviser');
  });

  it('returns an error (never throws) on a non-ok Resend response', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    fetchMock.mockResolvedValue({ ok: false, status: 422, text: async () => 'bad' });
    const r = await sendReminderEmail({ ...BASE, to: 'x@y.com' });
    expect('error' in r).toBe(true);
  });

  it('returns an error (never throws) when fetch rejects', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    fetchMock.mockRejectedValue(new Error('network'));
    const r = await sendReminderEmail({ ...BASE, to: 'x@y.com' });
    expect('error' in r).toBe(true);
  });
});
