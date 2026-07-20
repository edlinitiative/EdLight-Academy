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
import { getDb, isAdminConfigured } from './_lib/firebaseAdmin';
import { sendPushToUser, isPushConfigured } from './_lib/push';
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

  if (!isPushConfigured() || !isAdminConfigured()) {
    res.status(501).json({
      error: 'not_configured',
      message:
        'Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and FIREBASE_SERVICE_ACCOUNT_JSON to enable reminder push.',
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

  const summary = { scanned: due.size, sent: 0, delivered: 0, pruned: 0, rescheduled: 0, errors: 0 };

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
      // Respect the user's reminder preference if present.
      const prefSnap = await db
        .collection('users')
        .doc(userId)
        .collection('settings')
        .doc('notifications')
        .get();
      const studyReminders = prefSnap.exists ? prefSnap.data()?.studyReminders : true;

      if (studyReminders !== false) {
        const result = await sendPushToUser(userId, {
          title: reminder.title || 'Rappel EdLight',
          body: reminder.message || "C'est l'heure de réviser ! 📚",
          tag: `reminder-${docSnap.id}`,
          url: reminder.courseId ? `/courses/${reminder.courseId}` : '/dashboard',
          data: { kind: 'reminder', reminderId: docSnap.id },
        });
        summary.sent += 1;
        summary.delivered += result.sent;
        summary.pruned += result.pruned;
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
