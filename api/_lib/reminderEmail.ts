/**
 * api/_lib/reminderEmail.ts — personalized study-reminder email.
 * ---------------------------------------------------------------------------
 * The email counterpart to web-push reminders, redesigned 2026-08 around one
 * complaint: the old email was a generic azure box — no name, no progress,
 * nothing the student had earned. This one opens with the student's name and
 * shows their actual state (streak, lessons mastered, questions to review)
 * before asking for anything. Design source: the "EdLight Reminder Emails"
 * canvas (Limyè tokens: azure #1B6FE0, ink #0F1E38, border #E3EAF4, 24px card,
 * pill CTA, gold/coral sun).
 *
 * Two variants share the shell:
 *   • 'reminder'     — a reminder the student scheduled (send-reminders cron).
 *   • 'reengagement' — the "nou manke w" win-back (reengagement cron).
 *
 * Exports:
 *   • isEmailConfigured() — whether RESEND_API_KEY is set.
 *   • buildReminderEmailHtml(args) — pure, personalized, email-safe HTML
 *     (tables + inline styles; no SVG — Gmail strips it; logo is the hosted
 *     PWA icon with alt-text fallback).
 *   • sendReminderEmail(args) — thin Resend REST wrapper. Never throws.
 *
 * Every personalization field is optional: with none supplied the email
 * degrades to greeting + message + CTA and never shows an empty chip or a
 * zero — absence, not a bad grade.
 */

export type ReminderEmailLang = 'fr' | 'ht';
export type ReminderEmailVariant = 'reminder' | 'reengagement';

export interface ReminderPersonalization {
  /** Student's first name — the single highest-value field. */
  firstName?: string | null;
  /** Current streak in days; pass only when validated as alive (recent activity). */
  streakDays?: number | null;
  /** Lessons confirmed on a chapter test (mastery model). */
  masteredCount?: number | null;
  /** Missed quiz questions currently due for review. */
  dueReviewCount?: number | null;
  /** Course the reminder points at — overline of the next-step box. */
  courseName?: string | null;
}

const RESEND_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'EdLight Academy <sandra@edlight.org>';
const APP_URL = 'https://academy.edlight.org';
const SETTINGS_URL = `${APP_URL}/profile`;
const LOGO_URL = `${APP_URL}/icon-192.png`;

// Limyè tokens (src/index.css) — literal because email needs inline values.
const AZURE = '#1B6FE0';
const AZURE_DEEP = '#114A99';
const AZURE_TINT = '#EAF2FE';
const INK = '#0F1E38';
const TEXT_BODY = '#46587A';
const TEXT_MUTED = '#5A6B85';
const TEXT_FAINT = '#A9B7CC';
const BORDER = '#E3EAF4';
const PAGE_BG = '#F1F5FA';
const GREEN_TINT = '#E8F6EE';
const GREEN_DEEP = '#0F7A42';
const AMBER_TINT = '#FDF3E3';
const AMBER_DEEP = '#A36200';

const FONT_BODY = "'Inter','Segoe UI',system-ui,-apple-system,sans-serif";
const FONT_DISPLAY = "'Plus Jakarta Sans','Inter','Segoe UI',system-ui,sans-serif";

const SEND_FAILED_ERROR = "l'email n'a pas pu être envoyé";
const NOT_CONFIGURED_ERROR = "l'envoi d'email n'est pas configuré";

interface Strings {
  subject: (title: string) => string;
  greeting: (name: string | null) => string;
  greetingBack: (name: string | null) => string;
  defaultIntro: string;
  backIntroMastered: (n: number) => string;
  backIntroGeneric: string;
  chipStreak: (n: number) => string;
  chipMastered: (n: number) => string;
  chipReview: (n: number) => string;
  nextStep: string;
  cta: string;
  ctaBack: string;
  reviewLink: (n: number) => string;
  waitingChallenge: { title: string; meta: string };
  waitingBoard: { title: string; meta: string };
  footer: string;
  unsubscribe: string;
}

const STRINGS: Record<ReminderEmailLang, Strings> = {
  fr: {
    subject: (title) => `${title} — EdLight Academy`,
    greeting: (name) => (name ? `Bonjour, ${name} 👋` : 'Bonjour 👋'),
    greetingBack: (name) => (name ? `Tu nous manques, ${name} 👋` : 'Tu nous manques 👋'),
    defaultIntro: "C'est l'heure de ta session d'étude.",
    backIntroMastered: (n) =>
      `Tu as déjà maîtrisé <strong style="color:${INK};">${n} leçon${n > 1 ? 's' : ''}</strong> — ce travail t'attend, il n'est pas perdu. Une petite session de 5 minutes suffit pour reprendre le chemin.`,
    backIntroGeneric:
      "Ton défi du jour et le classement de la semaine t'attendent. Une petite session de 5 minutes suffit pour reprendre le chemin.",
    chipStreak: (n) => `🔥 ${n} jour${n > 1 ? 's' : ''} d'affilée`,
    chipMastered: (n) => `${n} leçon${n > 1 ? 's' : ''} maîtrisée${n > 1 ? 's' : ''}`,
    chipReview: (n) => `${n} question${n > 1 ? 's' : ''} à revoir`,
    nextStep: 'Ta prochaine étape',
    cta: 'Continuer à apprendre →',
    ctaBack: "Reprendre l'apprentissage →",
    reviewLink: (n) => `Revoir ${n > 1 ? `les ${n} questions` : 'la question'} que tu as ratée${n > 1 ? 's' : ''}`,
    waitingChallenge: { title: "⚡ Ton défi du jour t'attend", meta: '5 questions rapides · ~5 min' },
    waitingBoard: { title: '🏆 Le classement de la semaine', meta: 'Tes camarades avancent — reprends ta place' },
    footer: "Tu reçois cet e-mail parce que les rappels d'étude sont activés sur ton compte EdLight Academy.",
    unsubscribe: 'Gérer mes préférences de notification',
  },
  ht: {
    subject: (title) => `${title} — EdLight Academy`,
    greeting: (name) => (name ? `Bonjou, ${name} 👋` : 'Bonjou 👋'),
    greetingBack: (name) => (name ? `Nou manke w, ${name} 👋` : 'Nou manke w 👋'),
    defaultIntro: 'Li lè pou ti sesyon etid ou a.',
    backIntroMastered: (n) =>
      `Ou te deja metrize <strong style="color:${INK};">${n} leson</strong> — travay sa a ap tann ou, li pa pèdi. Yon ti sesyon 5 minit ase pou ou reprann chemen an.`,
    backIntroGeneric:
      'Defi jodi a ak klasman semèn nan ap tann ou. Yon ti sesyon 5 minit ase pou ou reprann chemen an.',
    chipStreak: (n) => `🔥 ${n} jou youn apre lòt`,
    chipMastered: (n) => `${n} leson metrize`,
    chipReview: (n) => `${n} kesyon pou revize`,
    nextStep: 'Pwochen etap ou',
    cta: 'Kontinye aprann →',
    ctaBack: 'Retounen aprann →',
    reviewLink: (n) => `Revize ${n} kesyon ou te rate yo`,
    waitingChallenge: { title: '⚡ Defi jodi a ap tann ou', meta: '5 kesyon rapid · ~5 min' },
    waitingBoard: { title: '🏆 Klasman semèn nan', meta: 'Zanmi ou yo ap avanse — pran plas ou' },
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

const chip = (text: string, bg: string, color: string) =>
  `<span style="display:inline-block;padding:7px 14px;border-radius:999px;background:${bg};color:${color};font-size:13px;font-weight:700;margin:0 6px 8px 0;">${text}</span>`;

const waitingRow = (title: string, meta: string) =>
  `<div style="background:${PAGE_BG};border-radius:14px;padding:14px 18px;margin-top:10px;">
    <div style="font-family:${FONT_DISPLAY};font-weight:700;font-size:14.5px;color:${INK};">${title}</div>
    <div style="margin-top:2px;font-size:13px;color:${TEXT_MUTED};">${meta}</div>
  </div>`;

/** Pure, personalized reminder email HTML. Inline styles only (email clients). */
export function buildReminderEmailHtml(args: {
  title: string;
  message: string;
  url: string;
  lang: ReminderEmailLang;
  variant?: ReminderEmailVariant;
  personalization?: ReminderPersonalization;
}): string {
  const { title, message, url, lang } = args;
  const variant: ReminderEmailVariant = args.variant ?? 'reminder';
  const p = args.personalization ?? {};
  const t = STRINGS[lang] || STRINGS.fr;
  const link = url.startsWith('http') ? url : `${APP_URL}${url.startsWith('/') ? '' : '/'}${url}`;

  const isBack = variant === 'reengagement';
  const firstName = p.firstName?.trim() ? esc(p.firstName.trim()) : null;
  const greeting = isBack ? t.greetingBack(firstName) : t.greeting(firstName);

  // Intro paragraph. The reminder variant speaks the student's own scheduled
  // message; the win-back leads with what they've already earned.
  const mastered = p.masteredCount ?? 0;
  const intro = isBack
    ? (mastered > 0 ? t.backIntroMastered(mastered) : t.backIntroGeneric)
    : esc(message || t.defaultIntro);

  // Progress chips — each renders only when there is something real to show.
  const chips: string[] = [];
  if (!isBack) {
    if ((p.streakDays ?? 0) > 0) chips.push(chip(t.chipStreak(p.streakDays!), AZURE_TINT, AZURE_DEEP));
    if (mastered > 0) chips.push(chip(t.chipMastered(mastered), GREEN_TINT, GREEN_DEEP));
    if ((p.dueReviewCount ?? 0) > 0) chips.push(chip(t.chipReview(p.dueReviewCount!), AMBER_TINT, AMBER_DEEP));
  }
  const chipsBlock = chips.length
    ? `<tr><td style="padding:18px 32px 0;">${chips.join('')}</td></tr>`
    : '';

  // Middle block: the reminder's own subject in a next-step box, or the
  // win-back's "what's waiting" rows.
  const middle = isBack
    ? `<tr><td style="padding:10px 32px 0;">
        ${waitingRow(t.waitingChallenge.title, t.waitingChallenge.meta)}
        ${waitingRow(t.waitingBoard.title, t.waitingBoard.meta)}
      </td></tr>`
    : `<tr><td style="padding:20px 32px 0;">
        <div style="background:${PAGE_BG};border-radius:14px;padding:18px 20px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:${AZURE};">${t.nextStep}${p.courseName ? ` · ${esc(p.courseName)}` : ''}</div>
          <div style="margin-top:6px;font-family:${FONT_DISPLAY};font-weight:800;font-size:17px;color:${INK};">${esc(title)}</div>
        </div>
      </td></tr>`;

  const reviewLine = !isBack && (p.dueReviewCount ?? 0) > 0
    ? `<div style="margin-top:14px;"><a href="${esc(`${APP_URL}/dashboard`)}" style="font-size:13px;font-weight:600;color:${AZURE};text-decoration:none;">${t.reviewLink(p.dueReviewCount!)}</a></div>`
    : '';

  return `<!doctype html>
<html lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${PAGE_BG};font-family:${FONT_BODY};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE_BG};padding:36px 0;">
    <tr><td align="center" style="padding:0 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid ${BORDER};">

        <tr><td style="padding:26px 32px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;"><img src="${LOGO_URL}" width="26" height="26" alt="☀️" style="display:block;border-radius:7px;"></td>
            <td style="vertical-align:middle;padding-left:10px;"><span style="font-family:${FONT_DISPLAY};font-weight:800;font-size:16px;letter-spacing:-0.2px;color:${AZURE};">EdLight Academy</span></td>
          </tr></table>
        </td></tr>

        <tr><td style="padding:22px 32px 0;">
          <h1 style="margin:0;font-family:${FONT_DISPLAY};font-weight:800;font-size:26px;line-height:1.25;letter-spacing:-0.4px;color:${INK};">${greeting}</h1>
          <p style="margin:10px 0 0;font-size:15px;line-height:1.65;color:${TEXT_BODY};">${intro}</p>
        </td></tr>

        ${chipsBlock}
        ${middle}

        <tr><td align="center" style="padding:24px 32px 6px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:999px;background:${AZURE};">
            <a href="${esc(link)}" style="display:inline-block;padding:14px 36px;font-family:${FONT_DISPLAY};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">${isBack ? t.ctaBack : t.cta}</a>
          </td></tr></table>
          ${reviewLine}
        </td></tr>

        <tr><td style="padding:22px 32px 0;"><div style="border-top:1px solid ${BORDER};"></div></td></tr>
        <tr><td style="padding:16px 32px 26px;">
          <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:${TEXT_FAINT};">${t.footer}</p>
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
  variant?: ReminderEmailVariant;
  personalization?: ReminderPersonalization;
}): Promise<{ sent: true } | { error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { error: NOT_CONFIGURED_ERROR };

  const t = STRINGS[args.lang] || STRINGS.fr;

  const payload = {
    from: process.env.EMAIL_FROM || DEFAULT_FROM,
    to: args.to,
    subject: t.subject(args.title),
    html: buildReminderEmailHtml(args),
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
