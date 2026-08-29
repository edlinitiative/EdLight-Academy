/**
 * GET|POST /api/reengagement  (cron dispatcher)
 * ---------------------------------------------------------------------------
 * Calls idle learners back, segmented by inactivity and personalized by grade.
 * The 2026-08 activation analysis found 53% of signups never act and only 6
 * accounts were ever active on 2+ days — nothing re-engaged anyone. This job
 * is that channel. It complements send-reminders.ts, which only delivers
 * reminders users explicitly scheduled themselves; this one needs no opt-in
 * beyond the OS push permission (and the same notification prefs gate).
 *
 * Segments (from `users/{uid}.last_seen`, falling back to `created_at`):
 *   • idle 3–7 days  → gentle push: "ta série t'attend" (grade-flavored)
 *   • idle 7+  days  → stronger push; plus an email fallback for users with
 *     no push device at all (reuses the reminder email, ≤ 1 per 14 days)
 *
 * Anti-spam: at most one re-engagement push per user per 72 h and one email
 * per 14 days, stamped on `users/{uid}.reengagement.{lastPushAt,lastEmailAt}`.
 * Respects `settings/notifications.studyReminders` (default on) and, for
 * email, `emailNotifications`.
 *
 * Delivery fans out to BOTH push channels — Expo (native app tokens on the
 * user doc) and web push (PWA subscriptions) — plus the email fallback.
 * Taps deep-link into the armed Défi du jour (data.type 'daily-quiz', the
 * contract App.tsx's notification-tap router already handles).
 *
 * Security: same CRON_SECRET bearer scheme as send-reminders.
 * `?dryRun=1` returns the full plan without sending or stamping anything.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, getAuthAdmin, isAdminConfigured } from './_lib/firebaseAdmin';
import { sendPushToUser, isPushConfigured } from './_lib/push';
import { sendExpoPushToUser } from './_lib/expoPush';
import { sendReminderEmail, isEmailConfigured, type ReminderEmailLang } from './_lib/reminderEmail';
import { loadEmailPersonalization } from './_lib/emailPersonalization';

const DAY_MS = 86_400_000;
/** Gentle nudge once someone has been quiet this long… */
const IDLE_SOFT_DAYS = 3;
/** …stronger copy (and the email fallback) from here. */
const IDLE_HARD_DAYS = 7;
/** At most one re-engagement push per user per this window. */
const PUSH_COOLDOWN_MS = 72 * 3_600_000;
/** At most one re-engagement email per user per this window. */
const EMAIL_COOLDOWN_MS = 14 * DAY_MS;
/** Backlog cap per run — the daily cron drains the rest next time. */
const MAX_SENDS_PER_RUN = 200;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function authorized(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) return false; // refuse to run unprotected
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const headerSecret = (req.headers['x-cron-secret'] as string) || '';
  return (
    (!!bearer && timingSafeEqual(bearer, secret)) ||
    (!!headerSecret && timingSafeEqual(headerSecret, secret))
  );
}

// ─── Segmentation (pure — no I/O, unit-testable) ────────────────────────────

export interface CandidateUser {
  uid: string;
  /** Millis of the user's last recorded open (last_seen ?? created_at). */
  lastSeenMs: number | null;
  grade: string | null;
  hasExpoTokens: boolean;
  lastReengagementPushMs: number | null;
  lastReengagementEmailMs: number | null;
}

export type PlanAction = 'push-soft' | 'push-hard' | 'email';

export interface PlanEntry {
  uid: string;
  action: PlanAction;
  idleDays: number;
  grade: string | null;
}

/**
 * Decide who gets what today. Web-push subscriptions live in a subcollection
 * (not on the doc), so `hasExpoTokens=false` users are still *attempted* over
 * web push at send time — email is planned only for the tokenless, since a
 * PWA subscription is rare enough that a wasted attempt is cheaper than a
 * subcollection read per user here.
 */
export function planReengagement(users: CandidateUser[], nowMs: number): PlanEntry[] {
  const plan: PlanEntry[] = [];
  for (const u of users) {
    if (u.lastSeenMs == null) continue; // no signal at all — skip, never guess
    const idleDays = Math.floor((nowMs - u.lastSeenMs) / DAY_MS);
    if (idleDays < IDLE_SOFT_DAYS) continue;

    const pushAllowed =
      u.lastReengagementPushMs == null || nowMs - u.lastReengagementPushMs >= PUSH_COOLDOWN_MS;
    const emailAllowed =
      u.lastReengagementEmailMs == null || nowMs - u.lastReengagementEmailMs >= EMAIL_COOLDOWN_MS;

    if (idleDays >= IDLE_HARD_DAYS && !u.hasExpoTokens) {
      if (emailAllowed) plan.push({ uid: u.uid, action: 'email', idleDays, grade: u.grade });
      continue;
    }
    if (!pushAllowed) continue;
    plan.push({
      uid: u.uid,
      action: idleDays >= IDLE_HARD_DAYS ? 'push-hard' : 'push-soft',
      idleDays,
      grade: u.grade,
    });
  }
  return plan;
}

// ─── Copy (FR first, Creole second line; grade-flavored when known) ─────────

/** Human label for the grade code in copy ("NS4", "9e", "Préfac"…). */
function gradeLabel(grade: string | null): string | null {
  if (!grade) return null;
  if (grade === 'POSTBAC') return 'Préfac';
  return grade;
}

export function reengagementCopy(action: PlanAction, grade: string | null): { title: string; body: string } {
  const g = gradeLabel(grade);
  if (action === 'push-soft') {
    return {
      title: g ? `Ton défi ${g} t’attend 🔥` : 'Ton défi du jour t’attend 🔥',
      body: '2 minutes de quiz pour relancer ta série. · 2 minit quiz pou reprann seri ou.',
    };
  }
  return {
    title: g ? `${g} : on ne t’a pas vu depuis un moment` : 'On ne t’a pas vu depuis un moment',
    body: 'Ton défi du jour et le classement de la semaine t’attendent. · Defi jodi a ak klasman semèn nan ap tann ou.',
  };
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  if (!authorized(req)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  if (!isAdminConfigured()) {
    res.status(501).json({ error: 'not_configured', message: 'Set FIREBASE_SERVICE_ACCOUNT_JSON.' });
    return;
  }

  const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';
  const db = getDb();
  const nowMs = Date.now();

  // Small user base (~100) — a full scan is one query. Revisit with a
  // last_seen range filter + index if this ever grows past a few thousand.
  const usersSnap = await db.collection('users').get();
  const candidates: CandidateUser[] = usersSnap.docs.map((d) => {
    const data = d.data() as Record<string, any>;
    const toMs = (v: any): number | null => {
      if (!v) return null;
      if (typeof v.toMillis === 'function') return v.toMillis();
      const t = new Date(v).getTime();
      return Number.isFinite(t) ? t : null;
    };
    return {
      uid: d.id,
      lastSeenMs: toMs(data.last_seen) ?? toMs(data.created_at),
      grade: typeof data.grade === 'string' && data.grade ? data.grade : null,
      hasExpoTokens: Array.isArray(data.expoPushTokens) && data.expoPushTokens.length > 0,
      lastReengagementPushMs: toMs(data.reengagement?.lastPushAt),
      lastReengagementEmailMs: toMs(data.reengagement?.lastEmailAt),
    };
  });

  const plan = planReengagement(candidates, nowMs).slice(0, MAX_SENDS_PER_RUN);
  const summary = {
    users: candidates.length,
    planned: plan.length,
    pushSoft: plan.filter((p) => p.action === 'push-soft').length,
    pushHard: plan.filter((p) => p.action === 'push-hard').length,
    email: plan.filter((p) => p.action === 'email').length,
    sentExpo: 0,
    sentWeb: 0,
    emailed: 0,
    skippedPrefs: 0,
    errors: 0,
  };

  if (dryRun) {
    res.status(200).json({ ok: true, dryRun: true, ...summary, plan });
    return;
  }

  const emailOn = isEmailConfigured();
  const webPushOn = isPushConfigured();

  for (const entry of plan) {
    try {
      // Same preference gate as send-reminders — studyReminders off = silence.
      const prefSnap = await db
        .collection('users').doc(entry.uid)
        .collection('settings').doc('notifications').get();
      const prefs = prefSnap.exists ? prefSnap.data() || {} : {};
      if (prefs.studyReminders === false) {
        summary.skippedPrefs += 1;
        continue;
      }
      const lang: ReminderEmailLang = prefs.language === 'ht' ? 'ht' : 'fr';
      const copy = reengagementCopy(entry.action, entry.grade);

      if (entry.action === 'email') {
        if (!emailOn || prefs.emailNotifications === false) {
          summary.skippedPrefs += 1;
          continue;
        }
        const authUser = await getAuthAdmin().getUser(entry.uid).catch(() => null);
        const email = authUser?.email;
        if (!email) continue;
        // The win-back email leads with the student's name and what they've
        // already earned (mastered lessons) — the template owns that copy;
        // `title` still drives the subject line.
        const personalization = await loadEmailPersonalization(db, entry.uid, authUser?.displayName);
        const r = await sendReminderEmail({
          to: email,
          title: copy.title,
          message: copy.body,
          url: '/dashboard',
          lang,
          variant: 'reengagement',
          personalization,
        });
        if ('sent' in r) {
          summary.emailed += 1;
          await db.collection('users').doc(entry.uid)
            .set({ reengagement: { lastEmailAt: new Date().toISOString() } }, { merge: true });
        }
        continue;
      }

      // Push — Expo (native) + web push (PWA), whichever the user has.
      const expo = await sendExpoPushToUser(entry.uid, {
        title: copy.title,
        body: copy.body,
        data: { type: 'daily-quiz' },
      });
      summary.sentExpo += expo.sent;
      if (webPushOn) {
        const web = await sendPushToUser(entry.uid, {
          title: copy.title,
          body: copy.body,
          tag: 'reengagement',
          url: '/dashboard',
          data: { kind: 'reengagement' },
        });
        summary.sentWeb += web.sent;
      }
      if (expo.sent > 0 || webPushOn) {
        await db.collection('users').doc(entry.uid)
          .set({ reengagement: { lastPushAt: new Date().toISOString() } }, { merge: true });
      }
    } catch (err) {
      summary.errors += 1;
      console.warn(`[reengagement] failed for ${entry.uid}`, err);
    }
  }

  res.status(200).json({ ok: true, at: new Date(nowMs).toISOString(), ...summary });
}
