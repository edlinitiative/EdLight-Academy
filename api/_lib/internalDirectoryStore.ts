/**
 * internalDirectoryStore — the Firestore reads behind api/internal/*.
 * ---------------------------------------------------------------------------
 * STRICTLY READ-ONLY. Every call in this file is a `.get()`. Nothing here
 * writes, increments, or touches a "last seen" field: being looked at by the
 * admissions platform must not change a learner's record, and in particular
 * must not move `users/{uid}.last_seen`, which the re-engagement crons read to
 * decide who has gone quiet. If you add a query here, keep it a read.
 *
 * Cost shape. The learning evidence lives in per-user subcollections, so the
 * naive version is four reads per learner. Instead this uses collection-group
 * queries with `.select()` projections: five queries total for the whole
 * ranking, fetching only the handful of fields that matter (exam result
 * documents carry the full answer payload — LaTeX and all — and must never be
 * pulled down whole just to read one percentage). The lookup endpoint doesn't
 * need evidence for everybody, so it loads identities in one query and then
 * reads evidence for its handful of matches only.
 */
import type { Firestore } from 'firebase-admin/firestore';
import {
  emptyEvidence,
  type DirectoryRow,
  type ExamEvidence,
  type LearningEvidence,
} from './internalDirectory';

/** Upper bound on learners scanned — bounds Firestore read cost, as the
 *  leaderboard snapshot cron bounds its own scan (ENTRIES_CAP). */
export const USER_SCAN_CAP = 5000;
/** Upper bound per evidence collection-group query. */
export const EVIDENCE_SCAN_CAP = 20_000;

type Docish = Record<string, unknown>;

/**
 * A learner's identity plus the raw inputs of the opt-out rule.
 *
 * `optedOut` is left false here on purpose: the two-flag rule lives in
 * `isOptedOutOfRanking`, and duplicating it in the loader is how the two would
 * drift apart. The endpoints resolve it.
 */
export interface IdentityRow extends DirectoryRow {
  /** Whether an all-time leaderboard entry exists for this learner. */
  entryExists: boolean;
  /** `leaderboards/all-time/entries/{uid}.hidden`. */
  entryHidden: boolean | null;
  /** `users/{uid}/gamification/profile.leaderboard.optedIn`. */
  optedIn: boolean | null;
}

/** Epoch ms from a Firestore Timestamp, a raw {_seconds}, a Date or a number. */
export function toMs(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.getTime();
  const v = value as { toMillis?: () => number; _seconds?: number; seconds?: number };
  if (typeof v.toMillis === 'function') {
    try { return v.toMillis(); } catch { return null; }
  }
  const secs = typeof v._seconds === 'number' ? v._seconds : v.seconds;
  return typeof secs === 'number' ? secs * 1000 : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Identity + ranking-eligibility for every learner, in three queries.
 *
 * `users` gives name/email/last_seen; the all-time leaderboard entries give the
 * self-declared département and the `hidden` opt-out flag; the gamification
 * profiles give the `leaderboard.optedIn` flag. Evidence is left empty — the
 * callers fill it in, each in the way that is cheap for them.
 */
export async function loadIdentityRows(db: Firestore): Promise<IdentityRow[]> {
  const [usersSnap, entriesSnap, gamSnap] = await Promise.all([
    db.collection('users')
      .select('full_name', 'email', 'last_seen')
      .limit(USER_SCAN_CAP)
      .get(),
    db.collection('leaderboards/all-time/entries')
      .select('hidden', 'department')
      .limit(USER_SCAN_CAP)
      .get(),
    db.collectionGroup('gamification')
      .select('leaderboard')
      .limit(USER_SCAN_CAP)
      .get(),
  ]);

  const entries = new Map<string, Docish>(entriesSnap.docs.map((d) => [d.id, d.data() as Docish]));
  const optedIn = new Map<string, boolean | null>();
  for (const doc of gamSnap.docs) {
    if (doc.id !== 'profile') continue;
    const uid = doc.ref.parent.parent?.id;
    if (!uid) continue;
    const lb = (doc.data() as Docish).leaderboard as Docish | undefined;
    const flag = lb && 'optedIn' in lb ? Boolean(lb.optedIn) : null;
    optedIn.set(uid, flag);
  }

  return usersSnap.docs.map((doc) => {
    const data = doc.data() as Docish;
    const entry = entries.get(doc.id);
    return {
      id: doc.id,
      fullName: str(data.full_name),
      email: str(data.email),
      lastSeenMs: toMs(data.last_seen),
      department: entry ? str(entry.department) : null,
      // Resolved by the caller through isOptedOutOfRanking, which owns the
      // two-flag rule; carried here as the raw inputs it needs.
      optedOut: false,
      entryExists: Boolean(entry),
      entryHidden: entry ? (entry.hidden as boolean | undefined) ?? null : null,
      optedIn: optedIn.get(doc.id) ?? null,
      evidence: emptyEvidence(),
    };
  });
}

/** A graded exam summary → the few numbers the score needs. */
function examFrom(data: Docish): ExamEvidence | null {
  const summary = data.summary as Docish | undefined;
  const percentage = summary?.percentage;
  if (typeof percentage !== 'number' || !Number.isFinite(percentage)) return null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    percentage,
    answered: num(summary?.correctCount) + num(summary?.incorrectCount) + num(summary?.manualReview),
    unanswered: num(summary?.unanswered),
    atMs: toMs(data.submitted_at_ms) ?? toMs(data.created_at_ms),
  };
}

function ensure(map: Map<string, LearningEvidence>, uid: string): LearningEvidence {
  let ev = map.get(uid);
  if (!ev) { ev = emptyEvidence(); map.set(uid, ev); }
  return ev;
}

/**
 * Learning evidence for EVERY learner, in three collection-group queries.
 *
 * Only the `mastery/lessons` document counts; the sibling `mastery/review`
 * holds missed questions for spaced repetition, which is not an achievement.
 */
export async function loadAllEvidence(db: Firestore): Promise<Map<string, LearningEvidence>> {
  const [masterySnap, examSnap, quizSnap] = await Promise.all([
    db.collectionGroup('mastery').select('lessons').limit(EVIDENCE_SCAN_CAP).get(),
    db.collectionGroup('examResults')
      .select('summary', 'submitted_at_ms', 'created_at_ms')
      .limit(EVIDENCE_SCAN_CAP)
      .get(),
    db.collectionGroup('quizAttempts')
      .select('quizId', 'percentage')
      .limit(EVIDENCE_SCAN_CAP)
      .get(),
  ]);

  const byUid = new Map<string, LearningEvidence>();

  for (const doc of masterySnap.docs) {
    if (doc.id !== 'lessons') continue;
    const uid = doc.ref.parent.parent?.id;
    if (!uid) continue;
    const lessons = (doc.data() as Docish).lessons;
    if (lessons && typeof lessons === 'object') {
      ensure(byUid, uid).masteryLessons = lessons as LearningEvidence['masteryLessons'];
    }
  }

  for (const doc of examSnap.docs) {
    const uid = doc.ref.parent.parent?.id;
    if (!uid) continue;
    const exam = examFrom(doc.data() as Docish);
    if (exam) ensure(byUid, uid).exams.push(exam);
  }

  for (const doc of quizSnap.docs) {
    const uid = doc.ref.parent.parent?.id;
    if (!uid) continue;
    const data = doc.data() as Docish;
    const lessonId = str(data.quizId);
    const pct = data.percentage;
    if (!lessonId || typeof pct !== 'number' || !Number.isFinite(pct)) continue;
    const bests = ensure(byUid, uid).quizBestPct;
    bests[lessonId] = Math.max(bests[lessonId] ?? -1, pct);
  }

  return byUid;
}

/**
 * Learning evidence for a named few — the lookup endpoint's path, where a
 * whole-collection scan would be absurd for at most a couple of matches.
 */
export async function loadEvidenceFor(
  db: Firestore,
  uids: string[],
): Promise<Map<string, LearningEvidence>> {
  const byUid = new Map<string, LearningEvidence>();
  await Promise.all(
    (uids || []).map(async (uid) => {
      const userRef = db.collection('users').doc(uid);
      const [mastery, exams, quizzes] = await Promise.all([
        userRef.collection('mastery').doc('lessons').get(),
        userRef.collection('examResults').select('summary', 'submitted_at_ms', 'created_at_ms').get(),
        userRef.collection('quizAttempts').select('quizId', 'percentage').get(),
      ]);
      const ev = ensure(byUid, uid);
      const lessons = mastery.exists ? (mastery.data() as Docish).lessons : null;
      if (lessons && typeof lessons === 'object') {
        ev.masteryLessons = lessons as LearningEvidence['masteryLessons'];
      }
      for (const doc of exams.docs) {
        const exam = examFrom(doc.data() as Docish);
        if (exam) ev.exams.push(exam);
      }
      for (const doc of quizzes.docs) {
        const data = doc.data() as Docish;
        const lessonId = str(data.quizId);
        const pct = data.percentage;
        if (!lessonId || typeof pct !== 'number' || !Number.isFinite(pct)) continue;
        ev.quizBestPct[lessonId] = Math.max(ev.quizBestPct[lessonId] ?? -1, pct);
      }
    }),
  );
  return byUid;
}
