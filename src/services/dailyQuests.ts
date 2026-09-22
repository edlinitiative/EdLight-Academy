/**
 * Daily quests — two or three missions a day, and every one of them counted.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The mockups asked for "Quêtes Quotidiennes & Défis": a short list of things
 * to do today, each worth XP, each expiring at midnight. The whole value of
 * that list is whether the progress bar under a quest is REAL. A quest that
 * never ticks is worse than no quest, so the rule this file is built on is:
 *
 *   A QUEST MAY ONLY EXIST IF THE APP ALREADY WRITES SOMETHING, TIMESTAMPED,
 *   THAT PROVES IT WAS DONE.
 *
 * All four observations below are derived from records the app already keeps.
 * Nothing here invents a second progress model, and nothing here needs a new
 * per-day document to know how far along a student is:
 *
 *   review          `correctAt` in the shared review map
 *                   (users/{uid}/mastery/review — utils/review.ReviewEntry).
 *                   A question answered right today, that is no longer due.
 *   lessons         `levelUpAt` / `masteredAt` in the ONE shared mastery doc
 *                   (users/{uid}/mastery/lessons — shared/mastery).
 *   unit-quiz       `attemptedAtMs` on the immutable quiz-attempt log
 *                   (users/{uid}/quizAttempts, written by UnitQuiz).
 *   daily-challenge `dailyChallenge.date` on the gamification profile
 *                   (triviaService.getDailyChallengeState).
 *   exam-paper      `updated_at_ms` on a saved exam attempt
 *                   (users/{uid}/examAttempts — examAttempts.ts).
 *
 * The ONE thing that cannot be derived is whether a finished quest has already
 * been PAID. XP is durable state; "did we already add 20 XP for this?" is not
 * a fact about the day's work, it is a fact about our own ledger. That single
 * bit is persisted, on the gamification profile the XP itself lives on, by
 * triviaService.claimQuestXp — never here, and never in a device-local store.
 *
 * THE DAY BOUNDARY. Every window in this file is a LOCAL calendar day whose
 * key is produced by `dayKey`, a byte-for-byte twin of streakService.todayStr.
 * They have to agree: if quests rolled over at UTC midnight and the streak at
 * local midnight, a student at 23:30 would be told the day was over while the
 * streak still wanted feeding. `dayKey` takes a clock so it can be tested; the
 * parity test pins it to `todayStr()`.
 *
 * Everything here is pure — inputs in, quests out — so the selection can be
 * frozen to a date and a student and asserted.
 */

import type { ReviewMap } from '../utils/review';
import type { ProgressMap } from '../../shared/mastery';

// ─── The day ────────────────────────────────────────────────────────────────

/**
 * Local calendar day as YYYY-MM-DD. Identical arithmetic to
 * streakService.todayStr, which takes no clock and therefore cannot be tested
 * against a fixed date; this one can, and `dailyQuests.test.ts` asserts the two
 * never disagree.
 */
export function dayKey(now: Date | number = new Date()): string {
  const d = now instanceof Date ? now : new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Epoch-ms half-open window [start, end) for a YYYY-MM-DD key.
 *
 * `end` is built with `new Date(y, m - 1, d + 1)` rather than `start + 86 400 000`
 * so a day that is 23 or 25 hours long — Haiti observes DST — still ends at the
 * local midnight the student's clock will show.
 */
export function dayBounds(day: string): { start: number; end: number } {
  const [y, m, d] = String(day).split('-').map(Number);
  return {
    start: new Date(y, m - 1, d).getTime(),
    end: new Date(y, m - 1, d + 1).getTime(),
  };
}

/** Milliseconds until this day ends. Never negative. */
export function msUntilDayEnd(day: string, now: Date | number = new Date()): number {
  const ms = now instanceof Date ? now.getTime() : now;
  return Math.max(0, dayBounds(day).end - ms);
}

/**
 * `{ hours, minutes }` remaining, rounded DOWN to the minute — the mockups'
 * "Expire dans 06h 42m". Rounding down is the honest direction: it never
 * promises a minute the student does not have.
 */
export function splitCountdown(ms: number): { hours: number; minutes: number } {
  const total = Math.max(0, Math.floor(ms / 60_000));
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

// ─── The quests ─────────────────────────────────────────────────────────────

export type QuestId = 'review' | 'lessons' | 'unit-quiz' | 'daily-challenge' | 'exam-paper';

/** The pf tones. A quest carries one so its icon tile identifies it at a glance. */
export type QuestTone = 'azure' | 'amber' | 'emerald' | 'rose' | 'violet' | 'slate';

/** Canonical order — selection rotates within it, display always follows it. */
export const QUEST_ORDER: QuestId[] = [
  'review',
  'lessons',
  'unit-quiz',
  'daily-challenge',
  'exam-paper',
];

/** At most this many quests a day. Three is the mockups' count. */
export const MAX_DAILY_QUESTS = 3;

/** Resolve up to this many missed questions — fewer when fewer are owed. */
export const REVIEW_QUEST_TARGET = 3;

/** Lessons to move up a rung. */
export const LESSON_QUEST_TARGET = 2;

/**
 * XP per quest, deliberately small.
 *
 * For scale, from triviaService: one arcade round pays up to 50 (`computeGameXp`
 * caps at 40 + 10 for a perfect run) and is infinitely repeatable; a ten-question
 * Daily Challenge pays 100–175 (`computeXpEarned`: 10 a correct answer, +25
 * perfect, +50 daily bonus). Level 2 costs 100 XP and the curve is triangular.
 *
 * The three costliest quests are 20 each, so a day of quests tops out at
 * MAX_QUEST_XP_PER_DAY = 60 — about one good arcade round, for real study work
 * that the arcade's cap exists precisely to stop people farming. The Daily
 * Challenge quest is 10, because the challenge already pays its own bonus and
 * this must be a nudge, not a second salary for the same act.
 */
export const QUEST_XP: Record<QuestId, number> = {
  review: 20,
  lessons: 20,
  'unit-quiz': 15,
  'daily-challenge': 10,
  'exam-paper': 20,
};

export const QUEST_TONE: Record<QuestId, QuestTone> = {
  review: 'amber',
  lessons: 'azure',
  'unit-quiz': 'violet',
  'daily-challenge': 'emerald',
  'exam-paper': 'rose',
};

/** The most a student can earn from quests in one day. Asserted by a test. */
export const MAX_QUEST_XP_PER_DAY = 60;

/** What the app knows about this student, today. Every field is read, not invented. */
export type QuestObservations = {
  /** Local calendar day, from `dayKey` — the streak's day, by construction. */
  day: string;
  /** Seeds the rotation. Only its bytes are used. */
  uid: string;
  /** users/{uid}/mastery/review — the shared missed-question map. */
  review: ReviewMap;
  /** users/{uid}/mastery/lessons — the ONE shared mastery document. */
  mastery: ProgressMap;
  /** `attemptedAtMs` of recent rows of users/{uid}/quizAttempts. */
  quizAttemptTimes: number[];
  /** `updated_at_ms` of recent rows of users/{uid}/examAttempts. */
  examAttemptTimes: number[];
  /** triviaService.getDailyChallengeState(profile, day).completedToday. */
  dailyChallengeDone: boolean;
  /** trackConfig.gradeProfile().examLevel — null when papers are not this grade's errand. */
  examLevel: string | null;
  /** Quest ids already paid for today, from the gamification profile. */
  claimed: QuestId[];
};

export type DailyQuest = {
  id: QuestId;
  tone: QuestTone;
  xp: number;
  /** How far along, counted from the records above. */
  done: number;
  target: number;
  complete: boolean;
  /** True once the XP has actually been added to the profile. */
  claimed: boolean;
};

// ─── Counting what happened today ───────────────────────────────────────────

/**
 * Missed questions the student put right today.
 *
 * `correctAt` inside the day, and not overtaken by a later `missedAt` — a
 * question answered right this morning and missed again this afternoon is due
 * again, and utils/review.isDue is the authority on that, so this mirrors it
 * rather than inventing a second rule.
 */
export function countResolvedToday(review: ReviewMap, day: string): number {
  const { start, end } = dayBounds(day);
  let n = 0;
  for (const entry of Object.values(review || {})) {
    const at = entry?.correctAt;
    if (typeof at !== 'number' || at < start || at >= end) continue;
    if ((entry?.missedAt ?? 0) > at) continue;
    n += 1;
  }
  return n;
}

/** Questions still owed — the same predicate utils/review.isDue uses. */
export function countDue(review: ReviewMap): number {
  let n = 0;
  for (const entry of Object.values(review || {})) {
    if (!entry?.missedAt) continue;
    if (!entry.correctAt || entry.missedAt > entry.correctAt) n += 1;
  }
  return n;
}

/**
 * Lessons that moved up a rung today.
 *
 * `levelUpAt` is stamped by shared/mastery on every promotion and `masteredAt`
 * when a chapter test confirms the top rung; the later of the two is when the
 * lesson last actually advanced.
 */
export function countLessonsAdvancedToday(mastery: ProgressMap, day: string): number {
  const { start, end } = dayBounds(day);
  let n = 0;
  for (const rec of Object.values(mastery || {})) {
    const at = Math.max(rec?.levelUpAt ?? 0, rec?.masteredAt ?? 0);
    if (at >= start && at < end) n += 1;
  }
  return n;
}

/** How many of these epoch-ms stamps fall inside the day. */
export function countInDay(times: number[], day: string): number {
  const { start, end } = dayBounds(day);
  let n = 0;
  for (const t of times || []) {
    if (typeof t === 'number' && t >= start && t < end) n += 1;
  }
  return n;
}

// ─── Choosing the day's set ─────────────────────────────────────────────────

/**
 * FNV-1a over the day and the student. Two students see different sets on the
 * same day, one student sees a stable set all day, and a given pair always
 * produces the same answer — which is what makes this testable at all.
 */
export function questSeed(day: string, uid: string): number {
  let h = 0x811c9dc5;
  const s = `${day}|${uid}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * How many review questions this student had to work with TODAY: the ones
 * still owed plus the ones they have already put right since midnight.
 *
 * That sum is what makes the review quest stable. Availability keyed on the
 * due count alone would delete the quest at the moment it was finished —
 * the student resolves their last owed question, `countDue` drops to 0, and
 * the card they just completed vanishes off the page.
 */
function reviewBasis(obs: QuestObservations): number {
  return countDue(obs.review) + countResolvedToday(obs.review, obs.day);
}

function isAvailable(id: QuestId, obs: QuestObservations): boolean {
  switch (id) {
    // Nothing to review is a good thing, not a quest.
    case 'review':
      return reviewBasis(obs) > 0;
    // Official papers are a grade's errand or they are not (trackConfig).
    case 'exam-paper':
      return !!obs.examLevel;
    default:
      return true;
  }
}

/**
 * The ids to show today, in canonical order.
 *
 * Two things are pinned rather than rotated. The review quest, when the student
 * has missed questions waiting, because it points at their own work and a
 * generic mission cannot beat that. And anything already PAID today, because a
 * quest that pays 20 XP and then disappears would read as a bug.
 */
export function selectQuestIds(obs: QuestObservations): QuestId[] {
  const paid = new Set<QuestId>((obs.claimed || []).filter((id) => QUEST_ORDER.includes(id)));
  const available = QUEST_ORDER.filter((id) => paid.has(id) || isAvailable(id, obs));

  const pinned = available.filter((id) => id === 'review' || paid.has(id));
  const rest = available.filter((id) => !pinned.includes(id));

  const chosen = pinned.slice(0, MAX_DAILY_QUESTS);
  const slots = MAX_DAILY_QUESTS - chosen.length;
  if (slots > 0 && rest.length > 0) {
    const start = questSeed(obs.day, obs.uid) % rest.length;
    for (let i = 0; i < slots && i < rest.length; i++) {
      chosen.push(rest[(start + i) % rest.length]);
    }
  }

  const set = new Set(chosen);
  return QUEST_ORDER.filter((id) => set.has(id));
}

/** How far along one quest is, and how far it has to go. */
export function questProgress(id: QuestId, obs: QuestObservations): { done: number; target: number } {
  switch (id) {
    case 'review':
      return {
        done: countResolvedToday(obs.review, obs.day),
        // Never ask for more questions than the student actually owes.
        target: Math.max(1, Math.min(REVIEW_QUEST_TARGET, reviewBasis(obs))),
      };
    case 'lessons':
      return {
        done: countLessonsAdvancedToday(obs.mastery, obs.day),
        target: LESSON_QUEST_TARGET,
      };
    case 'unit-quiz':
      return { done: countInDay(obs.quizAttemptTimes, obs.day), target: 1 };
    case 'daily-challenge':
      return { done: obs.dailyChallengeDone ? 1 : 0, target: 1 };
    case 'exam-paper':
      return { done: countInDay(obs.examAttemptTimes, obs.day), target: 1 };
    default:
      return { done: 0, target: 1 };
  }
}

/** Today's quests, with their real progress. Pure in `obs`. */
export function buildDailyQuests(obs: QuestObservations): DailyQuest[] {
  const paid = new Set<QuestId>((obs.claimed || []).filter((id) => QUEST_ORDER.includes(id)));
  return selectQuestIds(obs).map((id) => {
    const { done, target } = questProgress(id, obs);
    return {
      id,
      tone: QUEST_TONE[id],
      xp: QUEST_XP[id],
      done: Math.min(done, target),
      target,
      // A paid quest stays complete even if the underlying record later moves
      // (a resolved question missed again this evening, say). We already said
      // it was done, and we already paid for it.
      complete: paid.has(id) || done >= target,
      claimed: paid.has(id),
    };
  });
}

/** Quests finished but not yet paid — what the caller should send to claimQuestXp. */
export function unclaimedQuests(quests: DailyQuest[]): DailyQuest[] {
  return quests.filter((q) => q.complete && !q.claimed);
}

/** XP already banked from today's quests. */
export function claimedXp(quests: DailyQuest[]): number {
  return quests.reduce((n, q) => n + (q.claimed ? q.xp : 0), 0);
}

/** XP still on the table today. */
export function remainingXp(quests: DailyQuest[]): number {
  return quests.reduce((n, q) => n + (q.claimed ? 0 : q.xp), 0);
}
