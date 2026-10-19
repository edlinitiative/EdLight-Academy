/**
 * Server half of the student-shared progress record (shared/progressShare.ts).
 *
 * Data model (server-only; firestore.rules denies every client):
 *   progressShares/{sha256(token)} = { uid, createdAt, expiresAt, revokedAt,
 *                                      scope, lastViewedAt, views }
 * The token itself is returned once, to the student who created it, and is
 * never stored. Anyone holding it can read the `PublicProgress` scope until
 * the link expires or the student revokes it.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import {
  MAX_ACTIVE_SHARES, PUBLIC_EXAM_LIMIT, SHARE_SCOPE, ShareError, isShareToken, shareDays, shareExpiry, shareStatus,
  toPublicProgress, type PublicProgress, type PublicShareResponse, type ShareListItem, type ShareRecord,
} from '../../shared/progressShare';
import { buildCourseRecords, totalLessonsCompleted, type CatalogCourse } from '../../src/services/progressRecord';
import { defaultAlias } from '../../shared/alias';
import { liveStreakCount } from '../../shared/streakLife';
import { haitiDayKey } from '../../shared/ambassadors';
import type { ProgressMap } from '../../shared/mastery';

const COLLECTION = 'progressShares';
const ORIGIN = 'https://academy.edlight.org';

/** 192 random bits, base64url. */
export function generateShareToken(): string {
  return randomBytes(24).toString('base64url');
}
export function hashShareToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
const isShareId = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);

export async function createShare(db: Firestore, uid: string, rawDays: unknown, now: number) {
  const days = shareDays(rawDays);
  const token = generateShareToken();
  const id = hashShareToken(token);
  const record: ShareRecord = { uid, createdAt: now, expiresAt: shareExpiry(now, days), revokedAt: null, scope: SHARE_SCOPE, lastViewedAt: null, views: 0 };
  await db.runTransaction(async (tx) => {
    const mine = await tx.get(db.collection(COLLECTION).where('uid', '==', uid).limit(50));
    const active = mine.docs.filter((d) => shareStatus(d.data() as ShareRecord, now) === 'active').length;
    if (active >= MAX_ACTIVE_SHARES) throw new ShareError('limit');
    tx.create(db.doc(`${COLLECTION}/${id}`), record);
  });
  return { token, id, expiresAt: record.expiresAt, days };
}

/** Active links only: revoked and expired ones are history the student does not need to manage. */
export async function listShares(db: Firestore, uid: string, now: number): Promise<{ shares: ShareListItem[] }> {
  const snap = await db.collection(COLLECTION).where('uid', '==', uid).limit(50).get();
  const shares = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as ShareRecord) }))
    .filter((r) => shareStatus(r, now) === 'active')
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((r) => ({ id: r.id, createdAt: r.createdAt, expiresAt: r.expiresAt, lastViewedAt: r.lastViewedAt ?? null, views: r.views || 0 }));
  return { shares };
}

export async function revokeShare(db: Firestore, uid: string, id: unknown, now: number) {
  if (!isShareId(id)) throw new ShareError('invalid_input');
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`${COLLECTION}/${id}`);
    const snap = await tx.get(ref);
    // Someone else's link is indistinguishable from a missing one.
    if (!snap.exists || (snap.data() as ShareRecord).uid !== uid) throw new ShareError('not_found');
    if ((snap.data() as ShareRecord).revokedAt) return;
    tx.set(ref, { ...(snap.data() as ShareRecord), revokedAt: now });
  });
  return { ok: true };
}

/** Public catalogues, cached per warm instance. Failure degrades titles, never the page. */
type Cached<T> = { at: number; value: T };
let courseCache: Cached<CatalogCourse[]> | null = null;
let examCache: Cached<Map<string, any>> | null = null;
const CATALOG_TTL = 60 * 60 * 1000;

export async function loadCourseCatalog(now: number, origin = ORIGIN): Promise<CatalogCourse[]> {
  if (courseCache && now - courseCache.at < CATALOG_TTL) return courseCache.value;
  try {
    const res = await fetch(`${origin}/catalog.json`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const value: CatalogCourse[] = (Array.isArray(data?.courses) ? data.courses : []).map((c: any) => ({
      id: String(c.id), name: String(c.name || c.id), level: String(c.level_id || ''), subject: String(c.subject || ''),
      modules: (Array.isArray(c.units) ? c.units : []).map((u: any) => ({
        id: String(u.unitId || ''), title: String(u.title || ''),
        lessons: (Array.isArray(u.lessons) ? u.lessons : []).map((l: any) => ({ id: String(l.lessonId || '') })).filter((l: any) => l.id),
      })),
    }));
    courseCache = { at: now, value };
    return value;
  } catch {
    return courseCache?.value || [];
  }
}

export async function loadExamIndex(now: number, origin = ORIGIN): Promise<Map<string, any>> {
  if (examCache && now - examCache.at < CATALOG_TTL) return examCache.value;
  try {
    const res = await fetch(`${origin}/exam_catalog_index.json`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const rows: any[] = Array.isArray(data) ? data : Object.values(data || {}).flat();
    const value = new Map(rows.filter((e) => e?.exam_id).map((e) => [String(e.exam_id), e]));
    examCache = { at: now, value };
    return value;
  } catch {
    return examCache?.value || new Map();
  }
}
export function __resetShareCatalogCache() { courseCache = null; examCache = null; }

/** Local noon of the Haiti calendar day, so streak liveness uses Haiti dates on a UTC server. */
function haitiNow(now: number): Date {
  const [y, m, d] = haitiDayKey(now).split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

/** Reads only what the public scope needs. Exam results are projected so answers are never even fetched. */
export async function buildPublicProgress(db: Firestore, uid: string, expiresAt: number, now: number,
  catalogs: { courses: CatalogCourse[]; exams: Map<string, any> }): Promise<PublicProgress> {
  const user = db.doc(`users/${uid}`);
  const [profile, gamification, streak, mastery, progress, results] = await Promise.all([
    user.get(), user.collection('gamification').doc('profile').get(), user.collection('streaks').doc('global').get(),
    user.collection('mastery').doc('lessons').get(), user.collection('progress').limit(60).get(),
    user.collection('examResults').select('summary', 'percentage', 'submitted_at_ms', 'created_at_ms').limit(200).get(),
  ]);
  const p = profile.data() || {};
  const progressDocs = progress.docs.map((d) => ({ courseId: d.id, completedLessons: Array.isArray(d.data().completedLessons) ? d.data().completedLessons : [] }));
  const map: ProgressMap = {};
  const lessons = mastery.data()?.lessons;
  if (lessons && typeof lessons === 'object') for (const [id, rec] of Object.entries(lessons)) if (rec && typeof rec === 'object') map[id] = { ...(rec as object) };
  for (const doc of progressDocs) for (const id of doc.completedLessons) if (typeof id === 'string') map[id] = { ...(map[id] || {}), completed: true };
  const courses = buildCourseRecords(progressDocs, catalogs.courses, map).filter((c) => !c.unknownCourse);
  const exams = results.docs.map((d) => {
    const data = d.data();
    const percentage = data.summary?.percentage ?? data.percentage;
    const exam = catalogs.exams.get(d.id);
    if (typeof percentage !== 'number' || !exam) return null;
    return { title: String(exam.exam_title || exam.title || ''), subject: String(exam.subject || ''), year: String(exam.year || ''),
      level: String(exam.level || ''), percentage, submittedAtMs: data.submitted_at_ms ?? data.created_at_ms ?? null };
  }).filter(Boolean).sort((a: any, b: any) => (b.submittedAtMs ?? 0) - (a.submittedAtMs ?? 0)).slice(0, PUBLIC_EXAM_LIMIT);
  const s = streak.data() || {};
  return toPublicProgress({
    firstName: defaultAlias(p.full_name || p.name || p.displayName || ''),
    grade: typeof p.grade === 'string' ? p.grade : null,
    generatedAt: now, expiresAt,
    lastActivityDay: typeof s.lastActivityDate === 'string' ? s.lastActivityDate : null,
    streak: { current: liveStreakCount(s, haitiNow(now)), best: s.longestStreak },
    xp: gamification.data()?.xp,
    lessonsDone: totalLessonsCompleted(progressDocs),
    courses, exams: exams as any[],
  });
}

/**
 * The public read. Counts the view, then builds the scope. A revoked,
 * expired or unknown token gets only its status, never whose link it was.
 */
export async function viewShare(db: Firestore, token: unknown, now: number,
  catalogs?: { courses: CatalogCourse[]; exams: Map<string, any> }): Promise<PublicShareResponse> {
  if (!isShareToken(token)) return { status: 'not_found' };
  const ref = db.doc(`${COLLECTION}/${hashShareToken(token)}`);
  const outcome = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { status: 'not_found' as const };
    const record = snap.data() as ShareRecord;
    const status = shareStatus(record, now);
    if (status !== 'active') return { status };
    tx.set(ref, { ...record, views: (record.views || 0) + 1, lastViewedAt: now });
    return { status: 'ok' as const, record };
  });
  if (outcome.status !== 'ok') return { status: outcome.status };
  const [courses, exams] = catalogs ? [catalogs.courses, catalogs.exams] : await Promise.all([loadCourseCatalog(now), loadExamIndex(now)]);
  return { status: 'ok', progress: await buildPublicProgress(db, outcome.record.uid, outcome.record.expiresAt, now, { courses, exams }) };
}

/** Account deletion: every link the student made stops working and its record is gone. */
export async function eraseProgressShares(db: Firestore, uid: string) {
  const snap = await db.collection(COLLECTION).where('uid', '==', uid).get();
  for (const d of snap.docs) await d.ref.delete();
}
