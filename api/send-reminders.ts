/**
 * GET|POST /api/send-reminders  (cron dispatcher)
 * ---------------------------------------------------------------------------
 * The engine that makes study reminders fire EVEN WHEN THE APP IS CLOSED.
 *
 * Triggered on a schedule by Vercel Cron (see vercel.json -> "crons"). It scans
 * every user's pending reminders that are now due and pushes them to that
 * user's devices, then marks them sent and reschedules recurring ones.
 *
 * Security: Vercel automatically attaches `Authorization: Bearer <CRON_SECRET>`
 * to cron invocations when the CRON_SECRET env var is set. We require it (also
 * accepting `x-cron-secret`) so the endpoint can't be triggered by the public.
 *
 * Reminder documents live at `users/{uid}/reminders/{id}` with shape:
 *   { status: 'pending', scheduledFor: ISO8601, recurring, recurringPattern,
 *     title, message, courseId? }
 * `scheduledFor` is an ISO-8601 string, which sorts chronologically, so a
 * lexicographic range query is a valid "due now" filter. A composite index on
 * (status ASC, scheduledFor ASC) for the `reminders` collection group is
 * declared in firestore.indexes.json.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, getAuthAdmin, isAdminConfigured } from './_lib/firebaseAdmin';
import { sendPushToUser, isPushConfigured } from './_lib/push';
import { sendReminderEmail, isEmailConfigured, type ReminderEmailLang } from './_lib/reminderEmail';
import type { Query } from 'firebase-admin/firestore';

// Safety cap so a backlog can never blow the function timeout. Cron runs often
// enough to drain anything beyond this on the next tick.
const MAX_REMINDERS_PER_RUN = 200;

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

/** Next ISO occurrence for a recurring reminder, skipping any in the past. */
function nextOccurrence(fromIso: string, pattern?: string): string | null {
  const next = new Date(fromIso);
  if (Number.isNaN(next.getTime())) return null;
  const advance = () => {
    if (pattern === 'daily') next.setDate(next.getDate() + 1);
    else if (pattern === 'weekly') next.setDate(next.getDate() + 7);
    else if (pattern === 'monthly') next.setMonth(next.getMonth() + 1);
  };
  if (!['daily', 'weekly', 'monthly'].includes(pattern || '')) return null;
  const now = Date.now();
  do {
    advance();
  } while (next.getTime() <= now);
  return next.toISOString();
}

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

  // Firestore admin is mandatory (we read the reminders). Delivery works over
  // push, email, or both — so we run as long as AT LEAST ONE channel is set up.
  const pushOn = isPushConfigured();
  const emailOn = isEmailConfigured();
  if (!isAdminConfigured() || (!pushOn && !emailOn)) {
    res.status(501).json({
      error: 'not_configured',
      message:
        'Set FIREBASE_SERVICE_ACCOUNT_JSON plus at least one delivery channel: ' +
        'VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY (push) and/or RESEND_API_KEY (email).',
    });
    return;
  }

  const db = getDb();
  const nowIso = new Date().toISOString();

  let due;
  try {
    const query = db
      .collectionGroup('reminders')
      .where('status', '==', 'pending')
      .where('scheduledFor', '<=', nowIso)
      .orderBy('scheduledFor', 'asc')
      .limit(MAX_REMINDERS_PER_RUN) as Query;
    due = await query.get();
  } catch (err) {
    // Almost always a missing composite index on first deploy — the error
    // message includes a one-click link to create it.
    // Log details server-side only (the index-creation link is in the logs);
    // return a generic message to the caller.
    console.error('[send-reminders] query failed (missing index?)', err);
    res.status(500).json({ error: 'query_failed' });
    return;
  }

  const summary = { scanned: due.size, sent: 0, delivered: 0, emailed: 0, pruned: 0, rescheduled: 0, errors: 0 };

  // Cache uid→email lookups so a user with several due reminders in one run
  // costs a single Auth read. `undefined` = not yet looked up; `null` = no email.
  const emailCache = new Map<string, string | null>();
  async function emailFor(uid: string): Promise<string | null> {
    if (emailCache.has(uid)) return emailCache.get(uid) as string | null;
    let email: string | null = null;
    try {
      email = (await getAuthAdmin().getUser(uid)).email || null;
    } catch {
      email = null;
    }
    emailCache.set(uid, email);
    return email;
  }

  for (const docSnap of due.docs) {
    const userId = docSnap.ref.parent.parent?.id;
    if (!userId) continue;
    const reminder = docSnap.data() as {
      title?: string;
      message?: string;
      courseId?: string;
      scheduledFor?: string;
      recurring?: boolean;
      recurringPattern?: string;
    };

    try {
      // Respect the user's reminder preferences if present.
      const prefSnap = await db
        .collection('users')
        .doc(userId)
        .collection('settings')
        .doc('notifications')
        .get();
      const prefs = prefSnap.exists ? prefSnap.data() || {} : {};
      // `studyReminders` gates the reminder itself (default on); the per-channel
      // toggles gate HOW it's delivered (default on).
      const studyReminders = prefs.studyReminders !== false;
      const wantsEmail = prefs.emailNotifications !== false;
      const lang: ReminderEmailLang = prefs.language === 'ht' ? 'ht' : 'fr';
      const title = reminder.title || 'Rappel EdLight';
      const message = reminder.message || "C'est l'heure de réviser ! 📚";
      const url = reminder.courseId ? `/courses/${reminder.courseId}` : '/dashboard';

      if (studyReminders) {
        // Push channel.
        if (pushOn) {
          const result = await sendPushToUser(userId, {
            title,
            body: message,
            tag: `reminder-${docSnap.id}`,
            url,
            data: { kind: 'reminder', reminderId: docSnap.id },
          });
          summary.sent += 1;
          summary.delivered += result.sent;
          summary.pruned += result.pruned;
        }
        // Email channel — reaches users without push (iOS Safari, no PWA).
        if (emailOn && wantsEmail) {
          const to = await emailFor(userId);
          if (to) {
            const r = await sendReminderEmail({ to, title, message, url, lang });
            if ('sent' in r) summary.emailed += 1;
          }
        }
      }

      // Mark as sent so it isn't re-delivered.
      await docSnap.ref.set(
        { status: 'sent', sentAt: new Date().toISOString() },
        { merge: true },
      );

      // Recurring reminders schedule their next occurrence.
      if (reminder.recurring && reminder.scheduledFor) {
        const next = nextOccurrence(reminder.scheduledFor, reminder.recurringPattern);
        if (next) {
          const newId = `reminder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          await db
            .collection('users')
            .doc(userId)
            .collection('reminders')
            .doc(newId)
            .set({
              id: newId,
              type: 'study',
              title: reminder.title || 'Rappel EdLight',
              message: reminder.message || '',
              courseId: reminder.courseId || null,
              scheduledFor: next,
              recurring: true,
              recurringPattern: reminder.recurringPattern || null,
              status: 'pending',
              createdAt: new Date().toISOString(),
            });
          summary.rescheduled += 1;
        }
      }
    } catch (err) {
      summary.errors += 1;
      console.warn(`[send-reminders] failed for user ${userId}`, err);
    }
  }

  res.status(200).json({ ok: true, at: nowIso, ...summary });
}
