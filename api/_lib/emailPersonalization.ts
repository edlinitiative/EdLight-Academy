/**
 * api/_lib/emailPersonalization.ts — the per-student facts an email opens with.
 * ---------------------------------------------------------------------------
 * Both email crons (send-reminders, reengagement) share this loader so the
 * same student reads the same numbers in both. It costs three parallel doc
 * reads per EMAILED user (streak, mastery, review) — cheap because callers
 * only invoke it once they know an email will actually go out.
 *
 * Every field is best-effort: a failed read yields an absent field, never a
 * thrown error and never a fabricated zero — the template hides what it
 * doesn't know.
 */
import type { Firestore } from 'firebase-admin/firestore';
import type { ReminderPersonalization } from './reminderEmail';

/** First word of a display name — "Ted Jacquet" → "Ted". */
export function firstNameOf(displayName?: string | null): string | null {
  const first = (displayName ?? '').trim().split(/\s+/)[0];
  return first || null;
}

/**
 * A streak only counts if it is alive — the doc keeps its last value forever,
 * so a `currentStreak: 7` from March must not greet a student in August.
 * Alive = last activity today or yesterday (date-string comparison; the app
 * stores `lastActivityDate` as YYYY-MM-DD).
 */
export function aliveStreak(currentStreak: unknown, lastActivityDate: unknown, now: Date): number | null {
  const n = typeof currentStreak === 'number' ? currentStreak : 0;
  if (n <= 0 || typeof lastActivityDate !== 'string') return null;
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  return lastActivityDate === today || lastActivityDate === yesterday ? n : null;
}

/** Count lessons confirmed on a chapter test in the mastery map. */
export function countMastered(lessons: unknown): number {
  if (!lessons || typeof lessons !== 'object') return 0;
  let n = 0;
  for (const rec of Object.values(lessons as Record<string, any>)) {
    if (rec && typeof rec.masteredAt === 'number') n += 1;
  }
  return n;
}

/** Count review-map questions still due (missed more recently than answered right). */
export function countDueReview(questions: unknown): number {
  if (!questions || typeof questions !== 'object') return 0;
  let n = 0;
  for (const rec of Object.values(questions as Record<string, any>)) {
    const missedAt = typeof rec?.missedAt === 'number' ? rec.missedAt : 0;
    const correctAt = typeof rec?.correctAt === 'number' ? rec.correctAt : 0;
    if (missedAt > 0 && missedAt > correctAt) n += 1;
  }
  return n;
}

export async function loadEmailPersonalization(
  db: Firestore,
  uid: string,
  displayName?: string | null,
): Promise<ReminderPersonalization> {
  const p: ReminderPersonalization = { firstName: firstNameOf(displayName) };
  try {
    const userRef = db.collection('users').doc(uid);
    const [streakSnap, masterySnap, reviewSnap] = await Promise.all([
      userRef.collection('streaks').doc('global').get(),
      userRef.collection('mastery').doc('lessons').get(),
      userRef.collection('mastery').doc('review').get(),
    ]);

    const streak = streakSnap.exists ? streakSnap.data() ?? {} : {};
    p.streakDays = aliveStreak(streak.currentStreak, streak.lastActivityDate, new Date());
    p.masteredCount = countMastered(masterySnap.exists ? masterySnap.data()?.lessons : null);
    p.dueReviewCount = countDueReview(reviewSnap.exists ? reviewSnap.data()?.questions : null);
  } catch (err) {
    console.warn(`[emailPersonalization] partial load for ${uid}:`, err);
  }
  return p;
}
