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
  /**
   * Students who finished a quiz today. A measured count or nothing.
   *
   * Rendered as its own line rather than appended to a sentence, and only
   * above a threshold the caller enforces: see `countQuizzesToday` in
   * api/reengagement.ts. Never estimated — a made-up number here would make
   * every other figure in this email worth doubting.
   */
  peersToday?: number | null;
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
  /** Inbox preview line. See the note where it is rendered. */
  preheader: (name: string | null) => string;
  peersToday: (n: number) => string;
  quizCard: { title: string; meta: string };
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
    preheader: (name) => (name ? `${name}, ta session de 5 minutes t'attend.` : "Ta session de 5 minutes t'attend."),
    peersToday: (n: number) => `${n} élèves ont déjà fait leur quiz aujourd'hui.`,
    quizCard: { title: 'Quiz du jour', meta: '5 questions · environ 2 minutes' },
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
    preheader: (name) => (name ? `${name}, ti sesyon 5 minit ou a ap tann ou.` : 'Ti sesyon 5 minit ou a ap tann ou.'),
    peersToday: (n: number) => `${n} elèv gentan fè quiz yo jodi a.`,
    quizCard: { title: 'Quiz jodi a', meta: '5 kesyon · anviwon 2 minit' },
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
    ? `<tr><td class="edl-pad" style="padding:18px 32px 0;">${chips.join('')}</td></tr>`
    : '';

  // Middle block: the reminder's own subject in a next-step box, or the
  // win-back's "what's waiting" rows.
  const middle = isBack
    ? `<tr><td class="edl-pad" style="padding:10px 32px 0;">
        ${waitingRow(t.waitingChallenge.title, t.waitingChallenge.meta)}
        ${waitingRow(t.waitingBoard.title, t.waitingBoard.meta)}
      </td></tr>`
    : `<tr><td class="edl-pad" style="padding:20px 32px 0;">
        <div class="edl-well" style="background:${PAGE_BG};border-radius:14px;padding:18px 20px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:${AZURE};">${t.nextStep}${p.courseName ? ` · ${esc(p.courseName)}` : ''}</div>
          <div style="margin-top:6px;font-family:${FONT_DISPLAY};font-weight:800;font-size:17px;color:${INK};">${esc(title)}</div>
        </div>
      </td></tr>`;

  const reviewLine = !isBack && (p.dueReviewCount ?? 0) > 0
    ? `<div style="margin-top:14px;"><a href="${esc(`${APP_URL}/revision`)}" style="font-size:13px;font-weight:600;color:${AZURE};text-decoration:none;">${t.reviewLink(p.dueReviewCount!)}</a></div>`
    : '';

  /*
    The preheader: the grey line an inbox prints after the subject.

    With none, Gmail and Apple Mail scrape the first text in the body — here
    the greeting — so the list read "Bonjour, Marie 👋 Bonjour, Marie 👋". It
    is the cheapest thing in an email and the most visible: it is read before
    the email is opened, and it is what decides whether it is opened.

    Hidden in the body with the usual belt and braces — zero size, zero
    opacity, off-screen — then padded with zero-width joiners so the client
    does not pull the NEXT line of real text in after it.
  */
  const preheader = `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${esc(t.preheader(firstName))}${'&#8204;&nbsp;'.repeat(60)}</div>`;

  // Social proof as its own line, only when the caller measured one.
  const peersLine = (p.peersToday ?? 0) > 0
    ? `<tr><td class="edl-pad" style="padding:14px 32px 0;">
        <div style="font-size:13px;line-height:1.5;color:${TEXT_MUTED};">
          <span style="color:${AZURE};font-weight:700;">●</span>&nbsp; ${esc(t.peersToday(p.peersToday!))}
        </div>
      </td></tr>`
    : '';

  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${esc(title)}</title>
  <style>
    /*
      Dark mode, declared rather than left to the client.

      Apple Mail and Outlook invert an undeclared email themselves, and they
      do it by channel: a card that was white on pale blue becomes near-black
      on near-black, and the azure CTA loses its contrast against it. Saying
      what the dark palette is costs nine lines and stops the client guessing.
    */
    @media (prefers-color-scheme: dark) {
      .edl-page { background:#0B1524 !important; }
      .edl-card { background:#131F33 !important; border-color:#24344D !important; }
      .edl-ink  { color:#F2F6FC !important; }
      .edl-body { color:#B8C6DC !important; }
      .edl-faint{ color:#7E8FA8 !important; }
      .edl-well { background:#0F1B2D !important; }
      .edl-rule { border-color:#24344D !important; }
    }
    /* One column on a phone, and never a horizontal scroll. */
    @media only screen and (max-width:600px) {
      .edl-pad { padding-left:20px !important; padding-right:20px !important; }
      .edl-h1  { font-size:23px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};font-family:${FONT_BODY};">
  ${preheader}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="edl-page" style="background:${PAGE_BG};padding:36px 0;">
    <tr><td align="center" style="padding:0 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="edl-card" style="max-width:560px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid ${BORDER};">

        <tr><td class="edl-pad" style="padding:26px 32px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;"><img src="${LOGO_URL}" width="26" height="26" alt="☀️" style="display:block;border-radius:7px;"></td>
            <td style="vertical-align:middle;padding-left:10px;"><span style="font-family:${FONT_DISPLAY};font-weight:800;font-size:16px;letter-spacing:-0.2px;color:${AZURE};">EdLight Academy</span></td>
          </tr></table>
        </td></tr>

        <tr><td class="edl-pad" style="padding:22px 32px 0;">
          <h1 class="edl-h1 edl-ink" style="margin:0;font-family:${FONT_DISPLAY};font-weight:800;font-size:26px;line-height:1.25;letter-spacing:-0.4px;color:${INK};">${greeting}</h1>
          <p class="edl-body" style="margin:10px 0 0;font-size:15px;line-height:1.65;color:${TEXT_BODY};">${intro}</p>
        </td></tr>

        ${chipsBlock}
        ${peersLine}
        ${middle}

        <tr><td align="center" style="padding:24px 32px 6px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:999px;background:${AZURE};">
            <a href="${esc(link)}" style="display:inline-block;padding:14px 36px;font-family:${FONT_DISPLAY};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">${isBack ? t.ctaBack : t.cta}</a>
          </td></tr></table>
          ${reviewLine}
        </td></tr>

        <tr><td class="edl-pad" style="padding:22px 32px 0;"><div class="edl-rule" style="border-top:1px solid ${BORDER};"></div></td></tr>
        <tr><td class="edl-pad" style="padding:16px 32px 26px;">
          <p class="edl-faint" style="margin:0 0 8px;font-size:12px;line-height:1.5;color:${TEXT_FAINT};">${t.footer}</p>
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
