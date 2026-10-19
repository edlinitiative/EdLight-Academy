/**
 * progressShare — a student-shared, read-only progress record for a parent.
 *
 * The student creates a link, sends it (WhatsApp, SMS), and can revoke it at
 * any time. There is no parent account. The server stores only a SHA-256 hash
 * of the token (`progressShares/{tokenHash}`), so a leaked database row cannot
 * be turned back into a working link, and the public endpoint returns only the
 * fields named in `PublicProgress` below.
 *
 * WHAT THE PARENT SEES (scope `progress-v1`): the student's first name only
 * (the public alias rule in shared/alias.ts), their class, per-course lesson
 * progress and mastery, recent exam percentages (never answers), streak, XP
 * and the last activity day. Never: full name, email, school, city, uid,
 * answers, Sandra transcripts, quiz accuracy or anything a class teacher sees.
 *
 * Shared by web, mobile and the API. Keep it pure.
 */
import type { MasterySummary } from './mastery';

export const SHARE_SCOPE = 'progress-v1';
export const SHARE_DURATIONS = [7, 30, 90] as const;
export type ShareDuration = (typeof SHARE_DURATIONS)[number];
export const DEFAULT_SHARE_DAYS: ShareDuration = 90;
/** Active links per student. Revoked and expired links do not count. */
export const MAX_ACTIVE_SHARES = 5;
/** Exams listed on the public page, most recent first. */
export const PUBLIC_EXAM_LIMIT = 5;
const DAY_MS = 86_400_000;

/** Stored server-side at `progressShares/{tokenHash}`. Never readable by clients. */
export interface ShareRecord {
  uid: string;
  createdAt: number;
  expiresAt: number;
  revokedAt: number | null;
  scope: typeof SHARE_SCOPE;
  lastViewedAt: number | null;
  views: number;
}

/** What the owner sees in their list. `id` is the token hash, which cannot open the page. */
export interface ShareListItem {
  id: string;
  createdAt: number;
  expiresAt: number;
  lastViewedAt: number | null;
  views: number;
}

export type ShareStatus = 'active' | 'revoked' | 'expired';

export function shareStatus(record: Pick<ShareRecord, 'expiresAt' | 'revokedAt'>, now: number): ShareStatus {
  if (record.revokedAt) return 'revoked';
  if (!(record.expiresAt > now)) return 'expired';
  return 'active';
}

/** Coerce a client-supplied duration to one of the allowed choices. */
export function shareDays(raw: unknown): ShareDuration {
  const n = Number(raw);
  return (SHARE_DURATIONS as readonly number[]).includes(n) ? (n as ShareDuration) : DEFAULT_SHARE_DAYS;
}

export function shareExpiry(now: number, days: ShareDuration): number {
  return now + days * DAY_MS;
}

/** 24 random bytes in base64url: 32 characters, 192 bits. */
export const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;
export function isShareToken(raw: unknown): raw is string {
  return typeof raw === 'string' && SHARE_TOKEN_PATTERN.test(raw);
}

export const SHARE_ORIGIN = 'https://academy.edlight.org';
export function shareLink(token: string, origin = SHARE_ORIGIN): string {
  return `${origin}/suivi/${token}`;
}

/** One short sentence and the link. No emoji, no em-dash. */
export function shareMessage(link: string, lang: 'fr' | 'ht'): string {
  return lang === 'ht'
    ? `Men swivi pwogrè mwen sou EdLight Academy : ${link}`
    : `Voici le suivi de mes progrès sur EdLight Academy : ${link}`;
}

/** The one privacy line shown wherever a link is created. */
export const SHARE_PRIVACY = {
  fr: 'Toute personne qui a le lien voit ton prénom, ta classe, tes progrès, tes scores d’examen et ta série, jamais tes réponses. Tu peux le désactiver à tout moment.',
  ht: 'Nenpòt moun ki gen lyen an wè premye non ou, klas ou, pwogrè ou, nòt egzamen ou ak seri ou, men li pa janm wè repons ou. Ou ka dezaktive l nenpòt lè.',
};

export interface PublicUnit {
  unitId: string;
  title: string;
  mastery: MasterySummary;
}
export interface PublicCourse {
  courseId: string;
  name: string;
  lessonsCompleted: number;
  lessonTotal: number;
  mastery: MasterySummary;
  units: PublicUnit[];
}
export interface PublicExam {
  title: string;
  subject: string;
  year: string;
  level: string;
  percentage: number;
  submittedAtMs: number | null;
}
/** The ENTIRE public response. Anything not named here never leaves the server. */
export interface PublicProgress {
  scope: typeof SHARE_SCOPE;
  firstName: string | null;
  grade: string | null;
  generatedAt: number;
  expiresAt: number;
  lastActivityDay: string | null;
  streak: { current: number; best: number };
  xp: number | null;
  lessonsDone: number;
  courses: PublicCourse[];
  exams: PublicExam[];
}

export type PublicShareResponse =
  | { status: 'ok'; progress: PublicProgress }
  | { status: 'revoked' | 'expired' | 'not_found' };

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, max = 120) => (typeof v === 'string' ? v.slice(0, max) : '');
function summary(m: any): MasterySummary {
  const counts = m?.counts || {};
  return {
    points: num(m?.points), level: m?.level || 'none', total: num(m?.total), mastered: num(m?.mastered), started: num(m?.started),
    counts: { none: num(counts.none), seen: num(counts.seen), familiar: num(counts.familiar), proficient: num(counts.proficient), mastered: num(counts.mastered) },
  };
}

/**
 * The scope filter. Rebuilds the response field by field from whatever the
 * loader gathered, so an extra property on an input object (an email, a
 * school, an answers map) is dropped rather than passed through.
 */
export function toPublicProgress(input: {
  firstName: string | null; grade: string | null; generatedAt: number; expiresAt: number;
  lastActivityDay: string | null; streak: { current: unknown; best: unknown }; xp: unknown;
  lessonsDone: unknown; courses: any[]; exams: any[];
}): PublicProgress {
  const day = typeof input.lastActivityDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.lastActivityDay) ? input.lastActivityDay : null;
  return {
    scope: SHARE_SCOPE,
    firstName: input.firstName ? str(input.firstName, 24) : null,
    grade: input.grade ? str(input.grade, 12) : null,
    generatedAt: num(input.generatedAt),
    expiresAt: num(input.expiresAt),
    lastActivityDay: day,
    streak: { current: Math.max(0, num(input.streak?.current)), best: Math.max(0, num(input.streak?.best)) },
    xp: typeof input.xp === 'number' && Number.isFinite(input.xp) ? Math.max(0, Math.round(input.xp)) : null,
    lessonsDone: Math.max(0, num(input.lessonsDone)),
    courses: (input.courses || []).slice(0, 40).map((c) => ({
      courseId: str(c?.courseId, 80), name: str(c?.name), lessonsCompleted: num(c?.lessonsCompleted), lessonTotal: num(c?.lessonTotal),
      mastery: summary(c?.mastery),
      units: (Array.isArray(c?.units) ? c.units : []).slice(0, 60).map((u: any) => ({ unitId: str(u?.unitId, 80), title: str(u?.title), mastery: summary(u?.mastery) })),
    })),
    exams: (input.exams || []).slice(0, PUBLIC_EXAM_LIMIT).map((e) => ({
      title: str(e?.title), subject: str(e?.subject, 60), year: str(String(e?.year ?? ''), 10), level: str(e?.level, 30),
      percentage: Math.max(0, Math.min(100, Math.round(num(e?.percentage)))),
      submittedAtMs: typeof e?.submittedAtMs === 'number' ? e.submittedAtMs : null,
    })),
  };
}

export class ShareError extends Error { constructor(public code: string) { super(code); } }

export const SHARE_ERRORS: Record<string, [string, string]> = {
  limit: ['Tu as déjà 5 liens actifs. Désactive un lien avant d’en créer un autre.', 'Ou gen 5 lyen ki aktif deja. Dezaktive youn anvan ou kreye yon lòt.'],
  not_found: ['Lien introuvable.', 'Nou pa jwenn lyen an.'],
  unauthorized: ['Connecte-toi pour partager ton suivi.', 'Konekte pou pataje swivi ou.'],
  rate_limit: ['Trop de demandes. Réessaie plus tard.', 'Twòp demann. Eseye pita.'],
  invalid_input: ['Demande invalide.', 'Demann lan pa valab.'],
};
export function shareErrorMessage(error: unknown, language: string): string {
  const code = error instanceof ShareError ? error.code : '';
  return (SHARE_ERRORS[code] || ['Connexion impossible. Réessaie.', 'Koneksyon an pa mache. Eseye ankò.'])[language === 'ht' ? 1 : 0];
}

/**
 * Authenticated client for the owner's controls (create, list, revoke). Both
 * platforms inject their own token getter and telemetry.
 */
export function createProgressShareClient(base: string, token: () => Promise<string | null>, track?: (name: string, detail: Record<string, unknown>) => void) {
  return async <T = any>(action: 'create' | 'list' | 'revoke', values: Record<string, unknown> = {}): Promise<T> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const idToken = await token();
      if (!idToken) throw new ShareError('unauthorized');
      let res: Response;
      try {
        res = await fetch(`${base}/api/progress-share`, {
          method: 'POST', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ ...values, action }),
        });
      } catch { throw new ShareError('unavailable'); }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new ShareError(data?.error || 'unavailable');
      try {
        if (action === 'create') track?.('releve_link_created', { scope: 'progress', target: `d${values.days ?? DEFAULT_SHARE_DAYS}` });
        if (action === 'revoke') track?.('releve_link_revoked', { scope: 'progress' });
      } catch { /* telemetry is best effort */ }
      return data as T;
    } finally { clearTimeout(timer); }
  };
}

/** Days remaining, rounded up; 0 when expired. */
export function daysLeft(expiresAt: number, now: number): number {
  return Math.max(0, Math.ceil((expiresAt - now) / DAY_MS));
}
