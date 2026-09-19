/**
 * broadcast/rhythm — the arithmetic behind the pre-show and the round rhythm.
 *
 * Every beat in sequences 1–5 and 16 is a function of two numbers the stage
 * already owns: `elapsed` (how long this scene has held the screen) and `now`
 * (the wall clock). None of it needs React, and none of it should live inside
 * a component: a countdown that only exists inside JSX can only be verified by
 * watching a projector at 18:40 on the one night it matters.
 *
 * So the rule for this file is narrow and worth keeping: **anything a scene
 * computes, rather than renders, belongs here.** The components below it are
 * then thin enough to read in one screen, and the arithmetic is covered by
 * `src/utils/__tests__/broadcastRhythm.test.ts`.
 *
 * Pure: no clock of its own, no DOM, no imports from React. `elapsed` in,
 * numbers out.
 */

import type { IndividualStanding, SchoolStanding, StandingsSnapshot } from '../../shared/arena/events';

// ── The beats, in milliseconds ──────────────────────────────────────────────
//
// Section K's durations, named once. A scene that hard-codes 3000 somewhere in
// its JSX is a scene whose timing silently drifts from the table it was
// specified in.

/** Sequence 2 — one school introduction per card, hard cut between. */
export const INTRO_CARD_MS = 3_000;
/** Sequence 3 — rays accelerate, board wipes in. */
export const START_MS = 1_600;
/** Sequence 4 — board dims, index rolls, category crosses. */
export const TRANSITION_MS = 900;
/** Sequence 5 — board brightens, the hairline fills. */
export const RESULT_MS = 2_200;
/** Sequence 16 — the ray field sweeps once per second while it withholds. */
export const GRADING_SWEEP_MS = 1_000;

// ── Sequence 1 · the countdown ──────────────────────────────────────────────

export interface CountdownParts {
  hours: number;
  minutes: number;
  seconds: number;
  /** Whole seconds remaining, floored. Zero once the start time has passed. */
  totalSeconds: number;
  /** The doors are shut and the match is due. */
  done: boolean;
}

/**
 * Split a remaining duration into the figures the pre-show prints.
 *
 * Floored, not rounded: a countdown that rounds shows "00:01" for half a second
 * after the start time has passed, and the one frame anybody screenshots is the
 * one where the clock is wrong.
 */
export function countdownParts(msRemaining: number): CountdownParts {
  const ms = Number.isFinite(msRemaining) ? Math.max(0, msRemaining) : 0;
  const totalSeconds = Math.floor(ms / 1000);
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    totalSeconds,
    done: totalSeconds <= 0,
  };
}

const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));

/**
 * `MM:SS`, or `H:MM:SS` once there is an hour or more to wait.
 *
 * The colon-separated form is deliberate: the figure is set in tabular mono at
 * display size, and a form that changes width as the numbers fall ("9 min" →
 * "10 min") makes the whole block twitch on a wall-sized screen.
 */
export function formatCountdown(msRemaining: number): string {
  const { hours, minutes, seconds } = countdownParts(msRemaining);
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

// ── Sequence 2 · the cycling school introductions ───────────────────────────

/**
 * Which school card is on screen, derived from the scene's own clock.
 *
 * Derived rather than stepped by an interval, because the stage runs ONE timer
 * for the whole broadcast (see `useStage`). A cycler with its own interval
 * keeps ticking after its scene is cut and comes back out of phase — or worse,
 * never stops, and the pre-show is the sequence that runs longest.
 *
 * Returns -1 when there is nothing to introduce, so the caller renders the
 * honest empty state rather than a card for school `undefined`.
 */
export function introIndexAt(elapsed: number, count: number, periodMs: number = INTRO_CARD_MS): number {
  if (!Number.isFinite(count) || count <= 0) return -1;
  if (!Number.isFinite(periodMs) || periodMs <= 0) return 0;
  const ms = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  return Math.floor(ms / periodMs) % Math.floor(count);
}

/** Milliseconds into the card currently on screen. Drives the sweep between cuts. */
export function introCardAge(elapsed: number, periodMs: number = INTRO_CARD_MS): number {
  if (!Number.isFinite(periodMs) || periodMs <= 0) return 0;
  const ms = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  return ms % periodMs;
}

// ── Sequence 5 · the hairline fill ──────────────────────────────────────────

export interface FillOptions {
  /** Hold before the fill starts, so the figure is read first. */
  delayMs?: number;
  /**
   * The viewer asked for less motion. The fill lands complete — the fraction
   * is information, and removing it would leave the scene saying nothing.
   */
  immediate?: boolean;
}

/**
 * How far through its travel a fill is, 0..1, clamped at both ends.
 *
 * Linear on purpose: the easing belongs in the CSS `animation-timing-function`,
 * where the compositor applies it, and duplicating the curve here would put two
 * copies of `cubic-bezier(0.16, 1, 0.3, 1)` in the codebase to drift apart.
 */
export function fillFraction(elapsed: number, durationMs: number, opts: FillOptions = {}): number {
  if (opts.immediate) return 1;
  const delay = Math.max(0, opts.delayMs ?? 0);
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 1;
  const ms = (Number.isFinite(elapsed) ? elapsed : 0) - delay;
  if (ms <= 0) return 0;
  return Math.min(1, ms / durationMs);
}

/**
 * The scaled fraction the hairline is actually drawn at.
 *
 * `pct` is a percentage 0..100 from `QuestionClosedPayload.correctPct`; the
 * result is a `scaleX` factor, because scaling a full-width rule composites and
 * animating its `width` would relayout the row 60 times a second for 45
 * minutes.
 */
export function hairlineScale(pct: number, elapsed: number, opts: FillOptions = {}): number {
  const target = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) / 100 : 0;
  return target * fillFraction(elapsed, RESULT_MS, opts);
}

/**
 * A duration as the stage prints it: `3,4 s`.
 *
 * Comma, because the broadcast is French-first and Kreyòl alongside, and both
 * write the decimal separator as a comma. One decimal place and no more — the
 * fastest answer of a round is a fact about a student, not a stopwatch reading,
 * and three decimals invite an argument about milliseconds nobody can verify.
 */
export function formatSeconds(ms: number): string {
  const safe = Number.isFinite(ms) && ms > 0 ? ms : 0;
  return `${(safe / 1000).toFixed(1).replace('.', ',')} s`;
}

// ── Sequences 3 and 4 · which question, and whether it is the first ─────────

/**
 * `ROUND_START.index` is ZERO-BASED, matching `currentQuestion.index` on the
 * tournament document (which `useStage` defaults to -1 precisely because 0 is a
 * real question).
 *
 * Flagged because no emitter for `ROUND_START` exists yet — `deriveEvents`
 * only covers the close side. If the run console turns out to emit a 1-based
 * index, this is the one function that has to change.
 */
export function questionNumber(index: number, total: number): { shown: number; total: number } {
  const t = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  const i = Number.isFinite(index) ? Math.floor(index) : 0;
  const shown = Math.max(1, i + 1);
  return { shown: t > 0 ? Math.min(shown, t) : shown, total: t };
}

/** Question one gets the opening sequence (3); every other gets the transition (4). */
export function isOpeningQuestion(index: number): boolean {
  return !Number.isFinite(index) || index <= 0;
}

// ── Sequence 16 · the held breath ───────────────────────────────────────────

/**
 * Which sweep the ray field is on. Whole numbers only.
 *
 * Grading is the sequence that must NOT read as a progress bar — the scores are
 * being withheld, and a bar that creeps toward an edge promises a moment it
 * cannot time. A count of sweeps says "still running" and nothing else.
 */
export function sweepCycle(elapsed: number, periodMs: number = GRADING_SWEEP_MS): number {
  if (!Number.isFinite(periodMs) || periodMs <= 0) return 0;
  const ms = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  return Math.floor(ms / periodMs);
}

// ── The board · rank travel ─────────────────────────────────────────────────

/**
 * How many lanes each school moved, positive when it moved UP the board.
 *
 * This is the whole of section K's "a row never teleports, because the travel
 * IS the information". The board renders in the new order and each moved lane
 * is offset back to where it came from, then released — so the travel plays
 * from the old position to the new one without a single layout read.
 *
 * Schools absent from the previous order are omitted rather than reported as a
 * huge climb: a school that has just become qualified did not overtake anybody,
 * and animating it up from nowhere would claim it did.
 */
export function rankMovement(prevOrder: readonly string[], nextOrder: readonly string[]): Map<string, number> {
  const was = new Map<string, number>();
  prevOrder.forEach((key, i) => { if (!was.has(key)) was.set(key, i); });
  const moved = new Map<string, number>();
  nextOrder.forEach((key, i) => {
    const before = was.get(key);
    if (before !== undefined && before !== i) moved.set(key, before - i);
  });
  return moved;
}

/**
 * A school's lane hue, derived from its key (section L).
 *
 * Deterministic, fixed saturation and lightness, and used ONLY as an edge bar.
 * We never guess a school's real colours or draw its crest: a hue we assign is
 * our own wayfinding, a crest is theirs, and the system must not conflate them.
 */
export function schoolHue(key: string): number {
  let h = 0;
  const s = typeof key === 'string' ? key : '';
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) % 360000;
  }
  return h % 360;
}

// ── The board · the ambient callout ─────────────────────────────────────────

export interface ClosestRace {
  ahead: SchoolStanding;
  behind: SchoolStanding;
  /** teamAvg between them. Never negative. */
  gap: number;
}

/** A gap this tight is the most interesting true thing on a resting board. */
export const TIGHT_RACE = 15;
/** Below this, a streak is a run of luck rather than a story. */
export const STREAK_FLOOR = 3;

/**
 * The tightest adjacent gap among schools that can actually compete.
 *
 * Unqualified schools are excluded: they carry `rank: 0` and are not in the
 * race, so a two-point gap between two of them is not a race being decided.
 */
export function closestRace(schools: readonly SchoolStanding[] | null | undefined): ClosestRace | null {
  const racing = (schools ?? [])
    .filter((s) => s && s.rank > 0)
    .slice()
    .sort((a, b) => a.rank - b.rank);
  if (racing.length < 2) return null;

  let best: ClosestRace | null = null;
  for (let i = 0; i < racing.length - 1; i += 1) {
    const gap = Math.abs((racing[i].teamAvg ?? 0) - (racing[i + 1].teamAvg ?? 0));
    if (!best || gap < best.gap) best = { ahead: racing[i], behind: racing[i + 1], gap };
  }
  return best;
}

/** The longest live run of correct answers, or null when nobody is on one. */
export function topStreak(individuals: readonly IndividualStanding[] | null | undefined): IndividualStanding | null {
  let best: IndividualStanding | null = null;
  for (const p of individuals ?? []) {
    const streak = p?.streak ?? 0;
    if (streak < STREAK_FLOOR) continue;
    if (!best || streak > (best.streak ?? 0)) best = p;
  }
  return best;
}

export type AmbientFact =
  | { kind: 'race'; race: ClosestRace }
  | { kind: 'streak'; player: IndividualStanding };

/**
 * Something TRUE to say when the board has rested long enough to look stuck.
 *
 * The director sets `scene.needsAmbient`; this decides what fills it. The one
 * rule: never filler. A resting board with an invented stat is worse than a
 * resting board, because the room learns the screen makes things up.
 *
 * A tight race wins over a streak, and a streak over a loose race, because a
 * two-point gap is the thing a commentator would say next.
 */
export function ambientFact(standings: StandingsSnapshot | null | undefined): AmbientFact | null {
  const race = closestRace(standings?.schools);
  if (race && race.gap <= TIGHT_RACE) return { kind: 'race', race };
  const player = topStreak(standings?.individuals);
  if (player) return { kind: 'streak', player };
  if (race) return { kind: 'race', race };
  return null;
}
