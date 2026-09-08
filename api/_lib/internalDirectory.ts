/**
 * internalDirectory — the pure logic behind api/internal/*.
 * ---------------------------------------------------------------------------
 * Everything here is state-in / state-out: no Firestore, no network, no env.
 * The endpoints do the I/O and delegate every decision to these functions, the
 * same split api/_lib/dailyNudge.ts and api/_lib/emailPersonalization.ts use.
 *
 * ── What "top performer" means here, and why ───────────────────────────────
 * The licences these rankings hand out are worth real money, so the ranking
 * signal has to be something a learner can only get by learning.
 *
 * REJECTED: leaderboard XP (`leaderboards/{period}/entries/{uid}.xp`, mirrored on
 * `users/{uid}/gamification/profile.xp`). It is the number this product shows
 * publicly, so it is the obvious candidate — and it is the wrong one. XP comes
 * almost entirely from the trivia and arcade loop: `computeXpEarned` in
 * src/services/triviaService.ts pays 10 XP per correct answer with no per-round
 * or per-day cap on web, and `computeGameXp` pays up to 50 XP per arcade round
 * which the code itself describes as infinitely repeatable. Curriculum work
 * earns ZERO leaderboard XP (course work accrues a separate `totalPoints` that
 * never reaches the board). Ranking on XP would rank patience at a trivia
 * screen. The live data agrees: the top XP holder has 10,410 XP, ~3x the
 * runner-up, and no completed coursework at all.
 *
 * ALSO REJECTED: streaks (`users/{uid}/streaks/global`) — `recordActivity`
 * fires on any action, so a streak measures showing up, not learning; and
 * `progress/{courseId}.completedLessons`, which is set at a 60% quiz score and
 * whose legacy entries came from merely watching a video.
 *
 * CHOSEN: a "verified learning score" — the sum, over things the learner
 * demonstrably finished, of how well they did on each. Two sources:
 *
 *   1. Lessons at `familiar` or better in the platform's own mastery ledger
 *      (`users/{uid}/mastery/lessons`, scored by shared/mastery.ts). Mastery is
 *      monotonic and best-ever, so repetition can only raise it as far as what
 *      the learner actually knows; `mastered` additionally requires getting
 *      every question drawn from that lesson right in a whole-unit chapter
 *      test, which is not grindable. Best scores from the immutable
 *      `users/{uid}/quizAttempts` log are folded in on the same per-lesson key
 *      (a quizId IS a lesson id, e.g. `MATH-NSIV-U3-L1`), taking the max, so a
 *      lesson is credited once however many stores recorded it.
 *   2. Past Bac exam papers the learner genuinely sat
 *      (`users/{uid}/examResults/{examId}.summary`), scored on
 *      `summary.percentage`.
 *
 * Both sources are put on the same 0–10 scale — the platform's own per-lesson
 * mastery points divided by ten (mastered 10, proficient 8, familiar 5) and the
 * exam percentage divided by ten — so one perfect item is worth 10 whatever
 * kind of item it is, and `score` reads as "roughly how many items' worth of
 * verified learning". `completedCount` is the plain count of those items.
 *
 * `seen` lessons are deliberately excluded: `lessonMastery` grants `seen` for a
 * video watched or an exercise merely attempted, which is activity, not
 * learning, and it is the level a farmer would sit at.
 */
import {
  lessonMastery,
  MASTERY_POINTS,
  type LessonProgress,
  type MasteryLevel,
} from '../../shared/mastery';

// ─── Person shape (the cross-platform contract) ─────────────────────────────

/** The person shape apply consumes, minus the ranking fields. */
export interface InternalPerson {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  completedCount: number | null;
  lastActiveAt: string | null;
  countryHint: string | null;
  profileUrl: string | null;
}

/** A ranked person: the same shape plus where they placed. */
export interface InternalPerformer extends InternalPerson {
  score: number;
  rank: number;
}

/** Canonical origin — src/index.html's `rel=canonical` / Firebase authDomain. */
export const ACADEMY_ORIGIN = 'https://academy.edlight.org';

/** Admin-only learner page (src/App.tsx → /admin/users/:uid, admin-gated). */
export function profileUrlFor(uid: string): string | null {
  return uid ? `${ACADEMY_ORIGIN}/admin/users/${encodeURIComponent(uid)}` : null;
}

// ─── Identity keys (mirrors the admissions platform) ────────────────────────
// The admissions platform normalises a candidate's identity into emailKey /
// nameSortKey / phoneKey before asking, and compares the answer on those same
// keys. These implementations mirror its src/lib/duplicate-referral-matching.ts
// byte for byte in behaviour; changing one without the other silently stops
// deduplicating. They are deliberately duplicated rather than shared: the two
// systems have no common package, and a wrong-but-quiet key is worse than a
// copy with this comment on it.

function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Placeholders coordinators type when a student has no address. */
const PLACEHOLDER_EMAIL_LOCALS = new Set([
  'na', 'n-a', 'none', 'nil', 'no', 'noemail', 'no-email', 'nomail',
  'sansemail', 'sans-email', 'aucun', 'unknown', 'inconnu', 'test', 'tbd', 'xxx',
]);

const PLACEHOLDER_EMAIL_DOMAINS = new Set([
  'example.com', 'example.org', 'example.net', 'test.com', 'none.com',
  'noemail.com', 'nomail.com', 'aucun.com',
]);

/**
 * Lower-cased, trimmed email. '' for anything not email-shaped and for the
 * placeholder addresses — two learners both down as "none@none.com" are not
 * the same learner, and merging them is exactly the false match to avoid.
 */
export function emailKey(value: unknown): string {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized)) return '';
  const [local, domain] = normalized.split('@');
  if (PLACEHOLDER_EMAIL_LOCALS.has(local)) return '';
  if (PLACEHOLDER_EMAIL_DOMAINS.has(domain)) return '';
  return normalized;
}

/** Titles a form may carry. Multi-character only: a bare "M" is an initial. */
const NAME_NOISE_TOKENS = new Set([
  'mr', 'mrs', 'ms', 'miss', 'mme', 'mlle', 'mons', 'monsieur', 'madame',
  'dr', 'prof', 'me',
]);

/** Accents folded, punctuation to space: "Jean-Baptiste" meets "Jean Baptiste". */
export function normalizeName(value: unknown): string {
  return stripDiacritics(String(value ?? ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The name tokens that carry identity; single letters (initials) dropped. */
export function nameTokens(value: unknown): string[] {
  return normalizeName(value)
    .split(' ')
    .filter((token) => token.length > 1 && !NAME_NOISE_TOKENS.has(token));
}

/**
 * Tokens sorted, so given/family order stops mattering — Haitian forms are
 * filled both ways round ("Pierre Jean Baptiste" / "Jean Baptiste Pierre").
 */
export function nameSortKey(value: unknown): string {
  return [...nameTokens(value)].sort().join(' ');
}

/**
 * Is this name distinctive enough to match on at all? One token never is — a
 * lone "Pierre" must not collide with every other Pierre in the database.
 */
export function isNameUsable(value: unknown): boolean {
  const tokens = nameTokens(value);
  return tokens.length >= 2 && tokens.join('').length >= 5;
}

/**
 * Digits only, keeping the last 8 — a Haitian subscriber number's length, so
 * "+509 3712 3456", "509-37123456" and "37123456" agree. Under 7 digits is not
 * a phone number and is discarded.
 */
export function phoneKey(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length < 7) return '';
  return digits.length > 8 ? digits.slice(-8) : digits;
}

// ─── countryHint ────────────────────────────────────────────────────────────

/**
 * Haiti's ten départements, as offered by the leaderboard profile picker
 * (src/data/haitiGeo.ts — the source of truth; these are folded copies for
 * matching). The picker's eleventh option is "Diaspora / Étranger", which says
 * only "not in Haiti" and names no country, so it yields null rather than a
 * guess.
 */
const HAITI_DEPARTMENT_KEYS = new Set([
  'artibonite', 'centre', "grand'anse", 'grandanse', 'nippes', 'nord',
  'nord-est', 'nord-ouest', 'ouest', 'sud', 'sud-est',
]);

/**
 * ISO-3166 alpha-2 hint, or null. SELF-DECLARED ONLY.
 *
 * The only location this platform holds is what a learner optionally typed into
 * the public-leaderboard profile form: a `département` chosen from a fixed
 * picklist, plus a free-text `city`. There is no country field anywhere, and
 * nothing is inferred from IP or timezone — nor is it inferred here, because a
 * request's IP belongs to whoever is reading the ranking, not to the learner.
 *
 * Only the département is trusted. `city` is free text with an "Autre ville…"
 * escape hatch and the live data contains "New York" alongside three spellings
 * of Port-au-Prince, so a city-based guess would both invent Haitians and
 * mislabel diaspora learners.
 */
export function countryHintFor(department?: string | null): string | null {
  const key = stripDiacritics(String(department ?? '')).trim().toLowerCase();
  if (!key) return null;
  return HAITI_DEPARTMENT_KEYS.has(key) ? 'HT' : null;
}

// ─── Opting out of being ranked ─────────────────────────────────────────────

/**
 * Has this learner asked not to be ranked publicly?
 *
 * Two flags, because the product writes two. Profile → "Classement public"
 * calls `setBoardVisibility` (→ `hidden` on the weekly AND all-time entries)
 * and `setLeaderboardOptIn` (→ `leaderboard.optedIn` on the gamification
 * profile) together; the award endpoint honours the first, the UI reads the
 * second. Either one saying no is taken as no.
 *
 * `optedIn === false` counts ONLY when a leaderboard entry exists, and that
 * qualification matters: `false` is also the never-touched default of
 * `defaultTriviaProfile()` on web, so treating it as a choice on its own would
 * silently exclude nearly everyone, including learners who have never seen the
 * toggle. An entry, by contrast, is only ever created for someone who was on
 * the board — so `optedIn === false` alongside one is a revocation. In the live
 * data this distinction is the difference between honouring one real opt-out
 * and dropping 85 people who never expressed a preference.
 *
 * This is a hiding-from-a-public-board choice being applied to a private
 * admin list, which is stricter than the learner asked for. That is the
 * intended direction: a learner who has said "don't rank me" should not be
 * routed around because the ranking happens to be internal this time.
 */
export function isOptedOutOfRanking(input: {
  entryExists: boolean;
  entryHidden?: boolean | null;
  optedIn?: boolean | null;
}): boolean {
  if (input.entryHidden === true) return true;
  return input.entryExists && input.optedIn === false;
}

// ─── The learning score ─────────────────────────────────────────────────────

/** One graded exam paper, as read from `users/{uid}/examResults/{examId}`. */
export interface ExamEvidence {
  /** `summary.percentage` — the graded score, 0–100. */
  percentage: number;
  /** Questions the learner actually answered (correct + incorrect + manual). */
  answered: number;
  /** `summary.unanswered`. */
  unanswered: number;
  /** `submitted_at_ms` (or `created_at_ms`), epoch ms. */
  atMs: number | null;
}

export interface LearningEvidence {
  /** `users/{uid}/mastery/lessons` → the `lessons` map. */
  masteryLessons: Record<string, LessonProgress | undefined>;
  /** Best percentage per quizId, from `users/{uid}/quizAttempts`. */
  quizBestPct: Record<string, number>;
  /** Graded papers from `users/{uid}/examResults`. */
  exams: ExamEvidence[];
}

export function emptyEvidence(): LearningEvidence {
  return { masteryLessons: {}, quizBestPct: {}, exams: [] };
}

/** Below `familiar` is activity, not learning, so it earns nothing. */
const COUNTED_LEVELS: MasteryLevel[] = ['familiar', 'proficient', 'mastered'];

/**
 * A paper only counts if the learner answered at least half of it.
 *
 * Without this, an exam opened and abandoned still lands in `examResults` with
 * a graded `summary` — the live data holds papers with 128 of 141 questions
 * unanswered — and would read as a finished exam. Half is a deliberately
 * forgiving line: in the live data it separates seven genuine sittings
 * (50–78% answered) from fourteen abandoned ones (0–38%) with nothing near it.
 */
export const MIN_ANSWERED_FRACTION = 0.5;

export function examWasSat(exam: ExamEvidence): boolean {
  if (!Number.isFinite(exam.percentage)) return false;
  const answered = Math.max(0, exam.answered);
  const questions = answered + Math.max(0, exam.unanswered);
  if (questions <= 0) return false;
  return answered / questions >= MIN_ANSWERED_FRACTION;
}

export interface LearningScore {
  score: number;
  completedCount: number;
}

/**
 * Verified learning score, and the count of items behind it.
 *
 * Each finished item contributes 0–10: a lesson its mastery points over ten
 * (familiar 5, proficient 8, mastered 10), a sat exam its percentage over ten.
 * Lessons are keyed once across both stores — the mastery ledger's `bestPct`
 * and the best `quizAttempts` percentage for the same lesson id are max'd, not
 * added, so recording the same work twice cannot pay twice.
 */
export function scoreLearning(evidence: LearningEvidence): LearningScore {
  const lessonIds = new Set([
    ...Object.keys(evidence.masteryLessons || {}),
    ...Object.keys(evidence.quizBestPct || {}),
  ]);

  let score = 0;
  let completedCount = 0;

  for (const lessonId of lessonIds) {
    const stored = evidence.masteryLessons?.[lessonId];
    const quizBest = evidence.quizBestPct?.[lessonId];
    const bestPct = Math.max(
      typeof stored?.bestPct === 'number' ? stored.bestPct : -1,
      typeof quizBest === 'number' ? quizBest : -1,
    );
    const merged: LessonProgress = {
      ...(stored || {}),
      ...(bestPct >= 0 ? { bestPct } : {}),
    };
    const level = lessonMastery(merged);
    if (!COUNTED_LEVELS.includes(level)) continue;
    score += MASTERY_POINTS[level] / 10;
    completedCount += 1;
  }

  for (const exam of evidence.exams || []) {
    if (!examWasSat(exam)) continue;
    score += Math.min(100, Math.max(0, exam.percentage)) / 10;
    completedCount += 1;
  }

  // One decimal: enough to order sittings apart, not enough to imply precision
  // the underlying percentages don't have.
  return { score: Math.round(score * 10) / 10, completedCount };
}

// ─── Ranking ────────────────────────────────────────────────────────────────

/** One learner, assembled from Firestore by the endpoint. */
export interface DirectoryRow {
  /** The Firestore uid — stable, and this system's id for the person. */
  id: string;
  /** `users/{uid}.full_name`. */
  fullName?: string | null;
  /** `users/{uid}.email`. */
  email?: string | null;
  /**
   * Never populated: this platform captures no learner phone number. Declared
   * so the phoneKey branch of a lookup is real code the day one is captured,
   * rather than a cast.
   */
  phone?: string | null;
  /** `users/{uid}.last_seen`, epoch ms. */
  lastSeenMs?: number | null;
  /** Self-declared département, from the leaderboard profile. */
  department?: string | null;
  optedOut: boolean;
  evidence: LearningEvidence;
}

export const DEFAULT_LIMIT = 25;
/** Hard ceiling. This endpoint hands out names and emails; it does not bulk-export. */
export const MAX_LIMIT = 200;

export function clampLimit(raw: unknown, fallback = DEFAULT_LIMIT): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, MAX_LIMIT);
}

/** An ISO-8601 instant, or null when absent/unparseable. Never throws. */
export function parseSince(raw: unknown): number | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const ms = Date.parse(raw.trim());
  return Number.isFinite(ms) ? ms : null;
}

function isoOrNull(ms?: number | null): string | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms).toISOString();
}

function trimmedOrNull(value?: string | null): string | null {
  const s = String(value ?? '').trim();
  return s ? s : null;
}

/**
 * The person fields shared by both endpoints.
 *
 * `phone` is always null: this platform captures no phone number for learners
 * anywhere (sign-in is email/Google only), so the field is honestly empty
 * rather than filled from something that isn't a phone number.
 */
export function toPerson(row: DirectoryRow, completedCount: number | null): InternalPerson {
  return {
    id: row.id,
    name: trimmedOrNull(row.fullName),
    email: trimmedOrNull(row.email),
    phone: null,
    completedCount,
    lastActiveAt: isoOrNull(row.lastSeenMs),
    countryHint: countryHintFor(row.department),
    profileUrl: profileUrlFor(row.id),
  };
}

/**
 * Rank learners by verified learning score, descending.
 *
 * Excluded: anyone who opted out of being ranked, and anyone with no verified
 * learning at all. The second exclusion is the point of the endpoint — a
 * licence meant to reward learning should not be offered to someone this
 * platform cannot show finished anything, and returning fewer rows than asked
 * for tells the caller the truth about the size of the eligible pool.
 *
 * `sinceMs` filters on last activity (`users/{uid}.last_seen`), so it means
 * "top performers who are still around since then". It deliberately does NOT
 * re-window the score: most learning evidence here carries no reliable
 * timestamp (a lesson's `bestPct` has none at all), so a windowed score would
 * quietly under-count rather than filter.
 *
 * Ties break on completedCount, then on more recent activity, then on id, so
 * the same data always produces the same order.
 */
export function rankPerformers(
  rows: DirectoryRow[],
  options: { limit?: number; sinceMs?: number | null } = {},
): InternalPerformer[] {
  const limit = clampLimit(options.limit);
  const sinceMs = options.sinceMs ?? null;

  const scored = (rows || [])
    .filter((row) => row && row.id && !row.optedOut)
    .filter((row) => {
      if (sinceMs === null) return true;
      return typeof row.lastSeenMs === 'number' && row.lastSeenMs >= sinceMs;
    })
    .map((row) => ({ row, ...scoreLearning(row.evidence || emptyEvidence()) }))
    .filter((entry) => entry.completedCount > 0 && entry.score > 0);

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.completedCount - a.completedCount ||
      (b.row.lastSeenMs ?? 0) - (a.row.lastSeenMs ?? 0) ||
      a.row.id.localeCompare(b.row.id),
  );

  return scored.slice(0, limit).map((entry, i) => ({
    ...toPerson(entry.row, entry.completedCount),
    score: entry.score,
    rank: i + 1,
  }));
}

// ─── Lookup matching ────────────────────────────────────────────────────────

export interface LookupQuery {
  emailKey?: string;
  nameSortKey?: string;
  phoneKey?: string;
}

/** Hard ceiling on a lookup answer — enough to dedupe, not enough to harvest. */
export const MAX_LOOKUP_RESULTS = 25;

/**
 * Does this learner match any supplied key?
 *
 * "Any that are present" per the contract, so this is a union, not an
 * intersection. Blank keys never match: an absent phone on both sides is not
 * agreement. A name matches only when it is distinctive enough to match on
 * (`isNameUsable`), so a one-word account name can't collide with everyone.
 */
export function rowMatchesLookup(row: DirectoryRow, query: LookupQuery): boolean {
  const wantEmail = String(query.emailKey ?? '').trim().toLowerCase();
  const wantName = String(query.nameSortKey ?? '').trim().toLowerCase();
  const wantPhone = String(query.phoneKey ?? '').trim();

  if (wantEmail && emailKey(row.email) === wantEmail) return true;
  if (wantName && isNameUsable(row.fullName) && nameSortKey(row.fullName) === wantName) return true;
  // Kept for contract parity: no learner phone number is stored here, so this
  // branch cannot fire today. It will the day one is captured.
  if (wantPhone && phoneKey(row.phone) === wantPhone) return true;
  return false;
}

/**
 * Learners matching the query, capped.
 *
 * Rows in, rows out — deliberately not persons: matching only needs the
 * identity fields from the one `users` scan, so the endpoint can then read
 * learning evidence for the handful of matches instead of for everybody.
 */
export function matchStudents(rows: DirectoryRow[], query: LookupQuery): DirectoryRow[] {
  const hasKey = Boolean(
    String(query.emailKey ?? '').trim() ||
    String(query.nameSortKey ?? '').trim() ||
    String(query.phoneKey ?? '').trim(),
  );
  if (!hasKey) return [];

  return (rows || [])
    .filter((row) => row && row.id && rowMatchesLookup(row, query))
    .slice(0, MAX_LOOKUP_RESULTS);
}
