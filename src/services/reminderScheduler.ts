/**
 * Reminder scheduler (foreground delivery).
 * ---------------------------------------------------------------------------
 * Turns the reminder records in Firestore into real OS notifications.
 *
 * Strategy: while the PWA is open (any tab/the installed app), poll for due
 * reminders and fire them locally through the service worker. This is the
 * reliable baseline that needs no backend cron or VAPID keys — important for
 * EdLight's audience, who mostly open the app on a phone. When a server-side
 * Web Push sender is later configured (see pushNotificationService), it can
 * cover the "app fully closed" case; the two are complementary.
 *
 * Delivered here:
 *   • Explicit reminders saved by the user (status: 'pending', scheduledFor).
 *     Recurring ones (daily/weekly) auto-reschedule their next occurrence.
 *   • A daily study nudge derived from notification preferences
 *     (reminderTime + reminderDays), de-duplicated to once per day.
 */
import {
  getUserReminders,
  markReminderSent,
  createStudyReminder,
  getNotificationPreferences,
} from './notificationService';
import { showLocalNotification, getPermission } from './pushNotificationService';

const CHECK_INTERVAL_MS = 60 * 1000; // poll once a minute while the app is open
const DAILY_GRACE_MS = 2 * 60 * 60 * 1000; // only fire today's nudge within 2h of its time

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

let intervalId: number | null = null;
let activeUserId: string | null = null;
let running = false;
const firedThisSession = new Set<string>();

/** Begin polling for due reminders for the given user. Idempotent. */
export function startReminderScheduler(userId: string): void {
  if (typeof window === 'undefined' || !userId) return;
  if (activeUserId === userId && intervalId !== null) return; // already running for this user

  stopReminderScheduler();
  activeUserId = userId;

  intervalId = window.setInterval(() => {
    void runDueCheck();
  }, CHECK_INTERVAL_MS);

  document.addEventListener('visibilitychange', onVisibilityChange);

  // Give the SW a moment to take control, then do a first pass.
  window.setTimeout(() => void runDueCheck(), 4000);
}

/** Stop polling (e.g. on logout). */
export function stopReminderScheduler(): void {
  if (intervalId !== null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
  document.removeEventListener('visibilitychange', onVisibilityChange);
  activeUserId = null;
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'visible') void runDueCheck();
}

async function runDueCheck(): Promise<void> {
  if (running || !activeUserId) return;
  if (getPermission() !== 'granted') return; // nothing we can show
  running = true;
  try {
    const prefs = await getNotificationPreferences(activeUserId);
    if (prefs.studyReminders === false) return; // user opted out of reminders
    await processDueReminders(activeUserId);
    await maybeFireDailyNudge(activeUserId, prefs);
  } catch (error) {
    console.warn('[Reminders] Due check failed:', error);
  } finally {
    running = false;
  }
}

async function processDueReminders(userId: string): Promise<void> {
  const reminders = (await getUserReminders(userId)) as any[]; // status == 'pending'
  const now = Date.now();

  for (const reminder of reminders) {
    const due = reminder.scheduledFor ? new Date(reminder.scheduledFor).getTime() : 0;
    if (!due || due > now) continue;
    if (firedThisSession.has(reminder.id)) continue;
    firedThisSession.add(reminder.id);

    await showLocalNotification(reminder.title || 'Rappel EdLight', {
      body: reminder.message || "C'est l'heure de réviser ! 📚",
      tag: `reminder-${reminder.id}`,
      url: reminder.courseId ? `/courses/${reminder.courseId}` : '/dashboard',
    });

    await markReminderSent(userId, reminder.id);

    // Recurring reminders schedule their next occurrence.
    if (reminder.recurring) {
      const next = nextOccurrence(reminder.scheduledFor, reminder.recurringPattern);
      if (next) {
        await createStudyReminder(userId, {
          title: reminder.title,
          message: reminder.message,
          courseId: reminder.courseId,
          scheduledFor: next,
          recurring: true,
          recurringPattern: reminder.recurringPattern,
        });
      }
    }
  }
}

async function maybeFireDailyNudge(userId: string, prefs: any): Promise<void> {
  const days: string[] = Array.isArray(prefs.reminderDays) ? prefs.reminderDays : [];
  const time: string = prefs.reminderTime || '18:00';
  if (days.length === 0) return;

  const now = new Date();
  if (!days.includes(WEEKDAYS[now.getDay()])) return;

  const [hh, mm] = time.split(':').map((n: string) => Number(n));
  const target = new Date(now);
  target.setHours(hh || 18, mm || 0, 0, 0);
  if (now < target) return; // not yet time today

  const stampKey = `edlight:daily-nudge:${dateKey(now)}`;
  let already: string | null = null;
  try {
    already = window.localStorage.getItem(stampKey);
  } catch {
    /* storage unavailable */
  }
  if (already) return;

  // If the app was opened long after the scheduled time, skip silently so users
  // don't get a stale "study now" ping at, say, 2 a.m. the next morning.
  const fired = now.getTime() - target.getTime() <= DAILY_GRACE_MS;
  try {
    window.localStorage.setItem(stampKey, fired ? 'sent' : 'skipped');
  } catch {
    /* ignore */
  }
  if (!fired) return;

  await showLocalNotification('Temps de réviser ✨', {
    body: 'Continue ton apprentissage sur EdLight Academy.',
    tag: 'daily-study-nudge',
    url: '/dashboard',
  });
}

/** Compute the next ISO timestamp for a recurring reminder. */
function nextOccurrence(fromIso: string, pattern?: string): string | null {
  const base = new Date(fromIso);
  if (Number.isNaN(base.getTime())) return null;
  const next = new Date(base);
  switch (pattern) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    default:
      return null; // unknown pattern -> don't reschedule
  }
  // Skip past any occurrences that are already in the past (e.g. app was closed
  // for several days) so we resume from the upcoming slot, not a backlog.
  const now = Date.now();
  while (next.getTime() <= now) {
    if (pattern === 'daily') next.setDate(next.getDate() + 1);
    else if (pattern === 'weekly') next.setDate(next.getDate() + 7);
    else if (pattern === 'monthly') next.setMonth(next.getMonth() + 1);
    else break;
  }
  return next.toISOString();
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
