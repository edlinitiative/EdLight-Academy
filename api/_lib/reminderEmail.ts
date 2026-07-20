/**
 * api/_lib/reminderEmail.ts — study-reminder email for the send-reminders cron.
 * ---------------------------------------------------------------------------
 * The email counterpart to web-push reminders. When a reminder is due and the
 * user has email reminders enabled, the cron sends a branded, bilingual nudge
 * so learners without push (iOS Safari, uninstalled PWA, poor connectivity)
 * still get reminded.
 *
 * Exports:
 *   • isEmailConfigured() — whether RESEND_API_KEY is set.
 *   • buildReminderEmailHtml({ title, message, url, lang }) — pure, branded HTML.
 *   • sendReminderEmail({ to, title, message, url, lang }) — thin Resend REST
 *     wrapper (POST https://api.resend.com/emails). Returns `{ sent: true }` or
 *     `{ error }`; never throws; provider details logged server-side only.
 *
 * Kept separate from planEmail.ts (which sends the .ics study plan) so each
 * email type owns its copy and neither drags the other's concerns.
 */

export type ReminderEmailLang = 'fr' | 'ht';

const RESEND_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'EdLight Academy <sandra@edlight.org>';
const APP_URL = 'https://academy.edlight.org';
const SETTINGS_URL = `${APP_URL}/profile`;
const AZURE = '#1B6FE0';

const SEND_FAILED_ERROR = "l'email n'a pas pu être envoyé";
const NOT_CONFIGURED_ERROR = "l'envoi d'email n'est pas configuré";

interface Strings {
  subject: (title: string) => string;
  cta: string;
  footer: string;
  unsubscribe: string;
}

const STRINGS: Record<ReminderEmailLang, Strings> = {
  fr: {
    subject: (title) => `${title} — EdLight Academy`,
    cta: 'Continuer à réviser',
    footer: "Tu reçois cet e-mail parce que les rappels d'étude sont activés sur ton compte EdLight Academy.",
    unsubscribe: 'Gérer mes préférences de notification',
  },
  ht: {
    subject: (title) => `${title} — EdLight Academy`,
    cta: 'Kontinye revize',
    footer: 'Ou resevwa imèl sa a paske rapèl etid yo aktive sou kont EdLight Academy ou.',
    unsubscribe: 'Jere preferans notifikasyon mwen',
  },
};

const esc = (s: string) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Pure, branded reminder email HTML. Inline styles only (email clients). */
export function buildReminderEmailHtml(args: {
  title: string;
  message: string;
  url: string;
  lang: ReminderEmailLang;
}): string {
  const { title, message, url, lang } = args;
  const t = STRINGS[lang] || STRINGS.fr;
  const link = url.startsWith('http') ? url : `${APP_URL}${url.startsWith('/') ? '' : '/'}${url}`;

  return `<!doctype html>
<html lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e8edf5;">
        <tr><td style="background:${AZURE};padding:20px 28px;">
          <span style="color:#ffffff;font-size:18px;font-weight:800;letter-spacing:-0.2px;">EdLight Academy</span>
        </td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#0f172a;">${esc(title)}</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#475569;">${esc(message)}</p>
          <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:999px;background:${AZURE};">
            <a href="${esc(link)}" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">${t.cta}</a>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:0 28px 28px;">
          <hr style="border:none;border-top:1px solid #eef1f6;margin:0 0 16px;">
          <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#94a3b8;">${t.footer}</p>
          <a href="${esc(SETTINGS_URL)}" style="font-size:12px;color:${AZURE};text-decoration:none;">${t.unsubscribe}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

/** Send one reminder email via Resend. Never throws. */
export async function sendReminderEmail(args: {
  to: string;
  title: string;
  message: string;
  url: string;
  lang: ReminderEmailLang;
}): Promise<{ sent: true } | { error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { error: NOT_CONFIGURED_ERROR };

  const { to, title, message, url, lang } = args;
  const t = STRINGS[lang] || STRINGS.fr;

  const payload = {
    from: process.env.EMAIL_FROM || DEFAULT_FROM,
    to,
    subject: t.subject(title),
    html: buildReminderEmailHtml({ title, message, url, lang }),
  };

  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`[reminderEmail] Resend ${res.status}: ${detail.slice(0, 300)}`);
      return { error: SEND_FAILED_ERROR };
    }
    return { sent: true };
  } catch (err) {
    console.error('[reminderEmail] Resend request failed:', err);
    return { error: SEND_FAILED_ERROR };
  }
}
