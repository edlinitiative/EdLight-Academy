/**
 * Query keys that belong to ONE student.
 * ─────────────────────────────────────
 * Every react-query key whose data is private to the signed-in student MUST be
 * built here, with the uid as its second segment. Two reasons:
 *
 *  1. A key without the uid is shared by every account on the device. The
 *     streak used `['global-streak']` while its queryFn read a specific uid, so
 *     student B could be served student A's (fresh, persisted) streak after an
 *     account switch.
 *  2. The persisted cache (services/queryPersistence) and the account-switch
 *     cleanup recognise private data by these roots — a private key built
 *     elsewhere would silently escape both.
 *
 * Public data (course catalog, leaderboards, a challenge looked up by code)
 * keeps plain keys.
 */

type Uid = string | null | undefined;

export const queryKeys = {
  streak: (uid: Uid) => ['global-streak', uid ?? null] as const,
  triviaProfile: (uid: Uid) => ['trivia-profile', uid ?? null] as const,
  examResults: (uid: Uid) => ['exam-results-by-subject', uid ?? null] as const,
  reviewQueue: (uid: Uid) => ['review-queue', uid ?? null] as const,
  myChallenges: (uid: Uid) => ['my-challenges', uid ?? null] as const,
  myTournaments: (uid: Uid) => ['my-tournaments', uid ?? null] as const,
};

/** First key segments of student-private queries. Keep in sync with `queryKeys`. */
export const STUDENT_SCOPED_ROOTS: ReadonlySet<string> = new Set([
  'global-streak',
  'trivia-profile',
  'exam-results-by-subject',
  'review-queue',
  'my-challenges',
  'my-tournaments',
]);

export function isStudentScopedKey(key: readonly unknown[] | undefined | null): boolean {
  return !!key && STUDENT_SCOPED_ROOTS.has(String(key[0]));
}

/**
 * May this cached entry be shown to / persisted for `uid`?
 * Public keys: always. Student keys: only when they name exactly this uid —
 * a student key for nobody (signed out) or for someone else never qualifies.
 */
export function keyBelongsTo(key: readonly unknown[] | undefined | null, uid: Uid): boolean {
  if (!key || !Array.isArray(key)) return false;
  if (!isStudentScopedKey(key)) return true;
  return !!uid && key[1] === uid;
}
