/**
 * Adaptive Behavioral Engine — pure signal derivation
 * ────────────────────────────────────────────────────
 * Reads a learner's attempt history (the immutable `users/{uid}/quizAttempts`
 * log, plus optional review state) and derives a single `LearnerSignals` object
 * that the rest of the app consumes: adaptive question selection, a spaced-
 * repetition review queue, and stall detection.
 *
 * Like `readinessService`, this module is intentionally PURE — no Firebase, no
 * React, no clock beyond an injectable `now` — so it can be unit-tested against
 * fixture logs and reused on the server. Callers (a `useAdaptiveSignals` hook)
 * assemble the inputs from Firestore and pass them in.
 *
 * Spec: docs/ADAPTIVE_ENGINE.md
 *
 * SLICE 1 (this file): derive ability, velocity, stall, and the review queue.
 * Ships dark — nothing is surfaced yet. Difficulty adjustment of `ability`
 * (Pillar A, crowd item p-values) plugs into `abilityFromAttempts` in Slice 3;
 * until then ability is the EWMA of raw percentages.
 *
 * Public API:
 *   • deriveSignals(attempts, opts)        → LearnerSignals
 *   • abilityFromAttempts(attempts)        → subject → 0–100 skill (EWMA)
 *   • velocityFromAttempts(attempts)       → subject → points/week slope
 *   • dueReviews(reviewState, now)         → ReviewItem[] (overdue, prioritized)
 *   • detectStall(attempts, opts)          → StallStatus | null
 */

// ─── Tunables ───────────────────────────────────────────────────────────────
// Every threshold here is a product decision, not a magic constant — kept in one
// block so an A/B or tuning pass touches exactly one place. See spec §6, §10.

/** EWMA weight for the newest attempt when estimating current ability.
 * 0.5 keeps the estimate tracking current state (newest weighted most) while
 * still smoothing single-attempt noise — a rising learner must out-rank a
 * falling one over the same scores. */
const EWMA_ALPHA = 0.5;
/** Window (attempts, newest-first) used for velocity + stall trend signals. */
const TREND_WINDOW = 8;
/** Below this weekly slope (points/week), a subject counts as "declining". */
const DECLINE_SLOPE = -8;
/** Minimum attempts in a subject before its velocity is trusted. */
const DECLINE_MIN_ATTEMPTS = 4;
/** A quiz scored under this % counts as a "fail" for repeat-fail detection. */
const REPEAT_FAIL_PCT = 50;
/** Consecutive fails on the SAME quiz that trip the repeat-fail wall. */
const REPEAT_FAIL_COUNT = 3;
/** Days of silence (from a previously-active learner) that trip re-engagement. */
const INACTIVITY_DAYS = 4;
/** Active streak length worth protecting with an evening nudge. */
const STREAK_AT_RISK_MIN = 3;
/** Score flat/down but time up by this fraction vs. baseline = time inflation. */
const TIME_INFLATION_RATIO = 1.4;
/** No signals — and never a nudge — before the learner has this many attempts. */
export const MIN_ATTEMPTS_FOR_SIGNALS = 10;
/** Target success window: too easy → boredom, too hard → despair. Spec §4. */
export const DEFAULT_CHALLENGE_BAND = { min: 0.75, max: 0.82 };

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

// ─── Types ──────────────────────────────────────────────────────────────────

/** One answered quiz/trivia/exam round, normalized (caller attaches `subject`). */
export interface AttemptEvent {
  subject: string;        // normalized subject; '' if unknown
  quizId: string;
  percentage: number;     // 0–100
  timeSpent: number;      // seconds (0 if not captured)
  attemptedAtMs: number;  // epoch ms
}

/** SM-2 review record for one (subject|topic) or quiz key. Written in Slice 2. */
export interface ReviewStateEntry {
  key: string;
  subject?: string;
  interval: number;
  ease: number;
  repetitions: number;
  nextReviewMs: number;
  coefficient?: number;
}

/** A review that is due now, priority-sorted (most overdue × coefficient first). */
export interface ReviewItem {
  key: string;
  subject?: string;
  overdueDays: number;
  coefficient: number;
  priority: number;
}

export type StallTrigger =
  | 'inactivity'
  | 'repeat-fail'
  | 'decline'
  | 'streak-at-risk'
  | 'time-inflation';

export type StallIntervention =
  | 'reengage'
  | 'switch-topic'
  | 'warm-up'
  | 'protect-streak'
  | 'watch-lesson';

/** A single, mildest-matching intervention suggestion. Never blocking UI. */
export interface StallStatus {
  trigger: StallTrigger;
  intervention: StallIntervention;
  subject?: string;
  quizId?: string;
  /** Short machine-readable reason; UI/Sandra localize the message. */
  detail: string;
}

export interface LearnerSignals {
  ability: Record<string, number>;   // subject → latent skill 0–100
  velocity: Record<string, number>;  // subject → points/week (<0 = declining)
  reviewQueue: ReviewItem[];
  stall: StallStatus | null;
  challengeBand: { min: number; max: number };
  totalAttempts: number;
  /** False until the learner clears MIN_ATTEMPTS_FOR_SIGNALS — hold all nudges. */
  hasEnoughData: boolean;
  updatedAtMs: number;
}

export interface DeriveOptions {
  coefficients?: Record<string, number>;
  reviewState?: ReviewStateEntry[];
  currentStreak?: number;
  now?: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function clampPct(n: number): number {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function byTimeAsc(a: AttemptEvent, b: AttemptEvent): number {
  return (a.attemptedAtMs || 0) - (b.attemptedAtMs || 0);
}

/** Group valid attempts by subject, each list sorted oldest → newest. */
function groupBySubject(attempts: AttemptEvent[]): Record<string, AttemptEvent[]> {
  const out: Record<string, AttemptEvent[]> = {};
  for (const a of attempts || []) {
    if (!a || typeof a.attemptedAtMs !== 'number') continue;
    const subj = a.subject || 'Autre';
    (out[subj] ||= []).push(a);
  }
  for (const subj of Object.keys(out)) out[subj].sort(byTimeAsc);
  return out;
}

/**
 * Least-squares slope of pct against time-in-weeks over the recent window.
 * Returns points/week. Needs ≥ 2 distinct timestamps or returns 0 (flat).
 */
function weeklySlope(window: AttemptEvent[]): number {
  if (!window || window.length < 2) return 0;
  const t0 = window[0].attemptedAtMs;
  const xs = window.map((a) => (a.attemptedAtMs - t0) / WEEK_MS);
  const ys = window.map((a) => clampPct(a.percentage));
  const n = xs.length;
  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den === 0) return 0; // all attempts same instant
  return num / den;
}

// ─── Pillar-level derivations ───────────────────────────────────────────────

/**
 * Per-subject latent ability (0–100) as an EWMA of recent percentages, newest
 * weighted most. Slice 3 will pre-adjust each percentage by item difficulty
 * (a correct answer on a hard item counts for more) before this runs — the
 * shape stays the same, only the inputs get sharper.
 */
export function abilityFromAttempts(attempts: AttemptEvent[]): Record<string, number> {
  const bySubject = groupBySubject(attempts);
  const out: Record<string, number> = {};
  for (const [subj, list] of Object.entries(bySubject)) {
    let ewma: number | null = null;
    for (const a of list) {
      const pct = clampPct(a.percentage);
      ewma = ewma == null ? pct : EWMA_ALPHA * pct + (1 - EWMA_ALPHA) * ewma;
    }
    if (ewma != null) out[subj] = Math.round(ewma);
  }
  return out;
}

/** Per-subject score trend in points/week over the recent window. */
export function velocityFromAttempts(attempts: AttemptEvent[]): Record<string, number> {
  const bySubject = groupBySubject(attempts);
  const out: Record<string, number> = {};
  for (const [subj, list] of Object.entries(bySubject)) {
    const window = list.slice(-TREND_WINDOW);
    out[subj] = Math.round(weeklySlope(window) * 10) / 10;
  }
  return out;
}

/** Overdue reviews, most-overdue × coefficient first. Empty until Slice 2. */
export function dueReviews(reviewState: ReviewStateEntry[] = [], now: number): ReviewItem[] {
  const items: ReviewItem[] = [];
  for (const r of reviewState || []) {
    if (!r || typeof r.nextReviewMs !== 'number') continue;
    if (r.nextReviewMs > now) continue;
    const overdueDays = Math.max(0, (now - r.nextReviewMs) / DAY_MS);
    const coefficient = r.coefficient && r.coefficient > 0 ? r.coefficient : 1;
    items.push({
      key: r.key,
      subject: r.subject,
      overdueDays: Math.round(overdueDays * 10) / 10,
      coefficient,
      priority: Math.round((overdueDays + 1) * coefficient * 100) / 100,
    });
  }
  return items.sort((a, b) => b.priority - a.priority);
}

/**
 * Classify the mildest applicable stall, or null when healthy. Ordered so the
 * gentlest positive nudge (protect a streak) is preferred over heavier ones,
 * and a hard wall (repeat-fail) is never masked by a softer signal.
 *
 * Priority: repeat-fail → decline → time-inflation → inactivity → streak-at-risk.
 */
export function detectStall(attempts: AttemptEvent[], opts: DeriveOptions = {}): StallStatus | null {
  const now = opts.now ?? 0;
  const sorted = [...(attempts || [])].filter((a) => a && typeof a.attemptedAtMs === 'number').sort(byTimeAsc);
  if (sorted.length < MIN_ATTEMPTS_FOR_SIGNALS) return null;

  // 1) Repeat-fail wall: same quiz failed on its last N consecutive attempts.
  const byQuiz: Record<string, AttemptEvent[]> = {};
  for (const a of sorted) (byQuiz[a.quizId] ||= []).push(a);
  for (const [quizId, list] of Object.entries(byQuiz)) {
    const recent = list.slice(-REPEAT_FAIL_COUNT);
    if (recent.length >= REPEAT_FAIL_COUNT && recent.every((a) => clampPct(a.percentage) < REPEAT_FAIL_PCT)) {
      return {
        trigger: 'repeat-fail',
        intervention: 'switch-topic',
        subject: recent[recent.length - 1].subject || undefined,
        quizId,
        detail: `failed ${REPEAT_FAIL_COUNT}x consecutively on ${quizId}`,
      };
    }
  }

  // 2) Declining subject: negative weekly slope over enough attempts.
  const bySubject = groupBySubject(sorted);
  for (const [subj, list] of Object.entries(bySubject)) {
    if (list.length < DECLINE_MIN_ATTEMPTS) continue;
    const slope = weeklySlope(list.slice(-TREND_WINDOW));
    if (slope < DECLINE_SLOPE) {
      return {
        trigger: 'decline',
        intervention: 'warm-up',
        subject: subj,
        detail: `slope ${Math.round(slope)}/wk over ${Math.min(list.length, TREND_WINDOW)} attempts`,
      };
    }
  }

  // 3) Time inflation: same quiz, time up ≥ ratio vs. baseline, score not up.
  for (const [quizId, list] of Object.entries(byQuiz)) {
    if (list.length < 2) continue;
    const withTime = list.filter((a) => a.timeSpent > 0);
    if (withTime.length < 2) continue;
    const baseline = withTime[0].timeSpent;
    const last = withTime[withTime.length - 1];
    if (baseline > 0 && last.timeSpent >= baseline * TIME_INFLATION_RATIO
      && clampPct(last.percentage) <= clampPct(withTime[0].percentage)) {
      return {
        trigger: 'time-inflation',
        intervention: 'watch-lesson',
        subject: last.subject || undefined,
        quizId,
        detail: `time ${Math.round(last.timeSpent / baseline * 100)}% of baseline, score flat/down`,
      };
    }
  }

  // 4) Inactivity: previously-active learner gone quiet.
  const lastMs = sorted[sorted.length - 1].attemptedAtMs;
  const daysSince = (now - lastMs) / DAY_MS;
  if (daysSince >= INACTIVITY_DAYS) {
    return {
      trigger: 'inactivity',
      intervention: 'reengage',
      detail: `${Math.round(daysSince)}d since last activity`,
    };
  }

  // 5) Streak at risk: worth protecting, no activity today.
  if ((opts.currentStreak ?? 0) >= STREAK_AT_RISK_MIN && daysSince >= 1) {
    return {
      trigger: 'streak-at-risk',
      intervention: 'protect-streak',
      detail: `streak ${opts.currentStreak}, no activity today`,
    };
  }

  return null;
}

// ─── Pillar A — adaptive difficulty ─────────────────────────────────────────
// v1 works off the item's authored difficulty (exams carry 1–5). Slice 3b will
// replace that scalar with a crowd-calibrated p-value from questionStats — only
// the *input* to predictedSuccess sharpens; the selection shape below is stable.

/** Each difficulty step away from average (3) shifts predicted success by this. */
const DIFFICULTY_SLOPE = 0.12;

/**
 * Predicted success probability (0–1) for a learner of `ability` (0–100) on an
 * item of `difficulty` (1–5). At average difficulty (3) success ≈ ability/100;
 * harder items lower it, easier ones raise it. A deliberately simple monotonic
 * model — enough to rank a pool by challenge fit.
 */
export function predictedSuccess(ability: number, difficulty: number): number {
  const a = Math.max(0, Math.min(1, (ability || 0) / 100));
  const d = Math.max(1, Math.min(5, typeof difficulty === 'number' ? difficulty : 3));
  return Math.max(0, Math.min(1, a - DIFFICULTY_SLOPE * (d - 3)));
}

/**
 * Order a pool by how well each item fits the learner's challenge band. Items
 * whose predicted success lands inside [band.min, band.max] rank first (closest
 * to band centre wins); ties break toward harder items so a confident learner
 * keeps being stretched. Cold start (no ability estimate) falls back to easiest-
 * first (spec §4). Pure; items need only an optional numeric `difficulty` (1–5).
 */
export function selectAdaptiveItems<T extends { difficulty?: number }>(
  pool: T[],
  opts: { ability: number; band?: { min: number; max: number } },
): T[] {
  const list = pool || [];
  // Cold start: without an ability estimate, serve easiest → hardest.
  if (!(opts.ability > 0)) {
    return [...list].sort((x, y) => (x.difficulty ?? 3) - (y.difficulty ?? 3));
  }
  const band = opts.band ?? DEFAULT_CHALLENGE_BAND;
  const centre = (band.min + band.max) / 2;
  const scored = list.map((item, i) => {
    const p = predictedSuccess(opts.ability, item.difficulty ?? 3);
    return { item, i, inBand: p >= band.min && p <= band.max, dist: Math.abs(p - centre), diff: item.difficulty ?? 3 };
  });
  scored.sort((a, b) =>
    (Number(b.inBand) - Number(a.inBand)) ||
    (a.dist - b.dist) ||
    (b.diff - a.diff) ||
    (a.i - b.i),
  );
  return scored.map((s) => s.item);
}

// ─── Public entry point ─────────────────────────────────────────────────────

/**
 * Derive the full signal set from an attempt log. Deterministic given `now`.
 * Everything downstream reads this object; nothing else re-reads raw history.
 */
export function deriveSignals(attempts: AttemptEvent[] = [], opts: DeriveOptions = {}): LearnerSignals {
  const now = opts.now ?? 0;
  const valid = (attempts || []).filter((a) => a && typeof a.attemptedAtMs === 'number');
  const hasEnoughData = valid.length >= MIN_ATTEMPTS_FOR_SIGNALS;

  return {
    ability: abilityFromAttempts(valid),
    velocity: velocityFromAttempts(valid),
    reviewQueue: dueReviews(opts.reviewState, now),
    // Hold ALL nudges until the learner has a real history (spec §10 decision).
    stall: hasEnoughData ? detectStall(valid, opts) : null,
    challengeBand: { ...DEFAULT_CHALLENGE_BAND },
    totalAttempts: valid.length,
    hasEnoughData,
    updatedAtMs: now,
  };
}
