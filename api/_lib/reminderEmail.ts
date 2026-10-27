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
 * Rebuilt 2026-10-17 on api/_lib/emailShell.ts (the "EdLight Emails —
 * Premium" canvas): no emoji headlines, the student's figures as a
 * scorecard, one full-width button. Five variants share the shell:
 *   • 'reminder'     — a reminder the student scheduled (send-reminders cron).
 *   • 'reengagement' — the "nou manke w" win-back (reengagement cron).
 *   • 'question'     — the daily question; the question is the hero, never
 *                      its answer (daily-nudge cron, see teaserQuestion.ts).
 *   • 'streak'       — streak at risk (daily-nudge cron).
 *   • 'morning'      — the plain morning quiz nudge (daily-nudge, no teaser).
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

import { APP_URL, C, FONT_BODY, FONT_DISPLAY, button, emailDocument, esc, eyebrow, h1, hello, para, plainSubject, row, scorecard, small, textLink, well } from './emailShell';

export type ReminderEmailLang = 'fr' | 'ht';
export type ReminderEmailVariant = 'reminder' | 'reengagement' | 'question' | 'streak' | 'morning';

export interface ReminderPersonalization {
  /** Student's first name — the single highest-value field. */
  firstName?: string | null;
  /** Current streak in days; pass only when validated as alive (recent activity). */
  streakDays?: number | null;
  /** Lessons confirmed on a chapter test (mastery model). */
  masteredCount?: number | null;
  /** Missed quiz questions currently due for review. */
  dueReviewCount?: number | null;
  /** Course the reminder points at — the "Ton cours" panel. */
  courseName?: string | null;
  /**
   * Students who finished a quiz today. A measured count or nothing.
   *
   * Rendered as its own line, and only above a threshold the caller enforces:
   * see `countQuizzesToday` in api/reengagement.ts. Never estimated — a
   * made-up number here would make every other figure in this email worth
   * doubting.
   */
  peersToday?: number | null;
}

/** The daily question: its text and category, never its answer. */
export interface ReminderTeaser {
  question: string;
  category: string;
}

const RESEND_URL = 'https://api.resend.com/emails';
// Study reminders are nudges, not transactional mail: they send from the updates
// subdomain so their reputation never touches account or plan emails.
const DEFAULT_FROM = 'EdLight Academy <sandra@updates.edlight.org>';
const REPLY_TO = 'sandra@edlight.org';

const SEND_FAILED_ERROR = "l'email n'a pas pu être envoyé";
const NOT_CONFIGURED_ERROR = "l'envoi d'email n'est pas configuré";

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

const STRINGS = {
  fr: {
    hello: (name: string | null) => (name ? `Bonjour ${name},` : 'Bonjour,'),
    helloBack: (name: string | null) => (name ? `${name},` : 'Bonjour,'),
    reminderContext: 'Ton rappel',
    reminderH1: 'C’est l’heure de ta session d’étude.',
    reminderBody: 'Ta leçon t’attend là où tu l’as laissée.',
    statStreak: (n: number) => plural(n, 'jour d’affilée', 'jours d’affilée'),
    statMastered: (n: number) => plural(n, 'leçon maîtrisée', 'leçons maîtrisées'),
    statReview: 'à revoir',
    yourCourse: 'Ton cours',
    cta: 'Continuer à apprendre',
    reviewLink: (n: number) => (n > 1 ? `Revoir les ${n} questions ratées` : 'Revoir la question ratée'),
    peersToday: (n: number) => `${n} élèves ont déjà fait leur quiz aujourd’hui.`,
    backH1: 'Ton travail est toujours là.',
    backBodyMastered: 'Tes progrès ne se sont pas perdus pendant ton absence. Tu reprends là où tu en étais.',
    backBodyGeneric: 'Tes progrès ne se sont pas perdus pendant ton absence. Une petite session suffit pour reprendre.',
    backMastered: (n: number) => plural(n, 'leçon déjà maîtrisée', 'leçons déjà maîtrisées'),
    backWaiting: 'Ce qui t’attend',
    backQuestion: { title: 'La question du jour', meta: 'La même pour tous les élèves' },
    backBoard: { title: 'Le classement de la semaine', meta: 'Vois où tu en es avec ton école' },
    ctaBack: 'Reprendre l’apprentissage',
    questionIntro: 'Voici la question du jour. Tous les élèves d’EdLight reçoivent la même.',
    questionHint: 'La réponse est dans l’app. Dix secondes.',
    questionCta: 'Répondre',
    questionFooter: 'Une question par jour, le matin. Tu la reçois parce que les rappels d’étude sont activés.',
    streakContext: 'Ta série',
    streakH1: 'Ne laisse pas ta série tomber aujourd’hui.',
    streakDaysUnit: (n: number) => plural(n, 'jour', 'jours'),
    streakBody: (n: number) => `Tu as joué ${n} ${plural(n, 'jour', 'jours')} de suite. Un seul quiz aujourd’hui la garde en vie.`,
    streakBodyNoCount: 'Tu as joué hier. Un seul quiz aujourd’hui garde ta série en vie.',
    streakCta: 'Faire le quiz du jour',
    streakNote: 'Sans quiz aujourd’hui, ta série repart à zéro.',
    morningH1: 'Ton quiz du matin.',
    morningBody: 'Deux minutes de quiz pour bien commencer la journée.',
    morningCta: 'Commencer le quiz',
    footer: 'Tu reçois cet e-mail parce que les rappels d’étude sont activés sur ton compte EdLight Academy.',
    footerReminder: 'Tu reçois ce rappel parce que tu l’as programmé dans EdLight Academy.',
    prefs: 'Gérer mes notifications',
    preheader: {
      reminder: (n: string | null) => (n ? `${n}, ta session d’étude t’attend.` : 'Ta session d’étude t’attend.'),
      reengagement: (n: string | null) => (n ? `${n}, ton travail est toujours là.` : 'Ton travail est toujours là.'),
      question: () => 'La question du jour — la même pour tous les élèves.',
      streak: (n: string | null) => (n ? `${n}, un quiz aujourd’hui garde ta série en vie.` : 'Un quiz aujourd’hui garde ta série en vie.'),
      morning: () => 'Deux minutes de quiz pour bien commencer la journée.',
    },
  },
  ht: {
    hello: (name: string | null) => (name ? `Bonjou ${name},` : 'Bonjou,'),
    helloBack: (name: string | null) => (name ? `${name},` : 'Bonjou,'),
    reminderContext: 'Rapèl ou',
    reminderH1: 'Li lè pou sesyon etid\u00A0ou.',
    reminderBody: 'Leson ou ap tann ou kote ou te kite l la.',
    statStreak: () => 'jou youn apre lòt',
    statMastered: () => 'leson metrize',
    statReview: 'pou revize',
    yourCourse: 'Kou ou',
    cta: 'Kontinye aprann',
    reviewLink: (n: number) => `Revize ${n} kesyon ou te rate yo`,
    peersToday: (n: number) => `${n} elèv gentan fè quiz yo jodi a.`,
    backH1: 'Travay ou fè a la toujou.',
    backBodyMastered: 'Pwogrè ou pa pèdi pandan ou te ale. Ou ka reprann kote ou te rive a.',
    backBodyGeneric: 'Pwogrè ou pa pèdi pandan ou te ale. Yon ti sesyon ase pou reprann.',
    backMastered: () => 'leson ou deja metrize',
    backWaiting: 'Kisa k ap tann ou',
    backQuestion: { title: 'Kesyon jodi a', meta: 'Menm kesyon an pou tout elèv yo' },
    backBoard: { title: 'Klasman semèn nan', meta: 'Wè ki kote ou ye ak lekòl ou' },
    ctaBack: 'Retounen aprann',
    questionIntro: 'Men kesyon jodi a. Tout elèv EdLight yo resevwa menm kesyon an.',
    questionHint: 'Repons lan nan app la. Dis segond.',
    questionCta: 'Reponn',
    questionFooter: 'Yon kesyon chak jou, nan maten. Ou resevwa l paske rapèl etid yo aktive.',
    streakContext: 'Seri ou',
    streakH1: 'Pa kite seri ou tonbe jodi\u00A0a.',
    streakDaysUnit: () => 'jou',
    streakBody: (n: number) => `Ou jwe chak jou depi ${n} jou. Yon sèl quiz jodi a kenbe seri a vivan.`,
    streakBodyNoCount: 'Ou te jwe yè. Yon sèl quiz jodi a kenbe seri ou vivan.',
    streakCta: 'Fè quiz jodi a',
    streakNote: 'Si ou pa jwe jodi a, seri a rekòmanse a zewo.',
    morningH1: 'Quiz maten ou.',
    morningBody: 'De minit quiz pou kòmanse jounen an byen.',
    morningCta: 'Kòmanse quiz la',
    footer: 'Ou resevwa imèl sa a paske rapèl etid yo aktive sou kont EdLight Academy ou.',
    footerReminder: 'Ou resevwa rapèl sa a paske ou te pwograme l nan EdLight Academy.',
    prefs: 'Jere notifikasyon mwen',
    preheader: {
      reminder: (n: string | null) => (n ? `${n}, sesyon etid ou ap tann ou.` : 'Sesyon etid ou ap tann ou.'),
      reengagement: (n: string | null) => (n ? `${n}, travay ou fè a la toujou.` : 'Travay ou fè a la toujou.'),
      question: () => 'Kesyon jodi a — menm kesyon an pou tout elèv yo.',
      streak: (n: string | null) => (n ? `${n}, yon quiz jodi a kenbe seri ou vivan.` : 'Yon quiz jodi a kenbe seri ou vivan.'),
      morning: () => 'De minit quiz pou kòmanse jounen an byen.',
    },
  },
};

const waitingRow = (href: string, title: string, meta: string) =>
  `<a href="${esc(href)}" style="display:block;text-decoration:none;margin-top:8px;">
    ${well(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td valign="middle">
        <div class="edl-ink" style="font-family:${FONT_DISPLAY};font-weight:700;font-size:17px;line-height:1.3;color:${C.ink};">${title}</div>
        <div class="edl-muted" style="margin-top:2px;font-family:${FONT_BODY};font-size:15px;line-height:1.4;color:${C.muted};">${meta}</div>
      </td>
      <td valign="middle" align="right" style="width:24px;font-family:${FONT_DISPLAY};font-size:22px;color:${C.action};">&rsaquo;</td>
    </tr></table>`, '16px 18px')}
  </a>`;

/** Pure, personalized student email HTML. */
export function buildReminderEmailHtml(args: {
  title: string;
  /** Kept for callers; the copy is now owned here (old reminder docs hold English defaults). */
  message?: string;
  url: string;
  lang: ReminderEmailLang;
  variant?: ReminderEmailVariant;
  personalization?: ReminderPersonalization;
  teaser?: ReminderTeaser | null;
}): string {
  const { title, url, lang } = args;
  const variant: ReminderEmailVariant = args.variant ?? 'reminder';
  const p = args.personalization ?? {};
  const t = STRINGS[lang] || STRINGS.fr;
  const link = url.startsWith('http') ? url : `${APP_URL}${url.startsWith('/') ? '' : '/'}${url}`;
  const name = p.firstName?.trim() ? esc(p.firstName.trim()) : null;
  const streak = p.streakDays ?? 0;
  const mastered = p.masteredCount ?? 0;
  const due = p.dueReviewCount ?? 0;
  const peers = p.peersToday ?? 0;
  const peersRow = peers > 0 ? row(small(esc(t.peersToday(peers))), '20px 28px 0') : '';

  let rows = '';
  let context: string | undefined;
  let footerNote = t.footer;

  if (variant === 'reengagement') {
    rows += row(hello(t.helloBack(name)) + h1(t.backH1) + para(mastered > 0 ? t.backBodyMastered : t.backBodyGeneric), '28px 28px 0');
    if (mastered > 0) {
      rows += row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="edl-rule" style="border:1px solid ${C.border};border-radius:16px;border-collapse:separate;"><tr>
        <td valign="middle" style="padding:16px 0 16px 20px;width:1%;white-space:nowrap;font-family:${FONT_DISPLAY};font-weight:800;font-size:40px;line-height:1;color:${C.success};">${mastered}</td>
        <td valign="middle" class="edl-ink" style="padding:16px 20px 16px 12px;font-family:${FONT_BODY};font-size:16px;font-weight:600;line-height:1.4;color:${C.ink};">${t.backMastered(mastered)}</td>
      </tr></table>`, '22px 28px 0');
    }
    rows += row(eyebrow(t.backWaiting)
      + waitingRow(`${APP_URL}/jeux`, t.backQuestion.title, t.backQuestion.meta)
      + waitingRow(`${APP_URL}/classement`, t.backBoard.title, t.backBoard.meta), '22px 28px 0');
    rows += peersRow;
    rows += row(button(link, t.ctaBack));
  } else if (variant === 'question' && args.teaser?.question) {
    rows += row(hello(t.hello(name)) + para(t.questionIntro, 8), '28px 28px 0');
    rows += row(`<div style="background:${C.ink};border-radius:18px;padding:24px 22px 26px;">
        <span style="display:inline-block;padding:5px 12px;border-radius:999px;background:#2A3550;color:${C.gold};font-family:${FONT_BODY};font-size:13px;font-weight:700;">${esc(args.teaser.category)}</span>
        <div style="margin-top:14px;font-family:${FONT_DISPLAY};font-weight:800;font-size:26px;line-height:1.22;letter-spacing:-0.4px;color:#FFFFFF;">${esc(args.teaser.question)}</div>
        <div style="margin-top:14px;font-family:${FONT_BODY};font-size:15px;line-height:1.5;color:#B9C7DA;">${t.questionHint}</div>
      </div>`, '20px 20px 0');
    rows += row(button(link, t.questionCta));
    footerNote = t.questionFooter;
  } else if (variant === 'streak') {
    context = t.streakContext;
    rows += row(hello(t.hello(name)) + h1(t.streakH1), '28px 28px 0');
    rows += row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="edl-warn" style="background:${C.warnBg};border-radius:18px;border-collapse:separate;"><tr>
        ${streak > 0 ? `<td valign="middle" style="padding:20px 0 20px 20px;width:76px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" style="width:76px;height:76px;background:#FFFFFF;border-radius:20px;">
            <div style="font-family:${FONT_DISPLAY};font-weight:800;font-size:32px;line-height:1;color:${C.ink};">${streak}</div>
            <div style="margin-top:3px;font-family:${FONT_BODY};font-size:13px;font-weight:700;color:${C.warnInk};">${t.streakDaysUnit(streak)}</div>
          </td></tr></table>
        </td>` : ''}
        <td valign="middle" style="padding:20px;"><p style="margin:0;font-family:${FONT_BODY};font-size:16px;line-height:1.5;color:${C.warnText};">${streak > 0 ? t.streakBody(streak) : t.streakBodyNoCount}</p></td>
      </tr></table>`, '22px 28px 0');
    rows += row(button(link, t.streakCta) + small(t.streakNote, 12, 'center'));
  } else if (variant === 'morning' || variant === 'question') {
    rows += row(hello(t.hello(name)) + h1(t.morningH1) + para(t.morningBody), '28px 28px 0');
    rows += row(button(link, t.morningCta));
  } else {
    context = t.reminderContext;
    footerNote = t.footerReminder;
    rows += row(hello(t.hello(name)) + h1(t.reminderH1) + para(t.reminderBody), '28px 28px 0');
    const cells: { value: number; label: string; color?: string }[] = [];
    if (streak > 0) cells.push({ value: streak, label: t.statStreak(streak) });
    if (mastered > 0) cells.push({ value: mastered, label: t.statMastered(mastered) });
    if (due > 0) cells.push({ value: due, label: t.statReview, color: C.alert });
    if (cells.length) rows += row(scorecard(cells));
    if (p.courseName) {
      rows += row(well(`${eyebrow(t.yourCourse)}<div class="edl-ink" style="margin-top:6px;font-family:${FONT_DISPLAY};font-weight:800;font-size:20px;line-height:1.25;color:${C.ink};">${esc(p.courseName)}</div>`), '20px 28px 0');
    }
    rows += row(button(link, t.cta) + (due > 0 ? textLink(`${APP_URL}/revision`, t.reviewLink(due)) : ''));
    rows += peersRow;
  }

  const pre = (t.preheader as Record<string, (n: string | null) => string>)[
    variant === 'question' && !args.teaser?.question ? 'morning' : variant
  ];
  return emailDocument({
    lang,
    title: plainSubject(title),
    preheader: pre ? pre(name) : '',
    context,
    rows,
    footerNote,
    prefsLabel: t.prefs,
  });
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
  teaser?: ReminderTeaser | null;
}): Promise<{ sent: true } | { error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { error: NOT_CONFIGURED_ERROR };

  const payload = {
    from: process.env.UPDATES_EMAIL_FROM || DEFAULT_FROM,
    reply_to: REPLY_TO,
    to: args.to,
    subject: `${plainSubject(args.title)} — EdLight Academy`,
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
