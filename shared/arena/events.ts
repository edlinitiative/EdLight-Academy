/**
 * arena/events — the typed broadcast feed, and the emitter that derives it.
 *
 * The spectator screen must never infer drama from score diffs. If it does,
 * every surface invents its own idea of what mattered: the audience view plays
 * an overtake the commentator's screen never mentioned, and the two are
 * describing different matches to the same room. So the aggregator emits typed,
 * fully denormalised events — everything a scene needs to render is in the
 * payload, and the broadcast never queries back — and every surface reads the
 * same feed.
 *
 * Three rules carry most of the weight, and each has a concrete failure mode:
 *
 *  1. `causedBy` IS MANDATORY ON A MOVEMENT. An overtake with no named answers
 *     is two unrelated animations on screen — a lane sliding up here, a player
 *     card there — instead of one story: *this student answered, so their
 *     school passed three others*.
 *  2. ONE EVENT PER FACT. A school that passes three others is one
 *     `SCHOOL_OVERTAKE` carrying all three, not three events fighting for the
 *     same four seconds of screen.
 *  3. SUPPRESSION HAPPENS HERE, NOT IN THE CLIENT. Drama that happens every
 *     question is not drama, and a client-side filter would mean the audience
 *     view and the commentator view disagree about what was worth saying.
 *
 * Pure and framework-free: no Firestore, no timers, no clock of its own. The
 * caller passes `now`, so the whole feed is reproducible in a test.
 */

// ── The catalogue ───────────────────────────────────────────────────────────

export type ArenaEventType =
  | 'TOURNAMENT_OPEN'
  | 'ROUND_START'
  | 'QUESTION_CLOSED'
  | 'LEAD_CHANGE'
  | 'SCHOOL_OVERTAKE'
  | 'PLAYER_ENTERS_TOP_5'
  | 'PLAYER_LEAVES_TOP_5'
  | 'PERFECT_ROUND'
  | 'PLAYER_STREAK'
  | 'SCHOOL_STREAK'
  | 'BIGGEST_CLIMBER'
  | 'COMEBACK'
  | 'TIE'
  | 'PLAYER_CARRY'
  | 'HALFTIME'
  | 'FINAL_FIVE'
  | 'FINAL_QUESTION'
  | 'GRADING'
  | 'CHAMPION_SCHOOL'
  | 'CHAMPION_INDIVIDUAL';

/**
 * Priority decides two different things and both matter: which events survive
 * suppression here, and which events may take the screen from another in the
 * director. 10 preempts; below 8 is "nice to have".
 */
export const ARENA_EVENT_PRIORITY: Record<ArenaEventType, number> = {
  TOURNAMENT_OPEN: 10,
  ROUND_START: 9,
  QUESTION_CLOSED: 7,
  LEAD_CHANGE: 10,
  SCHOOL_OVERTAKE: 8,
  PLAYER_ENTERS_TOP_5: 8,
  PLAYER_LEAVES_TOP_5: 6,
  PERFECT_ROUND: 7,
  PLAYER_STREAK: 6,
  SCHOOL_STREAK: 6,
  BIGGEST_CLIMBER: 5,
  COMEBACK: 8,
  TIE: 7,
  PLAYER_CARRY: 6,
  HALFTIME: 10,
  FINAL_FIVE: 9,
  FINAL_QUESTION: 10,
  GRADING: 10,
  CHAMPION_SCHOOL: 10,
  CHAMPION_INDIVIDUAL: 10,
};

/**
 * How long an event stays worth showing.
 *
 * The tournament runs ~20s of open question then a ~10s pause, and the pause is
 * where scenes play. An event that could not be shown inside roughly one such
 * cycle has been overtaken by the match itself: announcing an overtake two
 * questions after the board already settled is worse than never announcing it,
 * because the viewer sees an animation that contradicts the standings in front
 * of them. Structural moments (halftime, the champion) hold longer because the
 * match is deliberately paused around them.
 */
export const ARENA_EVENT_TTL_MS: Record<ArenaEventType, number> = {
  TOURNAMENT_OPEN: 60_000,
  ROUND_START: 8_000,
  QUESTION_CLOSED: 12_000,
  LEAD_CHANGE: 30_000,
  SCHOOL_OVERTAKE: 12_000,
  PLAYER_ENTERS_TOP_5: 12_000,
  PLAYER_LEAVES_TOP_5: 9_000,
  PERFECT_ROUND: 12_000,
  PLAYER_STREAK: 9_000,
  SCHOOL_STREAK: 9_000,
  BIGGEST_CLIMBER: 9_000,
  COMEBACK: 20_000,
  TIE: 15_000,
  PLAYER_CARRY: 9_000,
  HALFTIME: 120_000,
  FINAL_FIVE: 30_000,
  FINAL_QUESTION: 30_000,
  GRADING: 60_000,
  CHAMPION_SCHOOL: 300_000,
  CHAMPION_INDIVIDUAL: 300_000,
};

/**
 * Events that MOVE THE BOARD, and therefore must name the answers that moved
 * it. The distinction is not decorative: a `PLAYER_STREAK` is about the player
 * already named in its payload, so "what caused it" is self-evident, while a
 * `SCHOOL_OVERTAKE` is about a lane sliding past three others and is
 * meaningless without the student behind it.
 */
export const ARENA_MOVEMENT_EVENT_TYPES = [
  'LEAD_CHANGE',
  'SCHOOL_OVERTAKE',
  'PLAYER_ENTERS_TOP_5',
  'PLAYER_LEAVES_TOP_5',
  'COMEBACK',
  'BIGGEST_CLIMBER',
] as const;

export type ArenaMovementEventType = (typeof ARENA_MOVEMENT_EVENT_TYPES)[number];

export function isMovementEvent(event: ArenaEvent): boolean {
  return (ARENA_MOVEMENT_EVENT_TYPES as readonly string[]).includes(event.type);
}

// ── Denormalised references carried inside payloads ─────────────────────────

/** Everything a scene needs to name a school without a second read. */
export interface ArenaSchoolRef {
  key: string;
  label: string;
  /** CODOSA — what the big screen shows; the full name never fits. */
  shortName: string;
}

/** Everything a scene needs to name a player without a second read. */
export interface ArenaPlayerRef {
  uid: string;
  displayName: string;
  schoolKey: string;
  schoolShort: string;
}

/**
 * One answer that produced a movement: who, and how much they gained since the
 * previous snapshot. `gained` is what lets the scene count a number up rather
 * than cut to a new one.
 */
export interface ArenaCause {
  uid: string;
  displayName: string;
  schoolKey: string;
  gained: number;
}

// ── Payloads ────────────────────────────────────────────────────────────────

export interface TournamentOpenPayload { schools: number; players: number }
export interface RoundStartPayload { index: number; total: number; category: string }
export interface QuestionClosedPayload {
  index: number;
  correctPct: number;
  fastestMs: number;
  fastest: ArenaPlayerRef | null;
}

export interface LeadChangePayload {
  newLeader: ArenaSchoolRef;
  /** Null only when nobody held the lead before — the first school to rank 1. */
  displaced: ArenaSchoolRef | null;
  /** teamAvg between the new leader and second place, right now. */
  margin: number;
  causedBy: ArenaCause[];
}

export interface SchoolOvertakePayload {
  school: ArenaSchoolRef;
  from: number;
  to: number;
  /** Every school passed in this one move. Never split into several events. */
  passed: ArenaSchoolRef[];
  causedBy: ArenaCause[];
}

export interface PlayerEntersTop5Payload {
  player: ArenaPlayerRef;
  school: ArenaSchoolRef;
  /** The teammate they replaced — the scene is framed as a substitution. */
  displaced: ArenaPlayerRef | null;
  newTeamAvg: number;
  /** teamAvg change the substitution produced. */
  delta: number;
  causedBy: ArenaCause[];
}

export interface PlayerLeavesTop5Payload {
  player: ArenaPlayerRef;
  school: ArenaSchoolRef;
  replacedBy: ArenaPlayerRef | null;
  causedBy: ArenaCause[];
}

export interface PerfectRoundPayload {
  player: ArenaPlayerRef;
  school: ArenaSchoolRef;
  roundIndex: number;
}

export interface PlayerStreakPayload {
  player: ArenaPlayerRef;
  school: ArenaSchoolRef;
  streak: number;
  avgMs: number;
}

export interface SchoolStreakPayload { school: ArenaSchoolRef; count: number }

export interface BiggestClimberPayload {
  school: ArenaSchoolRef;
  gained: number;
  from: number;
  to: number;
  causedBy: ArenaCause[];
}

export interface ComebackPayload {
  school: ArenaSchoolRef;
  wasRank: number;
  nowRank: number;
  causedBy: ArenaCause[];
}

export interface TiePayload {
  schools: [ArenaSchoolRef, ArenaSchoolRef];
  /** Percentage points of teamAvg between them. */
  margin: number;
}

export interface PlayerCarryPayload {
  player: ArenaPlayerRef;
  school: ArenaSchoolRef;
  sharePct: number;
}

export interface HalftimePayload {
  questionIndex: number;
  totalQuestions: number;
  /** Top schools as they stand, already ranked. */
  top: SchoolStanding[];
  /** teamAvg between #1 and #2 — the line the host reads out. */
  margin: number;
  mvp: IndividualStanding | null;
}

export interface FinalFivePayload {
  questionsRemaining: number;
  top: SchoolStanding[];
  /** margins[i] is the gap from top[i] to top[i + 1]. */
  margins: number[];
}

export interface FinalQuestionPayload {
  atStake: Array<{ school: ArenaSchoolRef; behind: number }>;
}

export interface GradingPayload { startedAt: number }

export interface ChampionSchoolPayload {
  school: ArenaSchoolRef;
  teamAvg: number;
  top5: ArenaPlayerRef[];
}

export interface ChampionIndividualPayload { podium: IndividualStanding[] }

// ── Envelope and the union ──────────────────────────────────────────────────

/** The shared envelope. Every event carries it; `payload` is what differs. */
export interface ArenaEventEnvelope {
  /** Monotonic within a tournament. Also the deterministic tie-break. */
  seq: number;
  /** 1..10. 10 preempts whatever is on screen. */
  priority: number;
  createdAt: number;
  round: number;
  questionIndex: number;
  ttlMs: number;
}

export interface ArenaEventOf<T extends ArenaEventType, P> extends ArenaEventEnvelope {
  type: T;
  payload: P;
}

export type ArenaEvent =
  | ArenaEventOf<'TOURNAMENT_OPEN', TournamentOpenPayload>
  | ArenaEventOf<'ROUND_START', RoundStartPayload>
  | ArenaEventOf<'QUESTION_CLOSED', QuestionClosedPayload>
  | ArenaEventOf<'LEAD_CHANGE', LeadChangePayload>
  | ArenaEventOf<'SCHOOL_OVERTAKE', SchoolOvertakePayload>
  | ArenaEventOf<'PLAYER_ENTERS_TOP_5', PlayerEntersTop5Payload>
  | ArenaEventOf<'PLAYER_LEAVES_TOP_5', PlayerLeavesTop5Payload>
  | ArenaEventOf<'PERFECT_ROUND', PerfectRoundPayload>
  | ArenaEventOf<'PLAYER_STREAK', PlayerStreakPayload>
  | ArenaEventOf<'SCHOOL_STREAK', SchoolStreakPayload>
  | ArenaEventOf<'BIGGEST_CLIMBER', BiggestClimberPayload>
  | ArenaEventOf<'COMEBACK', ComebackPayload>
  | ArenaEventOf<'TIE', TiePayload>
  | ArenaEventOf<'PLAYER_CARRY', PlayerCarryPayload>
  | ArenaEventOf<'HALFTIME', HalftimePayload>
  | ArenaEventOf<'FINAL_FIVE', FinalFivePayload>
  | ArenaEventOf<'FINAL_QUESTION', FinalQuestionPayload>
  | ArenaEventOf<'GRADING', GradingPayload>
  | ArenaEventOf<'CHAMPION_SCHOOL', ChampionSchoolPayload>
  | ArenaEventOf<'CHAMPION_INDIVIDUAL', ChampionIndividualPayload>;

/**
 * The school an event is ABOUT, or null when it is about the whole match.
 *
 * The director composes scenes by this key, so getting it wrong is what turns
 * one substitution story into two consecutive notifications.
 */
/**
 * The school an event is about, or null.
 *
 * Reads defensively even though the types say it cannot need to. These events
 * arrive at the broadcast over a Firestore listener, which means the document
 * may have been written by a different build of the emitter than the one
 * reading it — a field renamed in a deploy, a half-written document, a payload
 * shape from next month. The types describe what WE write; they guarantee
 * nothing about what a live listener hands back.
 *
 * And the cost of being wrong is asymmetric: throwing here kills the director's
 * tick and the stage freezes mid-tournament in front of an audience, to avoid
 * mis-grouping one animation. Returning null just means this event is not
 * composed with another.
 */
function keyOf(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const key = (value as { key?: unknown }).key;
  return typeof key === 'string' && key !== '' ? key : null;
}

export function schoolKeyOf(event: ArenaEvent): string | null {
  const payload = (event?.payload ?? null) as unknown as Record<string, unknown> | null;
  if (!payload) return null;
  switch (event.type) {
    case 'LEAD_CHANGE':
      return keyOf(payload.newLeader);
    case 'SCHOOL_OVERTAKE':
    case 'COMEBACK':
    case 'BIGGEST_CLIMBER':
    case 'SCHOOL_STREAK':
    case 'CHAMPION_SCHOOL':
    case 'PLAYER_ENTERS_TOP_5':
    case 'PLAYER_LEAVES_TOP_5':
    case 'PERFECT_ROUND':
    case 'PLAYER_STREAK':
    case 'PLAYER_CARRY':
      return keyOf(payload.school);
    default:
      return null;
  }
}

// ── Snapshots the emitter compares ──────────────────────────────────────────

/** One school on `tournaments/{tid}/standings/current`. */
export interface SchoolStanding {
  key: string;
  label: string;
  shortName: string;
  /** Mean score of the counting five — the number a commentator says out loud. */
  teamAvg: number;
  teamTotalMs?: number;
  counted: number;
  members: number;
  qualified: boolean;
  /** 1-based among qualified schools; 0 when the school cannot yet compete. */
  rank: number;
  /** uids of the five that currently count, best first. */
  top5: string[];
}

/** One player on `tournaments/{tid}/standings/current`. */
export interface IndividualStanding {
  uid: string;
  displayName: string;
  schoolKey: string;
  schoolShort: string;
  score: number;
  correct: number;
  avgMs: number;
  rank: number;
  /** Consecutive correct answers, as the aggregator counted them. */
  streak?: number;
  /**
   * Set by the aggregator when this player has just completed a round with
   * every answer correct at full tier. Derived there, not here: recomputing
   * tiers from two snapshots would duplicate the scoring rules and the two
   * copies would drift the first time the tier boundary moves.
   */
  perfectRound?: boolean;
}

export interface StandingsSnapshot {
  seq: number;
  computedAt: number;
  schools: SchoolStanding[];
  /**
   * Must contain at least every school's top-5 members. `causedBy` is derived
   * from their score gains, and a movement whose cause is missing is dropped
   * rather than shown uncaused — so a thinned list silently costs events.
   */
  individuals: IndividualStanding[];
}

export interface DeriveContext {
  /** First seq to hand out. Emitted events are numbered from here, gapless. */
  seq: number;
  round: number;
  questionIndex: number;
  questionsRemaining: number;
  totalQuestions: number;
  now: number;
  /** Override the per-round cap. Present for tests and for a quiet final five. */
  maxEvents?: number;
}

// ── Thresholds ──────────────────────────────────────────────────────────────

/** "Below priority 8" — the band that suppression polices. */
export const ARENA_MINOR_PRIORITY = 8;
/** Roughly four moments a round. More than that and none of them land. */
export const ARENA_ROUND_EVENT_CAP = 4;
/** A streak is announced when it crosses a multiple of this. */
export const ARENA_STREAK_STEP = 5;
/** Top-2 within this percentage of teamAvg is a TIE. */
export const ARENA_TIE_MARGIN_PCT = 1;
/** One player worth more than this share of their school's five is a carry. */
export const ARENA_CARRY_SHARE_PCT = 35;
/** How many players a scene can name as the cause before it stops being legible. */
export const NAMED_CAUSES = 3;
/** A COMEBACK starts outside this rank… */
export const ARENA_COMEBACK_FROM_RANK = 8;
/** …and lands inside this one. */
export const ARENA_COMEBACK_TO_RANK = 3;

// ── Emitter ─────────────────────────────────────────────────────────────────

/** An event before it has been numbered, plus what suppression needs to judge it. */
interface Draft {
  type: ArenaEventType;
  payload: unknown;
  /** Creation order. The deterministic tie-break, and the emitted order. */
  order: number;
  schoolKey: string | null;
}

const schoolRef = (s: SchoolStanding): ArenaSchoolRef => ({
  key: s.key, label: s.label, shortName: s.shortName,
});

const playerRef = (p: IndividualStanding): ArenaPlayerRef => ({
  uid: p.uid, displayName: p.displayName, schoolKey: p.schoolKey, schoolShort: p.schoolShort,
});

const byKey = <T extends { key: string }>(rows: T[]) =>
  new Map((rows || []).map((r) => [r.key, r]));

const byUid = <T extends { uid: string }>(rows: T[]) =>
  new Map((rows || []).map((r) => [r.uid, r]));

/** Rank 0 means "not competing yet", not "worst place". See `rankTeams`. */
const isRanked = (rank: number) => rank > 0;

export function deriveEvents(
  previous: StandingsSnapshot | null,
  next: StandingsSnapshot,
  ctx: DeriveContext,
): ArenaEvent[] {
  const drafts: Draft[] = [];
  const add = (type: ArenaEventType, payload: unknown, schoolKey: string | null) => {
    drafts.push({ type, payload, order: drafts.length, schoolKey });
  };

  const nextSchools = (next?.schools || []).filter((s) => isRanked(s.rank))
    .slice().sort((a, b) => a.rank - b.rank);
  const nextIndividuals = next?.individuals || [];
  const nextInd = byUid(nextIndividuals);

  // A first paint is not "everyone just arrived". Every school is absent from a
  // snapshot that does not exist, so a diff against null would report the whole
  // board as an overtake and fire every animation at once — the spectator page
  // opens as confetti and the match has not started. Cadence events below still
  // stand, because they come from the clock, not from a comparison.
  const movementReadable = previous !== null;
  const prevSchools = movementReadable ? byKey(previous.schools || []) : new Map<string, SchoolStanding>();
  const prevInd = movementReadable ? byUid(previous.individuals || []) : new Map<string, IndividualStanding>();

  /**
   * Which of a school's counting five gained score since the previous snapshot,
   * biggest contribution first.
   *
   * This is the whole of `causedBy`. An empty result is meaningful: the school
   * did not do anything this round, it was passed by someone standing still or
   * lifted by someone else's fall, and crediting it with a move would play a
   * takeover for a school whose five all sat out.
   */
  const causeFor = (uid: string, schoolKey: string): ArenaCause | null => {
    const player = nextInd.get(uid);
    if (!player) return null;
    const before = prevInd.get(uid);
    const gained = player.score - (before ? before.score : 0);
    if (gained <= 0) return null;
    return { uid, displayName: player.displayName, schoolKey, gained };
  };

  const causesFor = (school: SchoolStanding): ArenaCause[] => {
    const causes: ArenaCause[] = [];
    for (const uid of school.top5 || []) {
      const cause = causeFor(uid, school.key);
      if (cause) causes.push(cause);
    }
    // Biggest first, uid as the tie-break so two identical gains cannot make the
    // named player flicker between re-renders of the same event.
    causes.sort((a, b) => b.gained - a.gained || a.uid.localeCompare(b.uid));
    // Three names is what a scene can say out loud. The cap is on DISPLAY, so
    // it is applied here and never used to decide whether a move had a cause.
    return causes.slice(0, NAMED_CAUSES);
  };

  const leader = nextSchools[0] || null;
  const runnerUp = nextSchools[1] || null;
  const marginAtTop = leader && runnerUp ? leader.teamAvg - runnerUp.teamAvg : 0;

  // ── Movement ──────────────────────────────────────────────────────────────
  // `creditedForClimb` keeps one fact to one event: the school that took the
  // lead already has its LEAD_CHANGE, and emitting its SCHOOL_OVERTAKE too
  // would play the same climb twice, four seconds apart.
  const creditedForClimb = new Set<string>();

  if (movementReadable && leader) {
    const previousLeader = [...prevSchools.values()]
      .filter((s) => isRanked(s.rank))
      .sort((a, b) => a.rank - b.rank)[0] || null;

    if (!previousLeader || previousLeader.key !== leader.key) {
      const causedBy = causesFor(leader);
      if (causedBy.length > 0) {
        creditedForClimb.add(leader.key);
        add('LEAD_CHANGE', {
          newLeader: schoolRef(leader),
          displaced: previousLeader ? schoolRef(previousLeader) : null,
          margin: marginAtTop,
          causedBy,
        } satisfies LeadChangePayload, leader.key);
      }
    }
  }

  if (movementReadable) {
    for (const school of nextSchools) {
      const before = prevSchools.get(school.key);
      if (!before || !isRanked(before.rank)) continue;
      if (before.rank <= ARENA_COMEBACK_FROM_RANK) continue;
      if (school.rank > ARENA_COMEBACK_TO_RANK) continue;
      const causedBy = causesFor(school);
      if (causedBy.length === 0) continue;
      creditedForClimb.add(school.key);
      add('COMEBACK', {
        school: schoolRef(school),
        wasRank: before.rank,
        nowRank: school.rank,
        causedBy,
      } satisfies ComebackPayload, school.key);
    }
  }

  /** Schools that gained at least one rank, biggest climb first. */
  const climbers = !movementReadable ? [] : nextSchools
    .map((school) => {
      const before = prevSchools.get(school.key);
      const from = before && isRanked(before.rank) ? before.rank : 0;
      return { school, from, gained: from > 0 ? from - school.rank : 0 };
    })
    .filter((c) => c.gained > 0)
    .sort((a, b) => b.gained - a.gained || a.school.rank - b.school.rank
      || a.school.key.localeCompare(b.school.key));

  for (const climb of climbers) {
    if (creditedForClimb.has(climb.school.key)) continue;
    const causedBy = causesFor(climb.school);
    if (causedBy.length === 0) continue;
    // One event per fact: every school this lane travelled past rides in
    // `passed`. Three events would mean three lanes animating separately and
    // the viewer counting them instead of watching the climb.
    const passed = nextSchools
      .filter((other) => {
        if (other.key === climb.school.key) return false;
        const otherBefore = prevSchools.get(other.key);
        if (!otherBefore || !isRanked(otherBefore.rank)) return false;
        return otherBefore.rank < climb.from && other.rank > climb.school.rank;
      })
      .map(schoolRef);
    add('SCHOOL_OVERTAKE', {
      school: schoolRef(climb.school),
      from: climb.from,
      to: climb.school.rank,
      passed,
      causedBy,
    } satisfies SchoolOvertakePayload, climb.school.key);
  }

  // ── Top-5 substitutions ───────────────────────────────────────────────────
  if (movementReadable) {
    for (const school of nextSchools) {
      const before = prevSchools.get(school.key);
      if (!before) continue;
      const wasIn = new Set(before.top5 || []);
      const nowIn = new Set(school.top5 || []);
      const entering = (school.top5 || []).filter((uid) => !wasIn.has(uid));
      const leaving = (before.top5 || []).filter((uid) => !nowIn.has(uid));
      if (entering.length === 0 && leaving.length === 0) continue;

      const delta = school.teamAvg - before.teamAvg;

      entering.forEach((uid, i) => {
        const player = nextInd.get(uid);
        if (!player) return;
        // Attributed to the incoming player directly, not by filtering the
        // school's three named causes: a substitution by the school's fourth
        // biggest gainer is still that player's substitution, and filtering
        // would silently drop it as uncaused.
        const cause = causeFor(uid, school.key);
        // A player only enters the five by out-scoring a team-mate, so a
        // substitution we cannot attribute to an answer is a data artefact
        // (an eligibility change, a late-arriving player) and not a moment.
        if (!cause) return;
        const causedBy = [cause];
        const out = leaving[i] ? nextInd.get(leaving[i]) : null;
        add('PLAYER_ENTERS_TOP_5', {
          player: playerRef(player),
          school: schoolRef(school),
          displaced: out ? playerRef(out) : null,
          newTeamAvg: school.teamAvg,
          delta,
          causedBy,
        } satisfies PlayerEntersTop5Payload, school.key);
      });

      leaving.forEach((uid, i) => {
        const player = nextInd.get(uid);
        if (!player) return;
        const incoming = entering[i] ? nextInd.get(entering[i]) : null;
        const cause = incoming ? causeFor(incoming.uid, school.key) : null;
        if (!cause) return;
        const causedBy = [cause];
        add('PLAYER_LEAVES_TOP_5', {
          player: playerRef(player),
          school: schoolRef(school),
          replacedBy: incoming ? playerRef(incoming) : null,
          causedBy,
        } satisfies PlayerLeavesTop5Payload, school.key);
      });
    }
  }

  // ── Player facts ──────────────────────────────────────────────────────────
  const schoolOf = (key: string) => nextSchools.find((s) => s.key === key) || null;

  if (movementReadable) {
    for (const player of nextIndividuals) {
      if (!player.perfectRound) continue;
      const before = prevInd.get(player.uid);
      // The flag stays set for the whole round it describes; announcing it once
      // per snapshot would replay the same "SANS FAUTE" card every question.
      if (before && before.perfectRound) continue;
      const school = schoolOf(player.schoolKey);
      if (!school) continue;
      add('PERFECT_ROUND', {
        player: playerRef(player),
        school: schoolRef(school),
        roundIndex: ctx.round,
      } satisfies PerfectRoundPayload, school.key);
    }

    for (const player of nextIndividuals) {
      const streak = player.streak || 0;
      const before = prevInd.get(player.uid);
      const wasStreak = before ? (before.streak || 0) : 0;
      // Only on the crossing: 5, 10, 15. A streak of 7 is not news every
      // question it survives, and announcing it that way buries the crossings.
      const crossed = Math.floor(streak / ARENA_STREAK_STEP) > Math.floor(wasStreak / ARENA_STREAK_STEP);
      if (!crossed || streak < ARENA_STREAK_STEP) continue;
      const school = schoolOf(player.schoolKey);
      if (!school) continue;
      add('PLAYER_STREAK', {
        player: playerRef(player),
        school: schoolRef(school),
        streak,
        avgMs: player.avgMs,
      } satisfies PlayerStreakPayload, school.key);
    }

    for (const school of nextSchools) {
      const five = (school.top5 || []).map((uid) => nextInd.get(uid)).filter(Boolean);
      const total = five.reduce((n, p) => n + (p.score || 0), 0);
      if (total <= 0) continue;
      const best = five.slice().sort((a, b) => b.score - a.score || a.uid.localeCompare(b.uid))[0];
      const sharePct = (best.score / total) * 100;
      if (sharePct <= ARENA_CARRY_SHARE_PCT) continue;
      const beforeSchool = prevSchools.get(school.key);
      const beforeFive = (beforeSchool?.top5 || []).map((uid) => prevInd.get(uid)).filter(Boolean);
      const beforeTotal = beforeFive.reduce((n, p) => n + (p.score || 0), 0);
      const beforeBest = beforeFive.slice().sort((a, b) => b.score - a.score || a.uid.localeCompare(b.uid))[0];
      const wasCarrying = beforeTotal > 0 && beforeBest
        && (beforeBest.score / beforeTotal) * 100 > ARENA_CARRY_SHARE_PCT;
      // Same reason as the streak: a carry is a state, and a state repeated
      // every question is wallpaper. Announce the moment it becomes true.
      if (wasCarrying) continue;
      add('PLAYER_CARRY', {
        player: playerRef(best),
        school: schoolRef(school),
        sharePct: Math.round(sharePct * 10) / 10,
      } satisfies PlayerCarryPayload, school.key);
    }
  }

  // ── Board-wide facts ──────────────────────────────────────────────────────
  if (movementReadable && leader && runnerUp && leader.teamAvg > 0) {
    const marginPct = (marginAtTop / leader.teamAvg) * 100;
    const prevLeader = [...prevSchools.values()].filter((s) => isRanked(s.rank))
      .sort((a, b) => a.rank - b.rank);
    const wasTight = prevLeader.length >= 2 && prevLeader[0].teamAvg > 0
      && ((prevLeader[0].teamAvg - prevLeader[1].teamAvg) / prevLeader[0].teamAvg) * 100 < ARENA_TIE_MARGIN_PCT;
    if (marginPct < ARENA_TIE_MARGIN_PCT && !wasTight) {
      add('TIE', {
        schools: [schoolRef(leader), schoolRef(runnerUp)],
        margin: Math.round(marginPct * 100) / 100,
      } satisfies TiePayload, null);
    }
  }

  const topClimb = climbers[0];
  if (topClimb) {
    const causedBy = causesFor(topClimb.school);
    if (causedBy.length > 0) {
      // Deliberately NOT suppressed against the overtake above: this is the
      // round's superlative, the line the commentator reads and the halftime
      // card reuses, and at priority 5 the cap drops it whenever a real moment
      // needs the screen instead.
      add('BIGGEST_CLIMBER', {
        school: schoolRef(topClimb.school),
        gained: topClimb.gained,
        from: topClimb.from,
        to: topClimb.school.rank,
        causedBy,
      } satisfies BiggestClimberPayload, topClimb.school.key);
    }
  }

  // ── Cadence ───────────────────────────────────────────────────────────────
  // Halftime and the final five are the only cadence events derived here,
  // because they fire when a question CLOSES and their payload is the board
  // itself. The ones that fire when a question OPENS (ROUND_START,
  // FINAL_QUESTION) or when the tournament changes state (GRADING, CHAMPION_*)
  // belong to the state machine, which is the only thing that sees those edges.
  if (ctx.totalQuestions > 0 && ctx.questionsRemaining === Math.floor(ctx.totalQuestions / 2)) {
    const mvp = nextIndividuals.slice().sort((a, b) => a.rank - b.rank)[0] || null;
    add('HALFTIME', {
      questionIndex: ctx.questionIndex,
      totalQuestions: ctx.totalQuestions,
      top: nextSchools.slice(0, 5),
      margin: marginAtTop,
      mvp,
    } satisfies HalftimePayload, null);
  }

  if (ctx.questionsRemaining === 5) {
    const top = nextSchools.slice(0, 5);
    add('FINAL_FIVE', {
      questionsRemaining: ctx.questionsRemaining,
      top,
      margins: top.slice(0, -1).map((s, i) => s.teamAvg - top[i + 1].teamAvg),
    } satisfies FinalFivePayload, null);
  }

  return suppress(drafts, ctx);
}

/**
 * Drop everything the round cannot carry — here, in the emitter.
 *
 * The client could filter this itself, and that is exactly the bug: the
 * audience view and the commentator view would each keep a different four, and
 * the host would talk over an animation nobody is watching. One list leaves
 * this function and every surface renders the same round.
 */
function suppress(drafts: Draft[], ctx: DeriveContext): ArenaEvent[] {
  const cap = ctx.maxEvents ?? ARENA_ROUND_EVENT_CAP;

  const ranked = drafts.slice().sort((a, b) => {
    const pa = ARENA_EVENT_PRIORITY[a.type];
    const pb = ARENA_EVENT_PRIORITY[b.type];
    // Higher priority survives; equal priority is settled by creation order,
    // which becomes seq — so two identical rounds suppress identically and a
    // replay of the feed shows the same match.
    return pb - pa || a.order - b.order;
  });

  const kept: Draft[] = [];
  const minorSchools = new Set<string>();
  for (const draft of ranked) {
    if (kept.length >= cap) break;
    if (ARENA_EVENT_PRIORITY[draft.type] < ARENA_MINOR_PRIORITY && draft.schoolKey) {
      // One small moment per school per round. Without this a school having a
      // good round takes every slot with streaks and carries, and the school
      // that actually moved never gets announced.
      if (minorSchools.has(draft.schoolKey)) continue;
      minorSchools.add(draft.schoolKey);
    }
    kept.push(draft);
  }

  // Emit in creation order and number from ctx.seq with no gaps: the feed is
  // read by seq, and a suppressed event must leave no hole for a client to
  // interpret as a dropped write and wait for.
  return kept
    .sort((a, b) => a.order - b.order)
    .map((draft, i) => ({
      seq: ctx.seq + i,
      type: draft.type,
      priority: ARENA_EVENT_PRIORITY[draft.type],
      createdAt: ctx.now,
      round: ctx.round,
      questionIndex: ctx.questionIndex,
      ttlMs: ARENA_EVENT_TTL_MS[draft.type],
      payload: draft.payload,
    }) as unknown as ArenaEvent);
}
