/**
 * planIcs — pure iCalendar (.ics) builder for study plans.
 * ────────────────────────────────────────────────────────
 * Converts a study plan (users/{uid}/studyPlans/{planId} doc shape, see
 * src/services/studyPlanService.ts) into an RFC 5545 VCALENDAR string:
 * one all-day VEVENT per task that has an SRS schedule date.
 *
 * The real scheduling field on tasks is `nextReviewMs` (ms epoch, midnight
 * local — set by buildTasksFromExams / computeSRS). Tasks without it are
 * skipped.
 */

export interface PlanIcsTask {
  type?: string;
  examId?: string;
  taskId?: string;
  subject?: string;
  year?: string;
  examTitle?: string;
  unitTitle?: string;
  videoTitle?: string;
  /** SRS schedule date (ms epoch, midnight local). Undated tasks are skipped. */
  nextReviewMs?: number | null;
}

export interface PlanIcsInput {
  title?: string;
  tasks?: PlanIcsTask[];
  dailyTargetMinutes?: number;
}

const CRLF = '\r\n';
const MAX_LINE_OCTETS = 75;

/** Escape text values per RFC 5545 §3.3.11 (backslash, semicolon, comma, newline). */
function escapeIcsText(value: string): string {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Format an ms epoch as a local YYYYMMDD date. */
function formatDateLocal(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/** UTF-8 byte length of a string (no TextEncoder — works in jsdom + browser). */
function utf8Octets(s: string): number {
  let n = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    n += cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4;
  }
  return n;
}

/**
 * Fold a content line at 75 octets (UTF-8), continuation lines prefixed with
 * a single space, per RFC 5545 §3.1. Never splits inside a code point.
 */
function foldLine(line: string): string {
  if (utf8Octets(line) <= MAX_LINE_OCTETS) return line;

  const out: string[] = [];
  let current = '';
  let currentOctets = 0;
  // First line has no leading space (budget 75); continuations lose 1 octet.
  let budget = MAX_LINE_OCTETS;

  for (const ch of line) {
    const chOctets = utf8Octets(ch);
    if (currentOctets + chOctets > budget) {
      out.push(current);
      current = ' ';
      currentOctets = 1;
      budget = MAX_LINE_OCTETS;
    }
    current += ch;
    currentOctets += chOctets;
  }
  if (current) out.push(current);
  return out.join(CRLF);
}

/** Sanitize an id for use inside a UID (RFC-safe, no spaces/colons). */
function uidSafe(id: string): string {
  return id.replace(/[^A-Za-z0-9._-]/g, '-');
}

/** Best display title for a task, mirroring StudyPlan.tsx fallbacks. Prefers
 *  a short "Examen {subject} {year}" over ministry-length official titles. */
function taskTitle(task: PlanIcsTask): string {
  if (task.examTitle && task.subject && task.year) return `Examen ${task.subject} ${task.year}`;
  const raw = task.examTitle || task.unitTitle || task.videoTitle || task.examId || task.taskId || 'Révision';
  return raw.length > 60 ? `${raw.slice(0, 57)}…` : raw;
}

/**
 * Build a valid VCALENDAR string for the plan's dated tasks.
 * Returns a calendar with zero VEVENTs when no task is dated.
 */
export function buildPlanIcs(plan: PlanIcsInput): string {
  const planTitle = plan.title || "Plan d'étude EdLight";
  const origin =
    (typeof window !== 'undefined' && window.location && window.location.origin) || '';
  const planUrl = `${origin}/study-plan`;

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EdLight Academy//Plan d\'etude//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(planTitle)}`,
  ];

  const tasks = plan.tasks || [];
  tasks.forEach((task, index) => {
    if (!task || !task.nextReviewMs) return; // skip undated tasks

    const dateStr = formatDateLocal(task.nextReviewMs);
    const nextDayStr = formatDateLocal(task.nextReviewMs + 86_400_000);
    const key = task.examId || task.taskId || `task-${index}`;
    const uid = `edlight-plan-${uidSafe(key)}@edlight-academy`;

    const subject = task.subject || '';
    const title = taskTitle(task);
    const summary = subject ? `EdLight · ${subject}: ${title}` : `EdLight · ${title}`;

    const descriptionParts = [planTitle];
    if (plan.dailyTargetMinutes) descriptionParts.push(`${plan.dailyTargetMinutes} min/jour`);
    const description = `${descriptionParts.join(' — ')}\n${planUrl}`;

    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      // Deterministic stamp derived from the schedule date → stable output.
      `DTSTAMP:${dateStr}T000000Z`,
      `DTSTART;VALUE=DATE:${dateStr}`,
      `DTEND;VALUE=DATE:${nextDayStr}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      `URL:${planUrl}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  });

  lines.push('END:VCALENDAR');

  return lines.map(foldLine).join(CRLF) + CRLF;
}
