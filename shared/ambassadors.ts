/**
 * ambassadors — the school ambassador programme, the rules in one place.
 *
 * An ambassador is a student the team designates for a school. They recruit
 * with their existing referral code; rewards (a data top-up, a Coursera
 * licence) are decided and handed over by a person, off-app. This module only
 * defines what the reports count, so web, mobile, the API and the docs agree.
 *
 * RETAINED RECRUIT (the number rewards are based on)
 * ──────────────────────────────────────────────────
 * A recruit is a DISTINCT account that redeemed the ambassador's referral
 * code (`referrals/{referrerUid}_{recruitUid}`, one per account, self-referral
 * refused by the server). A recruit is RETAINED when the server observed
 * learning activity on at least 3 distinct days (Haiti calendar,
 * America/Port-au-Prince) within the first 14 days after signup, the signup
 * day being day 1.
 *
 * "Server observed" means a day taken from Firestore's own write clock
 * (document createTime/updateTime metadata on the recruit's quiz attempts,
 * exam drafts and results, course progress, review schedule, mastery, streak
 * and XP profile), never from a date field a client wrote. The API scans that
 * metadata and keeps the union of days it has seen, so the count only grows
 * and is a conservative lower bound: a document updated twice shows only its
 * latest day. Signup time is the server createTime of `users/{uid}`.
 *
 * FRAUD FLAGS are for a human reviewer, never an automatic penalty: a school
 * computer room shares one address and a class may sign up together.
 *   - burst:      5 or more of one ambassador's recruits signed up within 10 minutes
 *   - shared_ip:  3 or more of one ambassador's recruits redeemed from the same
 *                 hashed address (salted SHA-256, raw addresses are never stored)
 */

export const AMBASSADOR_RULES = {
  retentionWindowDays: 14,
  retainedMinDays: 3,
  burstWindowMs: 10 * 60 * 1000,
  burstMinSignups: 5,
  sharedIpMin: 3,
  maxPerSchool: 2,
} as const;

const DAY_MS = 86_400_000;
const HAITI_TZ = 'America/Port-au-Prince';

/** YYYY-MM-DD in Haiti, whatever the server's own time zone. */
export function haitiDayKey(ms: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: HAITI_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Reward period: the Haiti calendar month of the recruit's signup, YYYY-MM. */
export function haitiPeriod(ms: number): string {
  return haitiDayKey(ms).slice(0, 7);
}
export const isPeriod = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

/** Whole days since 1970-01-01 for a YYYY-MM-DD key (calendar arithmetic, no time zone). */
export function dayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export interface RecruitRecord {
  /** The recruit's uid, or an `anon_` id once their account was deleted. */
  id: string;
  referrerUid: string;
  signupAt: number;
  /** Server-observed Haiti activity days, union of every scan. */
  days: string[];
  ipHash?: string | null;
  pseudonymized?: boolean;
}

export type RecruitState = 'retained' | 'pending' | 'not_retained';

/** Distinct active days inside the 14-day window that starts on the signup day. */
export function windowDays(r: Pick<RecruitRecord, 'signupAt' | 'days'>): number {
  const start = dayNumber(haitiDayKey(r.signupAt));
  const end = start + AMBASSADOR_RULES.retentionWindowDays - 1;
  return new Set((r.days || []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).filter((d) => {
    const n = dayNumber(d);
    return n >= start && n <= end;
  })).size;
}

/** The window is still open on the 14th Haiti day after signup (signup day = day 1). */
export function windowOpen(signupAt: number, now: number): boolean {
  return dayNumber(haitiDayKey(now)) < dayNumber(haitiDayKey(signupAt)) + AMBASSADOR_RULES.retentionWindowDays;
}

export function recruitState(r: Pick<RecruitRecord, 'signupAt' | 'days'>, now: number): RecruitState {
  if (windowDays(r) >= AMBASSADOR_RULES.retainedMinDays) return 'retained';
  return windowOpen(r.signupAt, now) ? 'pending' : 'not_retained';
}

/** Flags per recruit id. Only recruits of ONE ambassador should be passed in. */
export function fraudFlags(recruits: RecruitRecord[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const add = (id: string, flag: string) => { out[id] = [...new Set([...(out[id] || []), flag])]; };
  const sorted = [...recruits].sort((a, b) => a.signupAt - b.signupAt);
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].signupAt - sorted[i].signupAt <= AMBASSADOR_RULES.burstWindowMs) j++;
    if (j - i + 1 >= AMBASSADOR_RULES.burstMinSignups) for (let k = i; k <= j; k++) add(sorted[k].id, 'burst');
  }
  const byIp = new Map<string, string[]>();
  for (const r of recruits) if (r.ipHash) byIp.set(r.ipHash, [...(byIp.get(r.ipHash) || []), r.id]);
  for (const ids of byIp.values()) if (ids.length >= AMBASSADOR_RULES.sharedIpMin) ids.forEach((id) => add(id, 'shared_ip'));
  return out;
}

export interface RecruitSummary {
  recruits: number;
  retained: number;
  /** Retained and carrying no fraud flag: the number a reviewer starts from. */
  retainedUnflagged: number;
  pending: number;
  notRetained: number;
  flagged: number;
}

/** Summary over distinct recruits, optionally limited to one signup period (YYYY-MM). */
export function summarizeRecruits(all: RecruitRecord[], now: number, period?: string): RecruitSummary {
  const distinct = [...new Map(all.filter((r) => r.id !== r.referrerUid).map((r) => [r.id, r])).values()];
  const flags = fraudFlags(distinct);
  const rows = period ? distinct.filter((r) => haitiPeriod(r.signupAt) === period) : distinct;
  const out: RecruitSummary = { recruits: rows.length, retained: 0, retainedUnflagged: 0, pending: 0, notRetained: 0, flagged: 0 };
  for (const r of rows) {
    const state = recruitState(r, now);
    const flagged = (flags[r.id] || []).length > 0;
    if (flagged) out.flagged++;
    if (state === 'retained') { out.retained++; if (!flagged) out.retainedUnflagged++; }
    else if (state === 'pending') out.pending++;
    else out.notRetained++;
  }
  return out;
}

export interface AmbassadorReportRow extends RecruitSummary {
  uid: string;
  name: string;
  school: string;
  period: string;
  active: boolean;
  rewardDelivered: boolean;
  rewardNotes: string;
}

/** A cell a spreadsheet would run as a formula is prefixed so it stays text. */
function csvCell(value: unknown): string {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const REPORT_COLUMNS: Array<[keyof AmbassadorReportRow, string]> = [
  ['period', 'periode'], ['name', 'ambassadeur'], ['school', 'ecole'], ['active', 'actif'],
  ['recruits', 'recrues'], ['retained', 'retenues'], ['retainedUnflagged', 'retenues_sans_signalement'],
  ['pending', 'en_cours'], ['notRetained', 'non_retenues'], ['flagged', 'signalees'],
  ['rewardDelivered', 'recompense_remise'], ['rewardNotes', 'notes'], ['uid', 'uid'],
];

export function reportCsv(rows: AmbassadorReportRow[]): string {
  const header = REPORT_COLUMNS.map(([, label]) => label).join(',');
  const body = rows.map((r) => REPORT_COLUMNS.map(([key]) => {
    const v = r[key];
    return csvCell(typeof v === 'boolean' ? (v ? 'oui' : 'non') : v);
  }).join(','));
  return [header, ...body].join('\n') + '\n';
}

export class AmbassadorError extends Error { constructor(public code: string) { super(code); } }

export const AMBASSADOR_ERRORS: Record<string, [string, string]> = {
  forbidden: ['Réservé aux ambassadeurs désignés.', 'Se pou anbasadè yo deziyen sèlman.'],
  not_found: ['Compte introuvable.', 'Nou pa jwenn kont lan.'],
  school_full: ['Cette école a déjà 2 ambassadeurs actifs.', 'Lekòl sa a gen 2 anbasadè aktif deja.'],
  invalid_input: ['Vérifie les champs.', 'Verifye enfòmasyon yo.'],
  unauthorized: ['Connecte-toi pour continuer.', 'Konekte pou kontinye.'],
  rate_limit: ['Trop de demandes. Réessaie plus tard.', 'Twòp demann. Eseye pita.'],
};
export function ambassadorErrorMessage(error: unknown, language: string): string {
  const code = error instanceof AmbassadorError ? error.code : '';
  return (AMBASSADOR_ERRORS[code] || ['Connexion impossible. Réessaie.', 'Koneksyon an pa mache. Eseye ankò.'])[language === 'ht' ? 1 : 0];
}

export interface AmbassadorDashboard {
  school: string;
  code: string | null;
  link: string | null;
  period: string;
  total: RecruitSummary;
  thisPeriod: RecruitSummary;
  schoolProgress: { week: SchoolStanding | null; allTime: SchoolStanding | null };
}
export interface SchoolStanding { rank: number; totalXp: number; members: number; of: number }

export function createAmbassadorClient(base: string, token: () => Promise<string | null>) {
  return async <T = any>(action: string, values: Record<string, unknown> = {}): Promise<T> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const idToken = await token();
      if (!idToken) throw new AmbassadorError('unauthorized');
      let res: Response;
      try {
        res = await fetch(`${base}/api/ambassadors`, {
          method: 'POST', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ ...values, action }),
        });
      } catch { throw new AmbassadorError('unavailable'); }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new AmbassadorError(data?.error || 'unavailable');
      return data as T;
    } finally { clearTimeout(timer); }
  };
}

/** Public, CDN-cached list of ambassador uids for the badge (uids are already public on the boards). */
export async function fetchAmbassadorUids(base: string): Promise<string[]> {
  const res = await fetch(`${base}/api/ambassadors?view=directory`);
  if (!res.ok) throw new Error(`directory ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.uids) ? data.uids.filter((u: unknown) => typeof u === 'string') : [];
}

export const AMBASSADOR_LABEL = { fr: 'Ambassadeur', ht: 'Anbasadè' };
