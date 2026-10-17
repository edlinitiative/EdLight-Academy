/**
 * api/_lib/planEmail.ts — study-plan email for Sandra's `email_study_plan` tool.
 * ---------------------------------------------------------------------------
 * Two exports:
 *
 *   • buildPlanEmailHtml(plan, lang) — pure, branded HTML: EdLight header,
 *     plan title, tasks grouped by subject with their SRS dates, and a link
 *     to https://academy.edlight.org/study-plan. French by default, Haitian
 *     Creole when lang === 'ht'.
 *   • sendPlanEmail({ to, plan, lang }) — thin Resend REST wrapper (POST
 *     https://api.resend.com/emails) attaching the plan as a base64 .ics.
 *     Returns `{ sent: true }` or `{ error: <short French message> }` —
 *     never throws; provider details are logged server-side only.
 *
 * The .ics attachment comes from the SAME pure builder the /study-plan
 * download button uses — imported across the api/src boundary (tsc follows
 * imports regardless of api/tsconfig's `include`, and Vercel's @vercel/node
 * file tracing bundles relative imports from src/ into the function).
 */

import { buildPlanIcs, type PlanIcsInput, type PlanIcsTask } from '../../src/utils/planIcs';
import { C, FONT_BODY, FONT_DISPLAY, button, emailDocument, eyebrow, h1, hello, para, row, small } from './emailShell';

export type PlanEmailLang = 'fr' | 'ht';

/** Same doc-derived shape the ICS builder consumes: { title, tasks, dailyTargetMinutes }. */
export type PlanEmailInput = PlanIcsInput;

const PLAN_URL = 'https://academy.edlight.org/study-plan';
const RESEND_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'Sandra · EdLight Academy <sandra@edlight.org>';
const ICS_FILENAME = 'plan-etude-edlight.ics';

const NOT_CONFIGURED_ERROR = "l'envoi d'email n'est pas encore configuré";
const SEND_FAILED_ERROR = "l'email n'a pas pu être envoyé — réessaie un peu plus tard";

// ─── Localized strings ───────────────────────────────────────────────────────

interface Strings {
  subject: (title: string) => string;
  hello: string;
  intro: string;
  sessions: (n: number) => string;
  minutesUnit: string;
  dailyLabel: string;
  preheader: (title: string) => string;
  daily: (minutes: number) => string;
  unscheduled: string;
  cta: string;
  icsNote: string;
  footer: string;
  fallbackTaskTitle: string;
}

const STRINGS: Record<PlanEmailLang, Strings> = {
  fr: {
    subject: (title) => `${title} — ton plan d'étude EdLight Academy`,
    hello: 'Ton plan d’étude',
    intro: 'Préparé avec Sandra, à partir de tes cours et de tes examens.',
    sessions: (n) => (n > 1 ? 'séances prévues' : 'séance prévue'),
    minutesUnit: 'min',
    dailyLabel: 'par jour',
    preheader: (title) => `${title} — tes prochaines séances, jour par jour.`,
    daily: (minutes) => `Objectif : ${minutes} minutes par jour`,
    unscheduled: 'À planifier',
    cta: "Voir mon plan d'étude",
    icsNote:
      'La pièce jointe (.ics) ajoute chaque séance de révision à ton calendrier (Google Calendar, Outlook…).',
    footer: "Envoyé par Sandra, l'assistante pédagogique d'EdLight Academy.",
    fallbackTaskTitle: 'Révision',
  },
  ht: {
    subject: (title) => `${title} — plan etid EdLight Academy ou`,
    hello: 'Plan etid ou',
    intro: 'Sandra prepare l avè ou, apati kou ak egzamen ou yo.',
    sessions: () => 'seyans pwograme',
    minutesUnit: 'min',
    dailyLabel: 'chak jou',
    preheader: (title) => `${title} — pwochen seyans ou yo, jou pa jou.`,
    daily: (minutes) => `Objektif : ${minutes} minit chak jou`,
    unscheduled: 'Pou planifye',
    cta: 'Gade plan etid mwen',
    icsNote:
      'Fichye (.ics) ki nan atachman an ajoute chak seyans revizyon nan kalandriye ou (Google Calendar, Outlook…).',
    footer: 'Se Sandra, asistan pedagojik EdLight Academy, ki voye mesaj sa a.',
    fallbackTaskTitle: 'Revizyon',
  },
};

// ─── HTML builder ────────────────────────────────────────────────────────────

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** "ven. 18 oct." — a weekday reads faster than dd/mm/yyyy on a phone. */
function formatDate(ms: number, lang: PlanEmailLang): string {
  try {
    return new Intl.DateTimeFormat(lang === 'ht' ? 'fr-HT' : 'fr-FR', {
      weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/Port-au-Prince',
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

/** Best display title for a task — same fallback chain as planIcs.taskTitle.
 *  Official exam titles are ministry-length ("BACCALAURÉAT … RÉPUBLIQUE …");
 *  when we know the subject + year, a short human label reads far better. */
function taskTitle(task: PlanIcsTask, fallback: string): string {
  if (task.examTitle && task.subject && task.year) return `Examen ${task.subject} ${task.year}`;
  const raw = task.examTitle || task.unitTitle || task.videoTitle || task.examId || task.taskId || fallback;
  return raw.length > 60 ? `${raw.slice(0, 57)}…` : raw;
}

/**
 * The plan as dated rows grouped by subject, on the shared email shell.
 * Pure function; safe to unit-test.
 */
export function buildPlanEmailHtml(plan: PlanEmailInput, lang: PlanEmailLang): string {
  const t = STRINGS[lang] || STRINGS.fr;
  const title = plan.title || "Plan d'étude EdLight";

  // Group tasks by subject, preserving first-seen subject order; dated tasks
  // first within a subject, soonest first.
  const groups = new Map<string, PlanIcsTask[]>();
  let count = 0;
  for (const task of plan.tasks || []) {
    if (!task) continue;
    count += 1;
    const subject = task.subject || '—';
    const list = groups.get(subject) || [];
    list.push(task);
    groups.set(subject, list);
  }

  const taskRow = (task: PlanIcsTask, first: boolean) => {
    const when = task.nextReviewMs ? formatDate(task.nextReviewMs, lang) : t.unscheduled;
    return `<tr>
      <td valign="top" class="edl-rule" style="padding:12px 12px 12px 0;width:96px;${first ? '' : `border-top:1px solid ${C.border};`}">
        <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${task.nextReviewMs ? '#E6EEFB' : C.well};color:${task.nextReviewMs ? C.action : C.muted};font-family:${FONT_BODY};font-size:13px;font-weight:700;white-space:nowrap;">${escapeHtml(when)}</span>
      </td>
      <td valign="top" class="edl-ink edl-rule" style="padding:13px 0;${first ? '' : `border-top:1px solid ${C.border};`}font-family:${FONT_BODY};font-size:16px;line-height:1.4;font-weight:600;color:${C.ink};">${escapeHtml(taskTitle(task, t.fallbackTaskTitle))}</td>
    </tr>`;
  };

  const groupsHtml = [...groups.entries()]
    .map(([subject, tasks]) => {
      const sorted = [...tasks].sort((x, y) => (x.nextReviewMs || Infinity) - (y.nextReviewMs || Infinity));
      return row(
        `${eyebrow(escapeHtml(subject))}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;">${sorted.map((task, i) => taskRow(task, i === 0)).join('')}</table>`,
        '22px 28px 0',
      );
    })
    .join('');

  const figures: string[] = [];
  if (plan.dailyTargetMinutes) {
    figures.push(`<td width="50%" align="center" class="edl-rule" style="padding:14px 8px;">
      <div class="edl-ink" style="font-family:${FONT_DISPLAY};font-weight:800;font-size:26px;line-height:1;color:${C.ink};">${escapeHtml(String(plan.dailyTargetMinutes))} ${t.minutesUnit}</div>
      <div class="edl-muted" style="margin-top:6px;font-family:${FONT_BODY};font-size:13px;color:${C.muted};">${t.dailyLabel}</div></td>`);
  }
  if (count > 0) {
    figures.push(`<td width="50%" align="center" class="edl-rule" style="padding:14px 8px;${figures.length ? `border-left:1px solid ${C.border};` : ''}">
      <div class="edl-ink" style="font-family:${FONT_DISPLAY};font-weight:800;font-size:26px;line-height:1;color:${C.ink};">${count}</div>
      <div class="edl-muted" style="margin-top:6px;font-family:${FONT_BODY};font-size:13px;color:${C.muted};">${t.sessions(count)}</div></td>`);
  }
  const figuresRow = figures.length
    ? row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="edl-rule" style="border:1px solid ${C.border};border-radius:16px;border-collapse:separate;"><tr>${figures.join('')}</tr></table>`, '22px 28px 0')
    : '';

  return emailDocument({
    lang,
    title,
    preheader: t.preheader(title),
    context: 'Sandra',
    rows:
      row(hello(t.hello) + h1(escapeHtml(title)) + para(escapeHtml(t.intro)), '28px 28px 0')
      + figuresRow
      + groupsHtml
      + row(button(PLAN_URL, escapeHtml(t.cta)) + small(escapeHtml(t.icsNote), 14, 'center')),
    footerNote: escapeHtml(t.footer),
  });
}

// ─── Resend sender ───────────────────────────────────────────────────────────

export async function sendPlanEmail(args: {
  to: string;
  plan: PlanEmailInput;
  lang: PlanEmailLang;
}): Promise<{ sent: true } | { error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { error: NOT_CONFIGURED_ERROR };

  const { to, plan, lang } = args;
  const t = STRINGS[lang] || STRINGS.fr;
  const ics = buildPlanIcs(plan);

  const payload = {
    from: process.env.EMAIL_FROM || DEFAULT_FROM,
    to,
    subject: t.subject(plan.title || "Plan d'étude"),
    html: buildPlanEmailHtml(plan, lang),
    attachments: [
      { filename: ICS_FILENAME, content: Buffer.from(ics, 'utf8').toString('base64') },
    ],
  };

  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`[planEmail] Resend ${res.status}: ${detail.slice(0, 300)}`);
      return { error: SEND_FAILED_ERROR };
    }
    return { sent: true };
  } catch (err) {
    console.error('[planEmail] Resend request failed:', err);
    return { error: SEND_FAILED_ERROR };
  }
}
