/**
 * tournois/schedule — the timetable the server builds from a config, and the
 * pure "where should we be now?" functions every advance is decided from.
 *
 * Nothing here reads the clock; `now` is always passed in. That is what makes
 * advancing idempotent and lazy: any client tick, and the per-minute cron,
 * computes the same target from the same stored schedule, and the endpoint only
 * writes when the stored state is BEHIND that target. Two ticks racing produce
 * one write (the second finds nothing to do inside its transaction).
 */
import type { TournamentConfig, TournamentFormat } from './config';

/** The pause after each live question: reveal, stats, podium. */
export const LIVE_REVEAL_MS = 8_000;
/** Network slack on a timed answer before it is refused (live) or scored 0 (rounds). */
export const ANSWER_GRACE_MS = 1_500;

export interface RoundWindow {
  index: number;
  opensAt: number;
  closesAt: number;
}

export interface Schedule {
  format: TournamentFormat;
  startsAt: number;
  /** When the last thing closes. For a bracket this is re-derived once the bracket size is known. */
  endsAt: number;
  questionMs: number;
  questionCount: number;
  /** live only */
  revealMs: number;
  /** window / rounds: the fixed windows. Bracket: filled in at start (one per bracket round). */
  rounds: RoundWindow[];
  /** bracket: hours per round, kept so rounds can be laid out once the entrants are known. */
  roundMs: number;
}

const HOUR = 60 * 60 * 1000;

export function bracketRoundCount(players: number): number {
  if (players <= 1) return 0;
  return Math.ceil(Math.log2(players));
}

/** Lay out `n` consecutive windows of `roundMs` from `startsAt`. */
export function consecutiveRounds(startsAt: number, n: number, roundMs: number): RoundWindow[] {
  return Array.from({ length: n }, (_, index) => ({
    index,
    opensAt: startsAt + index * roundMs,
    closesAt: startsAt + (index + 1) * roundMs,
  }));
}

export function buildSchedule(cfg: TournamentConfig): Schedule {
  const questionMs = cfg.secondsPerQuestion * 1000;
  const base = {
    format: cfg.format,
    startsAt: cfg.startsAt,
    questionMs,
    questionCount: cfg.questionCount,
    revealMs: LIVE_REVEAL_MS,
    roundMs: 0,
  };
  switch (cfg.format) {
    case 'live': {
      const endsAt = cfg.startsAt + cfg.questionCount * (questionMs + LIVE_REVEAL_MS);
      return { ...base, endsAt, rounds: [{ index: 0, opensAt: cfg.startsAt, closesAt: endsAt }] };
    }
    case 'window': {
      const rounds = consecutiveRounds(cfg.startsAt, 1, cfg.windowHours * HOUR);
      return { ...base, endsAt: rounds[0].closesAt, rounds };
    }
    case 'rounds': {
      const roundMs = cfg.roundHours * HOUR;
      const rounds = consecutiveRounds(cfg.startsAt, cfg.roundCount, roundMs);
      return { ...base, roundMs, endsAt: rounds[rounds.length - 1].closesAt, rounds };
    }
    case 'bracket': {
      // Worst case until entrants are known: a full bracket of maxPlayers.
      const roundMs = cfg.roundHours * HOUR;
      const rounds = consecutiveRounds(cfg.startsAt, Math.max(1, bracketRoundCount(cfg.maxPlayers)), roundMs);
      return { ...base, roundMs, endsAt: rounds[rounds.length - 1].closesAt, rounds };
    }
    default:
      throw new Error('unknown format');
  }
}

/** Once a bracket's entrants are known, its rounds are exactly log2(size). */
export function bracketSchedule(s: Schedule, players: number): Schedule {
  const n = Math.max(1, bracketRoundCount(players));
  const rounds = consecutiveRounds(s.startsAt, n, s.roundMs);
  return { ...s, rounds, endsAt: rounds[rounds.length - 1].closesAt };
}

// ── Live ────────────────────────────────────────────────────────────────────

export type LivePhase = 'lobby' | 'question' | 'reveal' | 'done';

export interface LivePosition {
  phase: LivePhase;
  /** Question index for question/reveal; -1 in the lobby; questionCount when done. */
  index: number;
  opensAt: number;
  closesAt: number;
  revealUntil: number;
}

/** Where a live tournament is at `now`. */
export function livePositionAt(s: Schedule, now: number): LivePosition {
  const slot = s.questionMs + s.revealMs;
  const elapsed = now - s.startsAt;
  if (elapsed < 0) {
    return { phase: 'lobby', index: -1, opensAt: s.startsAt, closesAt: s.startsAt + s.questionMs, revealUntil: s.startsAt + slot };
  }
  const index = Math.floor(elapsed / slot);
  if (index >= s.questionCount) {
    return { phase: 'done', index: s.questionCount, opensAt: s.endsAt, closesAt: s.endsAt, revealUntil: s.endsAt };
  }
  const opensAt = s.startsAt + index * slot;
  const closesAt = opensAt + s.questionMs;
  const revealUntil = opensAt + slot;
  return { phase: now < closesAt ? 'question' : 'reveal', index, opensAt, closesAt, revealUntil };
}

/** Totally ordered position, so "stored is behind target" is one comparison. */
export function livePositionRank(phase: LivePhase, index: number, count: number): number {
  if (phase === 'lobby') return -1;
  if (phase === 'done') return 2 * count;
  return 2 * index + (phase === 'reveal' ? 1 : 0);
}

/** The next instant at which a live tournament's state changes. */
export function liveNextDeadline(p: LivePosition): number | null {
  if (p.phase === 'done') return null;
  if (p.phase === 'lobby') return p.opensAt;
  return p.phase === 'question' ? p.closesAt : p.revealUntil;
}

export interface LiveAdvance {
  /** Nothing to write: the stored state already matches (or is ahead of) the clock. */
  noop: boolean;
  target: LivePosition;
  /** Questions whose reveal happened between stored and target (score/standings must refresh). */
  revealedIndexes: number[];
  finished: boolean;
}

/**
 * Decide an advance from the STORED live state. Idempotent: calling it again
 * with the state it produced returns `noop`.
 */
export function decideLiveAdvance(
  s: Schedule,
  stored: { phase: LivePhase; index: number },
  now: number,
): LiveAdvance {
  const target = livePositionAt(s, now);
  const from = livePositionRank(stored.phase, stored.index, s.questionCount);
  const to = livePositionRank(target.phase, target.index, s.questionCount);
  if (to <= from) return { noop: true, target, revealedIndexes: [], finished: stored.phase === 'done' };
  const revealedIndexes: number[] = [];
  // Odd ranks are reveals. `done` is 2n, so jumping straight to it still walks
  // through 2n−1 and the last question is revealed like every other.
  for (let r = from + 1; r <= to; r += 1) {
    if (r % 2 === 1) revealedIndexes.push((r - 1) / 2);
  }
  return { noop: false, target, revealedIndexes, finished: target.phase === 'done' };
}

// ── Windows (window / rounds / bracket) ─────────────────────────────────────

export function roundAt(rounds: RoundWindow[], now: number): RoundWindow | null {
  return rounds.find((r) => now >= r.opensAt && now < r.closesAt) || null;
}

/** The last round that has closed by `now`, or -1. */
export function lastClosedRound(rounds: RoundWindow[], now: number): number {
  let idx = -1;
  for (const r of rounds) if (now >= r.closesAt) idx = r.index;
  return idx;
}

/** Next time something must be decided for a round-based tournament. */
export function roundsNextDeadline(rounds: RoundWindow[], now: number): number | null {
  for (const r of rounds) {
    if (now < r.opensAt) return r.opensAt;
    if (now < r.closesAt) return r.closesAt;
  }
  return null;
}

/**
 * Timing of one answer inside an attempt: the clock starts when the server
 * served the question and the answer must land within the question's time
 * (plus network grace). Late answers are recorded but earn nothing.
 */
export function attemptAnswerLate(servedAt: number, questionMs: number, receivedAt: number): boolean {
  return receivedAt - servedAt > questionMs + ANSWER_GRACE_MS;
}
