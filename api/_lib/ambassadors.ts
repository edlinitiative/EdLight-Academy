/**
 * Server half of the school ambassador programme (rules: shared/ambassadors.ts).
 *
 * Data model (all server-only; firestore.rules denies every client):
 *   ambassadors/{uid}            { uid, name, school, schoolKey, active, designatedAt, designatedBy, revokedAt, revokedBy,
 *                                  source, applicationId, reviewerName }
 *   ambassadorRecruits/{id}      { referrerUid, recruitUid, signupAt, redeemedAt, days[], scannedAt, final, ipHash, pseudonymized }
 *                                id = the recruit's uid, or `anon_…` after that account was deleted
 *   ambassadorRewards/{uid}_{YYYY-MM}  { uid, period, delivered, notes, updatedAt, updatedBy }
 *   ambassadorAudit/{at}_{rand}  { action: designate|revoke, uid, school, by, at, source: admin|edlight-apply, applicationId, reviewerName }
 *   ambassadorApplications/{applicationId}_{approve|revoke}  idempotency ledger for EdLight Apply decisions
 *
 * Recruits come from the existing referral system (`referrals/*`, written only
 * by /api/referrals/redeem). Retention is computed here from server write
 * metadata and is never accepted from a client. Rewards are a manual record:
 * nothing in this file pays anyone.
 */
import { randomBytes } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AMBASSADOR_RULES, AmbassadorError, haitiDayKey, haitiPeriod, isPeriod, recruitState, summarizeRecruits, windowOpen, dayNumber,
  fraudFlags, type AmbassadorDashboard, type AmbassadorReportRow, type RecruitRecord, type SchoolStanding,
} from '../../shared/ambassadors';
import { normalizeName } from '../../shared/leaderboardAgg';
import { defaultAlias } from '../../shared/alias';
import { ensureReferralCode, referralLink } from './referrals';

export const SCAN_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Bounds latency and Firestore reads per request; the rest are scanned on the next open. */
export const SCANS_PER_REQUEST = 40;
const SCAN_LIMIT = 100;
const ACTIVITY_COLLECTIONS = ['quizAttempts', 'examAttempts', 'examResults', 'progress', 'reviewState'];
const ACTIVITY_DOCS = ['streaks/global', 'gamification/profile', 'mastery/lessons'];

type AmbassadorDoc = {
  uid: string; name: string; school: string; schoolKey: string; active: boolean; designatedAt: number; designatedBy: string;
  revokedAt?: number | null; revokedBy?: string | null;
  /** Where the latest designation came from: the Academy admin console, or an approved EdLight Apply application. */
  source?: DesignationSource; applicationId?: string | null; reviewerName?: string | null;
};

export type DesignationSource = 'admin' | 'edlight-apply';
/**
 * Provenance of a designation or revocation. `ledgerId` makes the change
 * idempotent: the ledger doc `ambassadorApplications/{ledgerId}` is read and
 * written in the SAME transaction as the designation, so a retried webhook
 * replays the stored outcome instead of designating twice.
 */
export interface DesignationMeta {
  source: DesignationSource;
  applicationId?: string | null;
  reviewerName?: string | null;
  ledgerId?: string;
}
export type DesignationResult = { ok: true; uid: string; replayed?: boolean };
const ADMIN_META: DesignationMeta = { source: 'admin' };
const auditId = (now: number) => `${now}_${randomBytes(6).toString('hex')}`;
type StoredRecruit = { referrerUid: string; recruitUid: string | null; signupAt: number; redeemedAt: number; days: string[]; scannedAt: number; final: boolean; ipHash: string | null; pseudonymized: boolean };

const uidOf = (v: unknown): string => {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(v)) throw new AmbassadorError('invalid_input');
  return v;
};
const anonId = () => `anon_${randomBytes(12).toString('hex')}`;
const ms = (t: any): number | null => (t && typeof t.toMillis === 'function' ? t.toMillis() : typeof t === 'number' ? t : null);

/** ISO week id (same as leaderboardService / aggregate-snapshot). */
function weekId(now: number): string {
  const date = new Date(now);
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export async function isActiveAmbassador(db: Firestore, uid: string): Promise<AmbassadorDoc | null> {
  const snap = await db.doc(`ambassadors/${uid}`).get();
  const data = snap.data() as AmbassadorDoc | undefined;
  return data?.active === true ? data : null;
}

/**
 * Designate (or re-activate) one student for one school. At most 2 active per school.
 * Called by the admin console (`meta.source === 'admin'`) and by the EdLight Apply
 * webhook (`'edlight-apply'`, see ambassadorApplications.ts). Every change leaves an
 * `ambassadorAudit/*` record. An Apply designation refuses a student who is already
 * an active ambassador (`already_ambassador`), unless it is a replay of itself.
 */
export async function designateAmbassador(db: Firestore, adminUid: string, rawUid: unknown, rawSchool: unknown, now: number, meta: DesignationMeta = ADMIN_META): Promise<DesignationResult> {
  const uid = uidOf(rawUid);
  const school = typeof rawSchool === 'string' ? rawSchool.trim().slice(0, 120) : '';
  if (school.length < 2) throw new AmbassadorError('invalid_input');
  const schoolKey = normalizeName(school);
  const user = await db.doc(`users/${uid}`).get();
  if (!user.exists) throw new AmbassadorError('not_found');
  const name = defaultAlias(user.data()?.full_name || user.data()?.name || '') || '';
  return db.runTransaction(async (tx) => {
    const ledgerRef = meta.ledgerId ? db.doc(`ambassadorApplications/${meta.ledgerId}`) : null;
    const ledger = ledgerRef ? await tx.get(ledgerRef) : null;
    if (ledger?.exists) return { ok: true as const, uid: String(ledger.data()?.uid || uid), replayed: true };
    const peers = await tx.get(db.collection('ambassadors').where('schoolKey', '==', schoolKey).where('active', '==', true).limit(10));
    const ref = db.doc(`ambassadors/${uid}`);
    const prev = await tx.get(ref);
    if (meta.source !== 'admin' && prev.data()?.active === true) throw new AmbassadorError('already_ambassador');
    if (peers.docs.filter((d) => d.id !== uid).length >= AMBASSADOR_RULES.maxPerSchool) throw new AmbassadorError('school_full');
    const record: AmbassadorDoc = { uid, name, school, schoolKey, active: true,
      designatedAt: prev.data()?.active ? prev.data()!.designatedAt : now, designatedBy: adminUid, revokedAt: null, revokedBy: null,
      source: meta.source, applicationId: meta.applicationId ?? null, reviewerName: meta.reviewerName ?? null };
    tx.set(ref, record);
    tx.set(db.doc(`ambassadorAudit/${auditId(now)}`), { action: 'designate', uid, school, schoolKey, by: adminUid, at: now,
      source: meta.source, applicationId: meta.applicationId ?? null, reviewerName: meta.reviewerName ?? null });
    if (ledgerRef) tx.set(ledgerRef, { applicationId: meta.applicationId ?? null, decision: 'approve', uid, school, at: now, reviewerName: meta.reviewerName ?? null });
    return { ok: true as const, uid };
  });
}

export async function revokeAmbassador(db: Firestore, adminUid: string, rawUid: unknown, now: number, meta: DesignationMeta = ADMIN_META): Promise<DesignationResult> {
  const uid = uidOf(rawUid);
  return db.runTransaction(async (tx) => {
    const ledgerRef = meta.ledgerId ? db.doc(`ambassadorApplications/${meta.ledgerId}`) : null;
    const ledger = ledgerRef ? await tx.get(ledgerRef) : null;
    if (ledger?.exists) return { ok: true as const, uid: String(ledger.data()?.uid || uid), replayed: true };
    const ref = db.doc(`ambassadors/${uid}`);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new AmbassadorError(meta.source === 'admin' ? 'not_found' : 'not_ambassador');
    const prev = snap.data() as AmbassadorDoc;
    tx.set(ref, { ...prev, active: false, revokedAt: prev.active ? now : prev.revokedAt ?? now, revokedBy: prev.active ? adminUid : prev.revokedBy ?? adminUid });
    tx.set(db.doc(`ambassadorAudit/${auditId(now)}`), { action: 'revoke', uid, school: prev.school, schoolKey: prev.schoolKey, by: adminUid, at: now,
      source: meta.source, applicationId: meta.applicationId ?? null, reviewerName: meta.reviewerName ?? null });
    if (ledgerRef) tx.set(ledgerRef, { applicationId: meta.applicationId ?? null, decision: 'revoke', uid, school: prev.school, at: now, reviewerName: meta.reviewerName ?? null });
    return { ok: true as const, uid };
  });
}

/** Public badge list. Only uids, which are already public on the leaderboard entries. */
export async function ambassadorDirectory(db: Firestore): Promise<{ uids: string[] }> {
  const snap = await db.collection('ambassadors').where('active', '==', true).limit(500).get();
  return { uids: snap.docs.map((d) => d.id) };
}

/** Called by /api/referrals/redeem right after a referral is claimed. Best effort. */
export async function recordRecruitSignal(db: Firestore, referrerUid: string, recruitUid: string, ipHash: string | null, now: number) {
  if (referrerUid === recruitUid) return;
  const user = await db.doc(`users/${recruitUid}`).get();
  const signupAt = ms(user.createTime) ?? now;
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`ambassadorRecruits/${recruitUid}`);
    const snap = await tx.get(ref);
    if (snap.exists) return;
    const record: StoredRecruit = { referrerUid, recruitUid, signupAt, redeemedAt: now, days: [], scannedAt: 0, final: false, ipHash, pseudonymized: false };
    tx.create(ref, record);
  });
}

/** Haiti days, inside the recruit's 14-day window, on which Firestore's own clock saw a learning write. */
export async function scanActivityDays(db: Firestore, uid: string, signupAt: number): Promise<string[]> {
  const user = db.doc(`users/${uid}`);
  const start = dayNumber(haitiDayKey(signupAt));
  const end = start + AMBASSADOR_RULES.retentionWindowDays - 1;
  const [lists, docs] = await Promise.all([
    Promise.all(ACTIVITY_COLLECTIONS.map((name) => user.collection(name).select().limit(SCAN_LIMIT).get())),
    Promise.all(ACTIVITY_DOCS.map((path) => user.collection(path.split('/')[0]).doc(path.split('/')[1]).get())),
  ]);
  const days = new Set<string>();
  const note = (t: unknown) => {
    const at = ms(t);
    if (at == null) return;
    const key = haitiDayKey(at);
    const n = dayNumber(key);
    if (n >= start && n <= end) days.add(key);
  };
  for (const list of lists) for (const d of list.docs) { note(d.createTime); note(d.updateTime); }
  for (const d of docs) if (d.exists) { note(d.createTime); note(d.updateTime); }
  return [...days].sort();
}

/** Bring one ambassador's recruit records up to date and return them. */
export async function refreshRecruits(db: Firestore, referrerUid: string, now: number): Promise<RecruitRecord[]> {
  const [referrals, stored] = await Promise.all([
    db.collection('referrals').where('referrerUid', '==', referrerUid).limit(500).get(),
    db.collection('ambassadorRecruits').where('referrerUid', '==', referrerUid).limit(1000).get(),
  ]);
  const records = new Map<string, StoredRecruit>(stored.docs.map((d) => [d.id, d.data() as StoredRecruit]));
  // Recruits that redeemed before this programme existed get their record now.
  for (const r of referrals.docs) {
    const recruitUid = r.data().referredUid;
    if (typeof recruitUid !== 'string' || recruitUid === referrerUid || records.has(recruitUid)) continue;
    const user = await db.doc(`users/${recruitUid}`).get();
    if (!user.exists) continue;
    const record: StoredRecruit = { referrerUid, recruitUid, signupAt: ms(user.createTime) ?? ms(r.data().createdAt) ?? now,
      redeemedAt: ms(r.data().createdAt) ?? now, days: [], scannedAt: 0, final: false, ipHash: null, pseudonymized: false };
    await db.doc(`ambassadorRecruits/${recruitUid}`).set(record);
    records.set(recruitUid, record);
  }
  let scans = 0;
  for (const [id, rec] of records) {
    if (rec.final || rec.pseudonymized || !rec.recruitUid || scans >= SCANS_PER_REQUEST) continue;
    if (now - (rec.scannedAt || 0) < SCAN_INTERVAL_MS && windowOpen(rec.signupAt, now)) continue;
    scans++;
    const seen = await scanActivityDays(db, rec.recruitUid, rec.signupAt);
    const days = [...new Set([...(rec.days || []), ...seen])].sort();
    // One scan after the window closes makes the outcome final; later writes cannot change it.
    const next: StoredRecruit = { ...rec, days, scannedAt: now, final: !windowOpen(rec.signupAt, now) };
    await db.doc(`ambassadorRecruits/${id}`).set(next);
    records.set(id, next);
  }
  return [...records.entries()].map(([id, r]) => ({ id, referrerUid: r.referrerUid, signupAt: r.signupAt, days: r.days || [], ipHash: r.ipHash, pseudonymized: r.pseudonymized }));
}

async function schoolStanding(db: Firestore, period: string, schoolKey: string): Promise<SchoolStanding | null> {
  const snap = await db.doc(`leaderboards/${period}/collectives/school`).get();
  const groups = (snap.data()?.groups || []) as Array<{ key: string; rank: number; totalXp: number; members: number }>;
  const g = groups.find((x) => x.key === schoolKey);
  return g ? { rank: g.rank, totalXp: g.totalXp, members: g.members, of: groups.length } : null;
}

export async function ambassadorDashboard(db: Firestore, uid: string, now: number): Promise<AmbassadorDashboard> {
  const amb = await isActiveAmbassador(db, uid);
  if (!amb) throw new AmbassadorError('forbidden');
  let code: string | null = null;
  try { code = await ensureReferralCode(db, uid); } catch { code = null; }
  const recruits = await refreshRecruits(db, uid, now);
  const period = haitiPeriod(now);
  const [week, allTime] = await Promise.all([schoolStanding(db, weekId(now), amb.schoolKey), schoolStanding(db, 'all-time', amb.schoolKey)]);
  return {
    school: amb.school, code, link: code ? referralLink(code) : null, period,
    total: summarizeRecruits(recruits, now), thisPeriod: summarizeRecruits(recruits, now, period),
    schoolProgress: { week, allTime },
  };
}

/** Admin: one row per ambassador for the chosen signup period. */
export async function ambassadorReport(db: Firestore, rawPeriod: unknown, now: number): Promise<{ period: string; rows: AmbassadorReportRow[] }> {
  const period = isPeriod(rawPeriod) ? rawPeriod : haitiPeriod(now);
  const snap = await db.collection('ambassadors').limit(200).get();
  const rows: AmbassadorReportRow[] = [];
  for (const d of snap.docs) {
    const a = d.data() as AmbassadorDoc;
    const [recruits, reward] = await Promise.all([refreshRecruits(db, d.id, now), db.doc(`ambassadorRewards/${d.id}_${period}`).get()]);
    rows.push({ uid: d.id, name: a.name || '', school: a.school, period, active: a.active === true,
      source: a.source === 'edlight-apply' ? 'edlight-apply' : 'admin', applicationId: a.applicationId || null, reviewerName: a.reviewerName || null,
      ...summarizeRecruits(recruits, now, period),
      rewardDelivered: reward.data()?.delivered === true, rewardNotes: String(reward.data()?.notes || '') });
  }
  rows.sort((x, y) => x.school.localeCompare(y.school) || x.name.localeCompare(y.name));
  return { period, rows };
}

/** Admin: per-recruit detail for review, with flags. Recruits are shown by state only, never by name. */
export async function ambassadorRecruitDetail(db: Firestore, rawUid: unknown, now: number) {
  const uid = uidOf(rawUid);
  const recruits = await refreshRecruits(db, uid, now);
  const flags = fraudFlags(recruits);
  return { recruits: recruits.sort((a, b) => b.signupAt - a.signupAt).map((r) => ({
    id: r.id.startsWith('anon_') ? 'compte supprimé' : r.id, signupAt: r.signupAt, period: haitiPeriod(r.signupAt),
    activeDays: r.days.length, state: recruitState(r, now), flags: flags[r.id] || [] })) };
}

/** Admin: the manual fulfilment record. No payment happens here. */
export async function setReward(db: Firestore, adminUid: string, rawUid: unknown, rawPeriod: unknown, delivered: unknown, rawNotes: unknown, now: number) {
  const uid = uidOf(rawUid);
  if (!isPeriod(rawPeriod)) throw new AmbassadorError('invalid_input');
  const amb = await db.doc(`ambassadors/${uid}`).get();
  if (!amb.exists) throw new AmbassadorError('not_found');
  const notes = typeof rawNotes === 'string' ? rawNotes.trim().slice(0, 500) : '';
  await db.doc(`ambassadorRewards/${uid}_${rawPeriod}`).set({ uid, period: rawPeriod, delivered: delivered === true, notes, updatedAt: now, updatedBy: adminUid });
  return { ok: true };
}

/**
 * Account deletion. A deleted RECRUIT keeps counting for the ambassador who
 * recruited them (rewards already handed over stay explainable) but loses
 * every link to their identity; a deleted AMBASSADOR loses their designation,
 * and their programme history is kept only under a random id.
 */
export async function eraseAmbassadorAccount(db: Firestore, uid: string) {
  const own = await db.doc(`ambassadorRecruits/${uid}`).get();
  if (own.exists) {
    const r = own.data() as StoredRecruit;
    await db.doc(`ambassadorRecruits/${anonId()}`).set({ ...r, recruitUid: null, ipHash: null, pseudonymized: true, final: true });
    await own.ref.delete();
  }
  const asRecruit = await db.collection('referrals').where('referredUid', '==', uid).get();
  for (const d of asRecruit.docs) {
    const data = d.data();
    await db.doc(`referrals/${data.referrerUid}_${anonId()}`).set({ ...data, referredUid: null, pseudonymized: true });
    await d.ref.delete();
  }
  const amb = await db.doc(`ambassadors/${uid}`).get();
  const recruited = await db.collection('ambassadorRecruits').where('referrerUid', '==', uid).get();
  const rewards = await db.collection('ambassadorRewards').where('uid', '==', uid).get();
  const asReferrer = await db.collection('referrals').where('referrerUid', '==', uid).get();
  const audit = await db.collection('ambassadorAudit').where('uid', '==', uid).get();
  const ledger = await db.collection('ambassadorApplications').where('uid', '==', uid).get();
  if (amb.exists || recruited.size || rewards.size || asReferrer.size || audit.size || ledger.size) {
    const alias = anonId();
    // The audit trail and Apply ledger keep their shape (who decided, when, which application) under the alias.
    for (const d of [...audit.docs, ...ledger.docs]) await d.ref.set({ ...d.data(), uid: alias });
    for (const d of asReferrer.docs) {
      const data = d.data();
      await db.doc(`referrals/${alias}_${data.referredUid || anonId()}`).set({ ...data, referrerUid: alias, pseudonymized: true });
      await d.ref.delete();
    }
    for (const d of recruited.docs) await d.ref.set({ ...d.data(), referrerUid: alias });
    for (const d of rewards.docs) {
      const data = d.data();
      await db.doc(`ambassadorRewards/${alias}_${data.period}`).set({ ...data, uid: alias, notes: '' });
      await d.ref.delete();
    }
    if (amb.exists) await amb.ref.delete();
  }
}
