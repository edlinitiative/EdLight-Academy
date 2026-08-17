/**
 * GET|POST /api/daily-nudge  (cron dispatcher)
 * ---------------------------------------------------------------------------
 * The every-morning habit nudge: at 6am Haiti time, email (and push, where a
 * token exists) every learner who hasn't practised yet today.
 *
 * Two flavours, chosen per user by classifyNudge():
 *   • streak-at-risk → they played YESTERDAY but not today, so their streak is
 *     on the line this morning.
 *   • daily          → everyone else who hasn't played today.
 * Someone who already played today gets nothing.
 *
 * Why this exists alongside its two siblings:
 *   • send-reminders.ts delivers reminders users scheduled THEMSELVES. Nothing
 *     ever wrote to that queue, so it has never sent anything.
 *   • reengagement.ts calls back IDLE users (3+ / 7+ days) at midday, at most
 *     one email per 14 days.
 *   • this job is the daily habit loop, and is the only one that runs at 6am.
 *
 * Reach note: 104 of 105 users have an email address; only 8 have a push token.
 * Email is the primary channel here, push is the bonus.
 *
 * Timing: Vercel crons are UTC and Haiti observes DST, so this is scheduled at
 * BOTH 10:00Z and 11:00Z and no-ops unless it is actually the 6am Haiti hour
 * (see isNudgeHour). Pass `?force=1` to bypass that gate when testing.
 *
 * Consent: opt-out, not opt-in — `settings/notifications.studyReminders` and
 * `.emailNotifications` both default to on (matching send-reminders.ts), and
 * every email carries the manage-preferences link from reminderEmail.ts.
 *
 * Anti-spam: one nudge per user per Haiti day, stamped at
 * `users/{uid}.dailyNudge.lastSentAt`.
 *
 * Security: same CRON_SECRET bearer scheme as send-reminders / reengagement.
 * `?dryRun=1`      — return the full plan, send nothing, stamp nothing.
 * `?onlyEmail=x`   — restrict the run to one account (used for the first test).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, getAuthAdmin, isAdminConfigured } from './_lib/firebaseAdmin';
import { sendExpoPushToUser } from './_lib/expoPush';
import { sendReminderEmail, isEmailConfigured, type ReminderEmailLang } from './_lib/reminderEmail';
import {
  haitiDateKey,
  isNudgeHour,
  classifyNudge,
  nudgeCopy,
  alreadyNudgedToday,
  type NudgeKind,
} from './_lib/dailyNudge';

/** Backlog cap per run, mirroring the other crons. */
const MAX_SENDS_PER_RUN = 300;

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

/** First name only, and never the placeholder names the auth layer substitutes. */
function firstNameOf(fullName?: string | null): string {
  const first = String(fullName || '').trim().split(/\s+/)[0] || '';
  return /^(élève|eleve|elèv|elev|étudiant|etudiant|student)$/i.test(first) ? '' : first;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });

  const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';
  const force = req.query.force === '1' || req.query.force === 'true';
  const onlyEmail = typeof req.query.onlyEmail === 'string' ? req.query.onlyEmail.toLowerCase() : '';

  const emailOn = isEmailConfigured();
  if (!isAdminConfigured() || !emailOn) {
    return res.status(200).json({
      skipped: 'not-configured',
      detail: 'Needs Firebase admin credentials and RESEND_API_KEY.',
    });
  }

  const now = new Date();
  const today = haitiDateKey(now);
  if (!isNudgeHour(now) && !force) {
    return res.status(200).json({ skipped: 'not-nudge-hour', haitiDate: today });
  }

  const db = getDb();
  const users = await db.collection('users').get();

  const summary = {
    haitiDate: today,
    dryRun,
    scanned: users.size,
    eligible: 0,
    emailed: 0,
    pushed: 0,
    skippedPlayedToday: 0,
    skippedAlreadyNudged: 0,
    skippedOptedOut: 0,
    skippedNoEmail: 0,
    errors: 0,
  };
  const plan: Array<{ uid: string; email: string; kind: NudgeKind; lang: string }> = [];

  for (const doc of users.docs) {
    if (summary.emailed >= MAX_SENDS_PER_RUN) break;
    const uid = doc.id;
    const u = doc.data() || {};

    try {
      const email = String(u.email || '').trim();
      if (onlyEmail && email.toLowerCase() !== onlyEmail) continue;

      // One nudge per Haiti day.
      if (alreadyNudgedToday(u.dailyNudge?.lastSentAt, today)) {
        summary.skippedAlreadyNudged += 1;
        continue;
      }

      // The streak signal lives on the gamification profile, not the user doc.
      const gp = await db.collection('users').doc(uid).collection('gamification').doc('profile').get();
      const lastPlayedDate = gp.exists ? (gp.data()?.lastPlayedDate as string | undefined) : undefined;

      const kind = classifyNudge({ lastPlayedDate, today });
      if (!kind) {
        summary.skippedPlayedToday += 1;
        continue;
      }

      // Preferences: same doc and same opt-out defaults as send-reminders.ts.
      const prefSnap = await db.collection('users').doc(uid).collection('settings').doc('notifications').get();
      const prefs = prefSnap.exists ? prefSnap.data() || {} : {};
      if (prefs.studyReminders === false) {
        summary.skippedOptedOut += 1;
        continue;
      }
      const wantsEmail = prefs.emailNotifications !== false;
      const lang: ReminderEmailLang = (prefs.language || u.language) === 'ht' ? 'ht' : 'fr';

      // Resolve the address from Auth when the user doc has none.
      let to = email;
      if (!to) {
        try { to = (await getAuthAdmin().getUser(uid)).email || ''; } catch { to = ''; }
      }
      if (!to) {
        summary.skippedNoEmail += 1;
        continue;
      }

      summary.eligible += 1;
      const copy = nudgeCopy(kind, lang, firstNameOf(u.full_name));
      plan.push({ uid, email: to, kind, lang });

      if (dryRun) continue;

      if (wantsEmail) {
        const r = await sendReminderEmail({
          to,
          title: copy.title,
          message: copy.message,
          url: '/dashboard',
          lang,
        });
        if ('sent' in r) summary.emailed += 1;
        else summary.errors += 1;
      } else {
        summary.skippedOptedOut += 1;
      }

      // Push is a bonus channel — only 8 users have a token today.
      const p = await sendExpoPushToUser(uid, {
        title: copy.title,
        body: copy.message,
        data: { type: 'daily-quiz', kind: 'daily-nudge' },
      });
      summary.pushed += p.sent;

      await doc.ref.set(
        { dailyNudge: { lastSentAt: new Date().toISOString(), lastKind: kind } },
        { merge: true },
      );
    } catch {
      summary.errors += 1;
    }
  }

  return res.status(200).json({ ...summary, plan: dryRun ? plan : plan.length });
}
