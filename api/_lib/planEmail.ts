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
  intro: string;
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
    intro: "Voici ton plan d'étude personnalisé, préparé avec Sandra.",
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
    intro: 'Men plan etid pèsonalize ou, Sandra prepare li avè ou.',
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

/** dd/mm/yyyy in local time — matches how the app formats plan dates. */
function formatDate(ms: number): string {
  const d = new Date(ms);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getFullYear()}`;
}

/** Best display title for a task — same fallback chain as planIcs.taskTitle. */
function taskTitle(task: PlanIcsTask, fallback: string): string {
  return task.examTitle || task.unitTitle || task.videoTitle || task.examId || task.taskId || fallback;
}

/**
 * Render the plan as simple branded HTML (inline styles only — email clients
 * ignore <style> blocks). Pure function; safe to unit-test byte-for-byte.
 */
export function buildPlanEmailHtml(plan: PlanEmailInput, lang: PlanEmailLang): string {
  const t = STRINGS[lang] || STRINGS.fr;
  const title = plan.title || "Plan d'étude EdLight";

  // Group tasks by subject, preserving first-seen subject order.
  const groups = new Map<string, PlanIcsTask[]>();
  for (const task of plan.tasks || []) {
    if (!task) continue;
    const subject = task.subject || '—';
    const list = groups.get(subject) || [];
    list.push(task);
    groups.set(subject, list);
  }

  const groupsHtml = [...groups.entries()]
    .map(([subject, tasks]) => {
      const items = tasks
        .map((task) => {
          const when = task.nextReviewMs ? formatDate(task.nextReviewMs) : t.unscheduled;
          return `<li style="margin:4px 0;">${escapeHtml(taskTitle(task, t.fallbackTaskTitle))} — <span style="color:#5B6472;">${escapeHtml(when)}</span></li>`;
        })
        .join('');
      return [
        `<h3 style="margin:20px 0 6px;font-size:16px;color:#1B6FE0;">${escapeHtml(subject)}</h3>`,
        `<ul style="margin:0;padding-left:20px;color:#1F2733;">${items}</ul>`,
      ].join('');
    })
    .join('');

  const dailyHtml = plan.dailyTargetMinutes
    ? `<p style="margin:8px 0 0;color:#5B6472;">${escapeHtml(t.daily(plan.dailyTargetMinutes))}</p>`
    : '';

  return [
    `<div style="max-width:560px;margin:0 auto;font-family:'Plus Jakarta Sans',Arial,sans-serif;background:#FFFFFF;color:#1F2733;">`,
    `<div style="background:#1B6FE0;padding:20px 24px;border-radius:12px 12px 0 0;">`,
    `<span style="color:#FFFFFF;font-size:18px;font-weight:700;">EdLight Academy</span>`,
    `</div>`,
    `<div style="padding:24px;border:1px solid #E3E8F0;border-top:none;border-radius:0 0 12px 12px;">`,
    `<h2 style="margin:0;font-size:20px;">${escapeHtml(title)}</h2>`,
    dailyHtml,
    `<p style="margin:16px 0 0;">${escapeHtml(t.intro)}</p>`,
    groupsHtml,
    `<p style="margin:24px 0 0;"><a href="${PLAN_URL}" style="display:inline-block;background:#1B6FE0;color:#FFFFFF;text-decoration:none;padding:10px 20px;border-radius:999px;font-weight:600;">${escapeHtml(t.cta)}</a></p>`,
    `<p style="margin:16px 0 0;font-size:13px;color:#5B6472;">${escapeHtml(t.icsNote)}</p>`,
    `<p style="margin:20px 0 0;font-size:12px;color:#8A93A3;">${escapeHtml(t.footer)}</p>`,
    `</div>`,
    `</div>`,
  ]
    .filter(Boolean)
    .join('\n');
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
