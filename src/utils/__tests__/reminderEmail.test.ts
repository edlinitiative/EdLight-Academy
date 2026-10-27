/**
 * Tests for api/_lib/reminderEmail.ts — the study-reminder email HTML builder
 * and the Resend sender used by the send-reminders cron.
 *
 * `buildReminderEmailHtml` is pure; `sendReminderEmail` is exercised with a
 * mocked global fetch and controlled RESEND_API_KEY / UPDATES_EMAIL_FROM env vars.
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
  it('renders EdLight branding, its own headline and a CTA', () => {
    const html = buildReminderEmailHtml(BASE);
    expect(html).toContain('EdLight Academy');
    expect(html).toContain('C’est l’heure de ta session d’étude.');
    expect(html).toContain('Continuer à apprendre'); // fr CTA
  });

  it('does not print the stored reminder message (old docs hold English defaults)', () => {
    const html = buildReminderEmailHtml({ ...BASE, message: 'Time to continue your learning!' });
    expect(html).not.toContain('Time to continue');
  });

  it('greets the student by first name when known, and namelessly when not', () => {
    const withName = buildReminderEmailHtml({ ...BASE, personalization: { firstName: 'Ted' } });
    expect(withName).toContain('Bonjour Ted,');
    const without = buildReminderEmailHtml(BASE);
    expect(without).toContain('Bonjour,');
    expect(without).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('shows figures only for non-zero values — absence, never a zero', () => {
    const html = buildReminderEmailHtml({
      ...BASE,
      personalization: { streakDays: 7, masteredCount: 0, dueReviewCount: 3 },
    });
    expect(html).toContain('jours d’affilée');
    expect(html).toContain('à revoir');
    expect(html).not.toContain('leçons maîtrisées');
    expect(html).not.toContain('leçon maîtrisée');
    // The review link lands on the web Revizyon session, not a bare dashboard.
    expect(html).toContain('https://academy.edlight.org/revision');
  });

  it('names the course in its own panel when given', () => {
    const html = buildReminderEmailHtml({ ...BASE, personalization: { courseName: 'Chimie NS1' } });
    expect(html).toContain('Ton cours');
    expect(html).toContain('Chimie NS1');
    expect(buildReminderEmailHtml(BASE)).not.toContain('Ton cours');
  });

  it('reengagement variant leads with earned mastery and its own CTA', () => {
    const html = buildReminderEmailHtml({
      ...BASE,
      variant: 'reengagement',
      personalization: { firstName: 'Ted', masteredCount: 12 },
    });
    expect(html).toContain('Ted,');
    expect(html).toContain('Ton travail est toujours là.');
    expect(html).toContain('leçons déjà maîtrisées');
    expect(html).toContain('Reprendre l’apprentissage');
    // The win-back never shows the reminder chips row.
    expect(html).not.toContain('à revoir');
  });

  it('escapes HTML in the first name', () => {
    const html = buildReminderEmailHtml({ ...BASE, personalization: { firstName: '<img onerror=x>' } });
    expect(html).not.toContain('<img onerror');
    expect(html).toContain('&lt;img');
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
    expect(html).toContain('Kontinye aprann'); // ht CTA
    expect(html).toContain('pwograme'); // ht footer
  });

  it('escapes HTML in user-facing strings', () => {
    const html = buildReminderEmailHtml({ ...BASE, title: 'Chimie <script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('question variant makes the question the hero and never carries an answer', () => {
    const html = buildReminderEmailHtml({
      ...BASE, variant: 'question',
      teaser: { question: 'Quelle est la capitale du Canada ?', category: 'Géographie' },
    });
    expect(html).toContain('Quelle est la capitale du Canada ?');
    expect(html).toContain('Géographie');
    expect(html).toContain('Répondre');
    expect(html).not.toContain('Ottawa');
  });

  it('question variant without a teaser falls back to the morning quiz', () => {
    const html = buildReminderEmailHtml({ ...BASE, variant: 'question', teaser: null });
    expect(html).toContain('Ton quiz du matin.');
  });

  it('streak variant shows the real count, and words when there is none', () => {
    const withCount = buildReminderEmailHtml({ ...BASE, variant: 'streak', personalization: { streakDays: 6 } });
    expect(withCount).toContain('Tu as joué 6 jours de suite');
    const without = buildReminderEmailHtml({ ...BASE, variant: 'streak' });
    expect(without).toContain('Tu as joué hier.');
  });

  it('includes an unsubscribe / manage-preferences link', () => {
    const html = buildReminderEmailHtml(BASE);
    expect(html).toContain('academy.edlight.org/profile');
  });
});

describe('sendReminderEmail', () => {
  const savedKey = process.env.RESEND_API_KEY;
  const savedFrom = process.env.UPDATES_EMAIL_FROM;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = savedKey;
    if (savedFrom === undefined) delete process.env.UPDATES_EMAIL_FROM;
    else process.env.UPDATES_EMAIL_FROM = savedFrom;
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
    process.env.UPDATES_EMAIL_FROM = 'EdLight <sandra@updates.edlight.org>';
    fetchMock.mockResolvedValue({ ok: true, text: async () => '' });

    const r = await sendReminderEmail({ ...BASE, to: 'student@example.com' });
    expect(r).toEqual({ sent: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(opts.headers.Authorization).toBe('Bearer test-key');
    const body = JSON.parse(opts.body);
    expect(body.to).toBe('student@example.com');
    expect(body.from).toBe('EdLight <sandra@updates.edlight.org>');
    expect(body.reply_to).toBe('sandra@edlight.org');
    expect(body.subject).toContain('EdLight Academy');
    expect(body.html).toContain('Continuer à apprendre');
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
