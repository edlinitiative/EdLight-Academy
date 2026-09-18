/**
 * arena/scoring — pure scoring for the Arena tournament.
 *
 * Framework-free, no I/O, no clock of its own: every timestamp is passed in.
 * That is deliberate. The authoritative record is `answers/*`, and the whole
 * tournament must be re-scorable from it months later — a disqualification we
 * cannot reproduce by replaying the record is a judgement call, not a ruling.
 * A module that read `Date.now()` anywhere could never replay.
 *
 * Two rules the design turns on:
 *
 *  1. CORRECTNESS FIRST, SPEED AS A TIER — not a continuous curve. A continuous
 *     speed decay ranks connections as much as knowledge, and in Haiti that is
 *     a real and unfair difference. Two tiers are insensitive to a few hundred
 *     milliseconds of jitter, and the boundary is where cheating gets priced:
 *     a screenshot → AI → read → answer round trip lands at 15–25s, so a cheat
 *     scores half at best and loses to anyone who simply knew it.
 *  2. THE CLOCK STARTS WHEN THE QUESTION RENDERED, not when the server opened
 *     it — otherwise a slow connection is taxed for the network. The client
 *     reports when it painted; the server clamps that report (see below).
 */

// ── Tiers ───────────────────────────────────────────────────────────────────

export const TIER_FULL_MS = 12_000;
export const TIER_HALF_MS = 20_000;
export const POINTS_FULL = 1000;
export const POINTS_HALF = 500;

/**
 * How much later than `opensAt` a client may claim it rendered.
 *
 * Bounded on purpose. Without a bound, "my phone painted it at 19s" is a
 * 19-second head start for anyone who edits one number in a request body, and
 * the tier system — the only thing pricing a screenshot-to-AI round trip —
 * stops meaning anything.
 */
export const RENDER_GRACE_MS = 3_000;

export type AnswerTier = 'full' | 'half' | 'none';

export interface AnswerInput {
  correct: boolean;
  /** Server time the question window opened. */
  opensAt: number;
  /** Client-reported time the question painted. Untrusted; clamped. */
  clientShownAt: number;
  /** Server time the submission was received. The only trusted end of the span. */
  serverReceivedAt: number;
}

export interface AnswerScore {
  tier: AnswerTier;
  points: number;
  /** `serverReceivedAt − clampedShownAt`. Negative only for an impossible answer. */
  elapsedMs: number;
  /** What the clamp actually used as the start of the clock. Stored for audit. */
  clampedShownAt: number;
}

/**
 * Tier from an elapsed span. Boundaries are INCLUSIVE: 12000ms is still full.
 * A negative span is nonsense rather than instant, so it scores nothing —
 * `scoreAnswer` never passes one, having resolved clock skew before it gets here.
 */
export function tierFor(elapsedMs: number): AnswerTier {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 'none';
  if (elapsedMs <= TIER_FULL_MS) return 'full';
  if (elapsedMs <= TIER_HALF_MS) return 'half';
  return 'none';
}

/** Points a tier is worth WHEN CORRECT. Wrong answers never reach this. */
export function tierPoints(tier: AnswerTier): number {
  if (tier === 'full') return POINTS_FULL;
  if (tier === 'half') return POINTS_HALF;
  return 0;
}

/**
 * Where the clock actually starts: `clientShownAt` clamped into
 * `[opensAt, opensAt + RENDER_GRACE_MS]`.
 *
 * Both ends matter, and in opposite directions:
 *  - Below `opensAt` the clamp is the student's protection against nothing —
 *    a clock cannot start before the question existed — but leaving it
 *    unclamped would let a bad client report an ancient timestamp and score
 *    itself out of every tier. It is clamped up, not rejected.
 *  - Above `opensAt + grace` the clamp is the exploit ceiling. A client
 *    claiming it rendered at +60s gets exactly the same start as one claiming
 *    +3s: the lie is bounded at three seconds and can never GAIN more.
 *
 * A client that reports nothing usable falls back to `opensAt` — the server's
 * own clock — so failing to report is never a way to buy time.
 */
export function clampShownAt(clientShownAt: number, opensAt: number): number {
  if (!Number.isFinite(clientShownAt)) return opensAt;
  return Math.min(Math.max(clientShownAt, opensAt), opensAt + RENDER_GRACE_MS);
}

/**
 * An answer the server received before it opened the question.
 *
 * Impossible, not merely suspicious: nothing legitimate produces it. Also
 * covers non-finite server timestamps, because those are our bug, and letting
 * a NaN through would quietly return tier 'none' with a NaN elapsed — a real
 * student scored zero by an arithmetic accident, with no signal that it
 * happened.
 */
export function isImpossible(input: AnswerInput): boolean {
  const { opensAt, serverReceivedAt } = input;
  if (!Number.isFinite(opensAt) || !Number.isFinite(serverReceivedAt)) return true;
  return serverReceivedAt < opensAt;
}

/**
 * Score one submission.
 *
 * A WRONG answer still reports its tier and elapsed time. It scores nothing,
 * but the integrity layer reads both: sustained sub-second answering and
 * identical wrong-answer sequences across accounts are two of the strongest
 * cheating signals we have, and dropping the timing on wrong answers would
 * throw away half the evidence.
 */
export function scoreAnswer(input: AnswerInput): AnswerScore {
  const reported = clampShownAt(input.clientShownAt, input.opensAt);

  if (isImpossible(input)) {
    // Elapsed is reported as computed — negative — because the negative IS the
    // finding. Normalising it to 0 would hide the one case worth reviewing.
    return { tier: 'none', points: 0, elapsedMs: input.serverReceivedAt - reported, clampedShownAt: reported };
  }

  // The clock also cannot start AFTER the answer arrived. `clientShownAt` is
  // the device's wall clock and `serverReceivedAt` is ours; a phone running a
  // few seconds fast reports a render time later than our own receipt, which
  // would produce a negative span and score an honest, fast student zero. That
  // is clock skew, not speed. Capping here cannot be farmed: the grace clamp
  // above already bounds the head start at three seconds either way.
  const clampedShownAt = Math.min(reported, input.serverReceivedAt);
  const elapsedMs = input.serverReceivedAt - clampedShownAt;

  const tier = tierFor(elapsedMs);
  return { tier, points: input.correct ? tierPoints(tier) : 0, elapsedMs, clampedShownAt };
}

// ── Team scoring ────────────────────────────────────────────────────────────

const num = (v: number | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export interface TeamScore {
  /** MEAN of the top `teamSize` scores. */
  teamAvg: number;
  /** How many scores were actually averaged — below `teamSize` for a short school. */
  counted: number;
}

/**
 * A school's score: the MEAN of its best `teamSize` players.
 *
 * Mean, not sum. With a fixed team of five the two rank identically, so this
 * is a display decision that became a data decision: the mean is comparable
 * across schools mid-tournament and it is the number a commentator can say out
 * loud — "CODOSA are averaging 840". A sum of 4,200 says nothing to a viewer
 * and cannot be compared to a school that is still mid-round.
 *
 * Dividing by `counted` rather than by `teamSize` keeps it an actual mean. A
 * school short of five is already unqualified by `minPlayers`; dividing its
 * total by five as well would punish it twice and print a number that is not
 * the average of anything.
 */
export function teamScore(playerScores: number[], teamSize: number): TeamScore {
  const best = [...(playerScores || [])]
    .map(num)
    .sort((a, b) => b - a)
    .slice(0, Math.max(0, teamSize));
  const counted = best.length;
  if (!counted) return { teamAvg: 0, counted: 0 };
  return { teamAvg: best.reduce((n, s) => n + s, 0) / counted, counted };
}

// ── School standings ────────────────────────────────────────────────────────

/**
 * One school's players, as three PARALLEL arrays: index `i` is the same player
 * in all three. That alignment is load-bearing — the tiebreakers are "total
 * response time across the top five" and "correct across the top five", which
 * means the SAME five players selected by score, not the five fastest times
 * and the five best accuracies picked independently.
 */
export interface SchoolInput {
  key: string;
  label: string;
  playerScores: number[];
  playerTotalMs: number[];
  playerCorrect: number[];
  /** When the school reached `minPlayers`. Final tiebreaker; absent sorts last. */
  qualifiedAt?: number;
  /**
   * How many of this school's students were actually IN THE ROOM when doors
   * closed — the frozen roster's count, not the fetched page's length.
   *
   * Qualification is measured on players present, not registered (Decision 3),
   * and `playerScores` is a page capped at the pool size, so counting it would
   * answer a different question twice over: it would qualify a school whose
   * five registered and three turned up, and it would cap a large school's
   * head count at the page size.
   *
   * Absent, it falls back to `playerScores.length` — which is right before
   * doors close, when nobody is present yet and registration IS the count.
   */
  presentCount?: number;
}

export interface RankSchoolsOptions {
  teamSize: number;
  minPlayers: number;
}

export interface SchoolStanding {
  key: string;
  label: string;
  teamAvg: number;
  /** Summed response time of the counted players. Tiebreaker 2 — lower is better. */
  teamTotalMs: number;
  /** Correct answers across the counted players. Tiebreaker 3. */
  teamCorrect: number;
  /** How many players were counted into `teamAvg`. */
  counted: number;
  /** Everyone present for the school — the number qualification is measured on. */
  members: number;
  qualified: boolean;
  /** Players still needed to qualify. 0 once qualified. This is the recruiting message. */
  needed: number;
  /** 1-based among QUALIFIED schools; 0 when the school cannot compete. */
  rank: number;
}

interface PlayerSlice {
  score: number;
  totalMs: number;
  correct: number;
  /** Original position — the last resort that makes top-five selection deterministic. */
  index: number;
}

/**
 * Pick the five that count.
 *
 * The tiebreak chain here is not cosmetic. Six players on 1000 points means
 * the choice of five is arbitrary unless it is ordered, and an arbitrary
 * choice changes `teamTotalMs`, which changes the school's rank — on a
 * recomputation that ran five seconds later, with no answer having changed.
 */
function bestPlayers(school: SchoolInput, teamSize: number): PlayerSlice[] {
  const slices: PlayerSlice[] = (school.playerScores || []).map((score, index) => ({
    score: num(score),
    totalMs: num((school.playerTotalMs || [])[index]),
    correct: num((school.playerCorrect || [])[index]),
    index,
  }));
  slices.sort((a, b) => b.score - a.score || a.totalMs - b.totalMs || b.correct - a.correct || a.index - b.index);
  return slices.slice(0, Math.max(0, teamSize));
}

/** Absent `qualifiedAt` loses the final tiebreak rather than winning it by accident. */
const qualifiedAtOf = (s: SchoolInput): number =>
  (typeof s.qualifiedAt === 'number' && Number.isFinite(s.qualifiedAt) ? s.qualifiedAt : Infinity);

/**
 * The four tiebreakers, in order, as a comparator. Returns 0 only when two
 * schools are indistinguishable on ALL FOUR — which is what earns a shared rank.
 */
function compareSchools(a: SchoolStanding, b: SchoolStanding, aAt: number, bAt: number): number {
  return b.teamAvg - a.teamAvg          // 1 · higher team average
    || a.teamTotalMs - b.teamTotalMs    // 2 · faster to the same score
    || b.teamCorrect - a.teamCorrect    // 3 · more correct across the counted five
    || aAt - bAt;                       // 4 · qualified earlier
}

/**
 * Rank schools on their best `teamSize`.
 *
 * Unqualified schools keep a standing — they need to see how close they are,
 * and "your school needs two more players" is the only recruiting message a
 * student can act on tonight — but sort below every qualified school and carry
 * rank 0, because they are not in the running.
 *
 * Qualification is measured on `members`, the players PRESENT, not the players
 * registered: a school with five in the lobby and three in the room has three.
 *
 * Determinism is a requirement, not a nicety. The aggregator re-runs this every
 * few seconds against a fresh Firestore query whose document order is not
 * guaranteed, and the broadcast animates the DIFFERENCE between consecutive
 * runs. Any non-determinism would show up on screen as schools swapping places
 * for no reason. Hence the `key` anchor at the end of the sort: `Array.sort` is
 * stable, but stability only preserves an input order we do not control.
 */
export function rankSchools(schools: SchoolInput[], opts: RankSchoolsOptions): SchoolStanding[] {
  const { teamSize, minPlayers } = opts;
  const at = new Map<string, number>();

  const standings: SchoolStanding[] = (schools || []).map((s) => {
    const best = bestPlayers(s, teamSize);
    const members = typeof s.presentCount === 'number' && Number.isFinite(s.presentCount)
      ? s.presentCount
      : (s.playerScores || []).length;
    const counted = best.length;
    at.set(s.key, qualifiedAtOf(s));
    return {
      key: s.key,
      label: s.label,
      teamAvg: counted ? best.reduce((n, p) => n + p.score, 0) / counted : 0,
      teamTotalMs: best.reduce((n, p) => n + p.totalMs, 0),
      teamCorrect: best.reduce((n, p) => n + p.correct, 0),
      counted,
      members,
      qualified: members >= minPlayers,
      needed: Math.max(0, minPlayers - members),
      rank: 0,
    };
  });

  standings.sort((a, b) => {
    if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
    return compareSchools(a, b, at.get(a.key) ?? Infinity, at.get(b.key) ?? Infinity)
      || a.key.localeCompare(b.key);
  });

  // Competition ranking: schools level on all four tiebreakers share a rank and
  // the next rank is skipped. Inventing a winner between two identical records
  // — on a stream, with money attached — is the one thing the standings must
  // not do.
  let position = 0;
  let previous: SchoolStanding | null = null;
  for (const s of standings) {
    if (!s.qualified) continue;
    position += 1;
    const tied = previous
      && compareSchools(previous, s, at.get(previous.key) ?? Infinity, at.get(s.key) ?? Infinity) === 0;
    s.rank = tied && previous ? previous.rank : position;
    previous = s;
  }
  return standings;
}

// ── Individual standings ────────────────────────────────────────────────────

export interface PlayerInput {
  uid: string;
  displayName?: string;
  schoolKey?: string;
  score: number;
  /** Summed response time across the tournament. Tiebreaker 2 — lower is better. */
  totalMs: number;
  /** Answers scored at the full tier. Tiebreaker 3. */
  fullTierCount: number;
  /** Registration time. Final tiebreaker; absent sorts last. */
  registeredAt?: number;
}

export interface RankIndividualsOptions {
  /** Cap the returned list AFTER ranking — a podium, not a truncated contest. */
  limit?: number;
}

export interface IndividualStanding {
  uid: string;
  displayName: string;
  schoolKey: string;
  score: number;
  totalMs: number;
  fullTierCount: number;
  rank: number;
}

function compareIndividuals(a: IndividualStanding, b: IndividualStanding, aAt: number, bAt: number): number {
  return b.score - a.score                    // 1 · higher score
    || a.totalMs - b.totalMs                  // 2 · faster to the same score
    || b.fullTierCount - a.fullTierCount      // 3 · more answers at the full tier
    || aAt - bAt;                             // 4 · registered earlier
}

/**
 * Rank individuals for the cash podium.
 *
 * Same shape and same guarantees as `rankSchools`: deterministic across
 * recomputation, and a genuine dead heat shares a rank rather than being
 * broken by whatever order Firestore happened to return. A tie at the top of
 * a prize list is a roll-down question, and answering it with an accident of
 * document ordering is not defensible in public.
 */
export function rankIndividuals(
  players: PlayerInput[],
  opts: RankIndividualsOptions = {},
): IndividualStanding[] {
  const at = new Map<string, number>();

  const standings: IndividualStanding[] = (players || []).map((p) => {
    at.set(p.uid, typeof p.registeredAt === 'number' && Number.isFinite(p.registeredAt) ? p.registeredAt : Infinity);
    return {
      uid: p.uid,
      displayName: p.displayName ?? '',
      schoolKey: p.schoolKey ?? '',
      score: num(p.score),
      totalMs: num(p.totalMs),
      fullTierCount: num(p.fullTierCount),
      rank: 0,
    };
  });

  standings.sort((a, b) => compareIndividuals(a, b, at.get(a.uid) ?? Infinity, at.get(b.uid) ?? Infinity)
    || a.uid.localeCompare(b.uid));

  let position = 0;
  let previous: IndividualStanding | null = null;
  for (const s of standings) {
    position += 1;
    const tied = previous
      && compareIndividuals(previous, s, at.get(previous.uid) ?? Infinity, at.get(s.uid) ?? Infinity) === 0;
    s.rank = tied && previous ? previous.rank : position;
    previous = s;
  }

  const limit = opts.limit;
  return typeof limit === 'number' && limit >= 0 ? standings.slice(0, limit) : standings;
}
