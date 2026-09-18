/**
 * POST /api/arena/aggregate — the Arena engine's heartbeat.
 * ─────────────────────────────────────────────────────────
 * Recomputes the standings of a live tournament and emits the typed broadcast
 * events that the difference implies. Invoked on a short cadence (~5s) while a
 * tournament is `live` or `grading`; the CALLER owns the schedule — a cron
 * entry, or the run console during a rehearsal — this endpoint only ever does
 * one tick's worth of work and returns.
 *
 * THE SCALE PROPERTY THIS FILE EXISTS TO PRESERVE (design §F):
 * **nothing here accumulates a running total anywhere.** The naive design — a
 * school's score incremented on one school document as answers land — is the
 * 500-writes-per-second-per-document limit hit instantly, at the exact moment
 * of the tournament when every player is answering at once. So standings are
 * RECOMPUTED, never accumulated: for each school we run one indexed query for
 * its top `teamSize` players and rank from that. The per-tick work is therefore
 * bounded by the number of SCHOOLS (~150), not by the number of PLAYERS
 * (~10,000) — which is the whole reason this design scales, and the reason the
 * per-school query below must never be replaced by a scan of `players`.
 *
 * Correctness invariants, in the order the steps enforce them:
 *  1. Ranking is NEVER re-implemented here. `rankSchools` / `rankIndividuals`
 *     own the tiebreakers, and a second copy would disagree with the mobile
 *     client on a stream, with prize money attached.
 *  2. Events are derived by `deriveEvents` from two snapshots, never inferred
 *     from score diffs on a client.
 *  3. Events and the standings they describe are written in ONE batch, so a
 *     spectator never receives an event describing a board it cannot yet read.
 *
 * Security: two doors, one decision (`authorizeCronOrAdmin` in `_shared`).
 * Vercel and `advance` attach `Authorization: Bearer <CRON_SECRET>` (or
 * `x-cron-secret`); the run console's "recompute standings" presents a
 * signed-in admin's ID token instead, because a browser must never hold that
 * secret. Nothing else can drive the engine.
 *
 * Request  (POST):  { tid: string }
 * Response (200):   { ok, state, schools, players, events, seq }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  FieldValue,
  Timestamp,
  type Firestore,
  type QueryDocumentSnapshot,
  type Query,
  type QuerySnapshot,
} from 'firebase-admin/firestore';
import { getDb } from '../_lib/firebaseAdmin';
import {
  rankSchools,
  rankIndividuals,
  type SchoolInput,
  type PlayerInput,
} from '../../shared/arena/scoring';
import {
  deriveEvents,
  type ArenaEvent,
  type DeriveContext,
  type StandingsSnapshot,
  type SchoolStanding,
  type IndividualStanding,
} from '../../shared/arena/events';
import type { ArenaState } from '../../shared/arena/state';
import { authorizeCronOrAdmin, tournamentsInStates } from './_shared';
import { highestSeq, nextSeq, renumber, seqAfter, writeEvents } from './_events';

// ── Tunables ────────────────────────────────────────────────────────────────

/** Ticking outside these states would rewrite a board that has been announced. */
const AGGREGATE_STATES: ReadonlySet<string> = new Set<ArenaState>(['live', 'grading']);

/**
 * Schools ranked per tick.
 *
 * `standings/current` is ONE document that every spectator subscribes to, and a
 * Firestore document is capped at 1MB. Each school also contributes its five
 * counting members to `individuals` (see below), so the cap is really
 * `SCHOOL_CAP × (1 school row + 5 player rows)` — ~300KB at 250, with room for
 * the payloads to grow. A tournament that outgrows this needs a paged standings
 * document, not a bigger number here.
 */
const SCHOOL_CAP = 250;

/**
 * Players fetched per school.
 *
 * Never below `teamSize` (those are the five that score) and never below
 * `minPlayers` — `rankSchools` reads qualification off the number of players it
 * was handed, so a pool shorter than `minPlayers` would report a full school as
 * unqualified and drop it out of the running.
 */
const INDIVIDUAL_POOL = 5;

/** Per-school queries in flight at once. Bounded so one tick cannot self-DDoS. */
const QUERY_CONCURRENCY = 12;

/** Page size for the incremental roster scan, and the ceiling on its pages. */
const ROSTER_PAGE = 1000;
const ROSTER_MAX_PAGES = 20;

// ── Small readers ───────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

const num = (v: unknown, fallback = 0): number =>
  (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

const str = (v: unknown, fallback = ''): string =>
  (typeof v === 'string' && v !== '' ? v : fallback);

/** Firestore hands timestamps back as `Timestamp`; players may carry raw ms. */
const millis = (v: unknown): number | undefined => {
  if (v instanceof Timestamp) return v.toMillis();
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return undefined;
};

// ── The shapes this file computes from ──────────────────────────────────────

export interface PlayerRow {
  uid: string;
  displayName: string;
  schoolKey: string;
  schoolLabel: string;
  schoolShort: string;
  score: number;
  correct: number;
  answered: number;
  totalMs: number;
  streak: number;
  /** Answers scored at the full tier — `rankIndividuals` tiebreaker 3. */
  fullTierCount: number;
  /** Set by the answer endpoint when a round completed clean. Not re-derived. */
  perfectRound: boolean;
  registeredAt?: number;
}

export interface SchoolPool {
  key: string;
  label: string;
  shortName: string;
  /**
   * How many players are PRESENT for this school — the number qualification is
   * announced on. Deliberately not `rows.length`: the pool is capped at five,
   * so a school of two hundred would otherwise be shown as a school of five.
   */
  members: number;
  /** From the frozen roster: how many were in the room at doors close. */
  presentCount?: number;
  /** Top `POOL` players, already ordered by the indexed query. */
  rows: PlayerRow[];
  /** Sticky once set — see `qualifiedAtFor`. */
  qualifiedAt?: number;
}

export interface BuildSnapshotOptions {
  teamSize: number;
  minPlayers: number;
  /** Highest event seq this snapshot accounts for. See `nextSeq`. */
  seq: number;
  now: number;
}

/**
 * The stored form of `standings/current`: the snapshot `deriveEvents` compares,
 * plus the little the aggregator needs to resume from its own last tick.
 * `deriveEvents` reads only `schools` / `individuals`, so the extra fields are
 * inert to it.
 */
export interface StoredStandings extends Omit<StandingsSnapshot, 'schools'> {
  /**
   * `qualifiedAt` rides along on each school because it is `rankSchools`'
   * FINAL tiebreaker and must never be recomputed — see `qualifiedAtFor`.
   */
  schools: Array<SchoolStanding & { qualifiedAt?: number }>;
  /** Inclusive-lower-bound cursor for the incremental roster scan, in ms. */
  rosterCursorMs?: number;
  /** Last question index whose cadence events (halftime, final five) fired. */
  cadenceIndex?: number;
}

/**
 * Firestore rejects a document containing `undefined`, and an optional field
 * that is simply absent is the normal case here (a school that has not
 * qualified, a tournament whose cadence has never fired). Dropping the keys is
 * the difference between "not set yet" and a 500 in the middle of a tick.
 */
export function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) if (v !== undefined) out[key] = v;
  return out as T;
}

// ── Pure logic (unit-tested in api/__tests__/arenaAggregate.test.ts) ─────────

/**
 * Sequence allocation lives in `_events.ts`, with the emitters that share it.
 *
 * It used to live here, and that is precisely how the race got in: this tick
 * read `standings.seq` at the top and numbered its events from that read
 * hundreds of milliseconds later, so any event `advance` or `state` emitted in
 * between was overwritten — same seq, same document id, one survivor. Both
 * re-exported because this module is where the rest of the codebase and its
 * tests already import them from.
 */
export { nextSeq, eventDocId } from './_events';

/**
 * A board with no `schools` array is not a previous board.
 *
 * `standings/current` can exist before any tick has computed anything: the
 * event emitters create it carrying only `seq` when `TOURNAMENT_OPEN` fires
 * during registration. Diffing against that stub would make `deriveEvents`
 * read every school as absent-then-present and fire the whole board as a first
 * lead change — the "opens as confetti" failure its own comments describe.
 */
export function asPreviousBoard(previous: StoredStandings | null): StoredStandings | null {
  return previous && Array.isArray(previous.schools) && Array.isArray(previous.individuals)
    ? previous
    : null;
}

/**
 * The five that actually count, in the order `rankSchools` counted them.
 *
 * This mirrors the selection inside `rankSchools` (score desc, then total time
 * asc, then correct desc, then input order) rather than trusting the query's
 * two-key ordering. The difference only shows up when two team-mates are level
 * on score AND time — but `top5` is what `causedBy` is derived from, so a
 * mismatch would credit a school's overtake to a player `rankSchools` did not
 * count, which is precisely the kind of "two unrelated animations" the event
 * engine exists to prevent.
 */
export function countingFive(rows: PlayerRow[], teamSize: number): PlayerRow[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) =>
      b.row.score - a.row.score
      || a.row.totalMs - b.row.totalMs
      || b.row.correct - a.row.correct
      || a.index - b.index)
    .slice(0, Math.max(0, teamSize))
    .map((entry) => entry.row);
}

/** Mean response time per answer. Zero answers is 0, not NaN on the broadcast. */
export function avgMsOf(row: PlayerRow): number {
  return row.answered > 0 ? Math.round(row.totalMs / row.answered) : 0;
}

/**
 * Build the snapshot the broadcast reads and `deriveEvents` diffs.
 *
 * `individuals` carries EVERY pooled player — every school's counting five,
 * uncapped — because `deriveEvents` derives `causedBy` from their score gains
 * and silently drops any movement whose cause it cannot find. Thinning this
 * list to a podium would cost events without any error to show for it; the
 * documentation on `StandingsSnapshot.individuals` says so explicitly.
 */
export function buildSnapshot(pools: SchoolPool[], opts: BuildSnapshotOptions): StandingsSnapshot {
  const { teamSize, minPlayers, seq, now } = opts;

  const schoolInputs: SchoolInput[] = pools.map((pool) => ({
    key: pool.key,
    label: pool.label,
    playerScores: pool.rows.map((r) => r.score),
    playerTotalMs: pool.rows.map((r) => r.totalMs),
    playerCorrect: pool.rows.map((r) => r.correct),
    qualifiedAt: pool.qualifiedAt,
    presentCount: pool.presentCount,
  }));

  const byKey = new Map(pools.map((pool) => [pool.key, pool]));
  const schools: SchoolStanding[] = rankSchools(schoolInputs, { teamSize, minPlayers })
    .map((standing) => {
      const pool = byKey.get(standing.key);
      const rows = pool ? pool.rows : [];
      return {
        key: standing.key,
        label: standing.label,
        shortName: pool ? pool.shortName : standing.label,
        teamAvg: standing.teamAvg,
        teamTotalMs: standing.teamTotalMs,
        counted: standing.counted,
        // Truth, not `rows.length` — the pool is capped, the school is not.
        members: pool ? pool.members : standing.members,
        qualified: standing.qualified,
        rank: standing.rank,
        top5: countingFive(rows, teamSize).map((r) => r.uid),
      };
    });

  const rows = pools.flatMap((pool) => pool.rows);
  const byUid = new Map(rows.map((row) => [row.uid, row]));
  const playerInputs: PlayerInput[] = rows.map((row) => ({
    uid: row.uid,
    displayName: row.displayName,
    schoolKey: row.schoolKey,
    score: row.score,
    totalMs: row.totalMs,
    fullTierCount: row.fullTierCount,
    registeredAt: row.registeredAt,
  }));

  const individuals: IndividualStanding[] = rankIndividuals(playerInputs).map((standing) => {
    const row = byUid.get(standing.uid);
    return {
      uid: standing.uid,
      displayName: standing.displayName,
      schoolKey: standing.schoolKey,
      schoolShort: row ? row.schoolShort : '',
      score: standing.score,
      correct: row ? row.correct : 0,
      avgMs: row ? avgMsOf(row) : 0,
      rank: standing.rank,
      streak: row ? row.streak : 0,
      perfectRound: row ? row.perfectRound : false,
    };
  });

  return { seq, computedAt: now, schools, individuals };
}

/**
 * How many questions remain, as `deriveEvents` should read it on THIS tick.
 *
 * `HALFTIME` and `FINAL_FIVE` fire on a value of `questionsRemaining`, and that
 * value does not change between two ticks of the same question — so handing the
 * real number to every tick would re-emit halftime every five seconds for the
 * length of a question. Cadence is therefore offered exactly once per question
 * index, and only after that question's window has closed, which is when the
 * design says those two fire. `-1` matches no cadence threshold.
 */
export function cadenceRemaining(input: {
  questionsRemaining: number;
  closed: boolean;
  questionIndex: number;
  lastCadenceIndex: number | undefined;
}): number {
  if (!input.closed) return -1;
  if (input.lastCadenceIndex === input.questionIndex) return -1;
  return input.questionsRemaining;
}

/**
 * A school's `qualifiedAt` — the final tiebreaker — pinned the first time the
 * school reaches the floor and carried forward unchanged afterwards.
 *
 * Sticky on purpose. Recomputing it each tick would move the tiebreaker
 * underneath two level schools and swap them on screen with no answer having
 * changed, which is exactly the non-determinism `rankSchools` documents as a
 * requirement to avoid.
 */
export function qualifiedAtFor(
  previous: number | undefined,
  qualified: boolean,
  now: number,
): number | undefined {
  if (typeof previous === 'number' && Number.isFinite(previous)) return previous;
  return qualified ? now : undefined;
}

// ── Firestore plumbing ──────────────────────────────────────────────────────


/** Bounded fan-out: `limit` promises in flight, results in input order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function toPlayerRow(uid: string, data: Row): PlayerRow {
  const label = str(data.schoolLabel);
  return {
    uid,
    displayName: str(data.displayName),
    schoolKey: str(data.schoolKey),
    schoolLabel: label,
    // No invented abbreviation: fall back to the school's own name rather than
    // printing a truncation nobody chose on a broadcast (design §L).
    schoolShort: str(data.schoolShort, label),
    score: num(data.score),
    correct: num(data.correct),
    answered: num(data.answered),
    totalMs: num(data.totalMs),
    streak: num(data.streak),
    fullTierCount: num(data.fullTierCount),
    perfectRound: data.perfectRound === true,
    registeredAt: millis(data.registeredAt),
  };
}

/**
 * Which schools have players, without ever scanning `players` again.
 *
 * Firestore has no DISTINCT, so the set of school keys has to come from
 * somewhere — and re-deriving it from a full player scan every five seconds
 * would reintroduce the player-bounded cost this whole endpoint is shaped to
 * avoid (10,000 reads a tick, 3.6M over one tournament). Instead the roster is
 * INCREMENTAL: the keys already on the previous standings are carried forward,
 * and only players who registered since the last tick's cursor are read. Mid
 * tournament that is zero documents; the one real scan happens on the first
 * tick, once.
 *
 * The cursor is inclusive (`>=`) so two players sharing a registration
 * millisecond cannot straddle it and lose one of them; the handful of rows that
 * re-reads is the price of never silently dropping a school.
 */
async function discoverSchools(
  db: Firestore,
  tid: string,
  previous: StoredStandings | null,
): Promise<{ keys: string[]; cursorMs: number }> {
  const keys = new Set<string>((previous?.schools || []).map((s) => s.key).filter(Boolean));
  let cursorMs = num(previous?.rosterCursorMs, 0);

  const base = db.collection(`tournaments/${tid}/players`)
    .where('registeredAt', '>=', Timestamp.fromMillis(cursorMs))
    .orderBy('registeredAt', 'asc')
    .select('schoolKey', 'registeredAt');

  let after: QueryDocumentSnapshot | null = null;
  for (let page = 0; page < ROSTER_MAX_PAGES; page += 1) {
    // Annotated because `after` is assigned from `snap` below, so inference
    // would chase its own tail (TS7022) — the query and result types have to be
    // stated to break the cycle.
    const q: Query = after ? base.startAfter(after).limit(ROSTER_PAGE) : base.limit(ROSTER_PAGE);
    const snap: QuerySnapshot = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      const key = str(doc.get('schoolKey'));
      if (key) keys.add(key);
      const at = millis(doc.get('registeredAt'));
      if (typeof at === 'number' && at > cursorMs) cursorMs = at;
    }
    if (snap.size < ROSTER_PAGE) break;
    after = snap.docs[snap.size - 1];
  }

  return { keys: [...keys], cursorMs };
}

/**
 * One school's pool: its best players and its true head count.
 *
 * The ordering is `schoolKey ASC, score DESC, totalMs ASC` — exactly the
 * composite index declared in firestore.indexes.json. Any other ordering is
 * rejected by Firestore at query time, so this is not a preference.
 *
 * The `count()` aggregation alongside it is what keeps `members` honest without
 * reading the documents: it is one aggregation query per school, so it stays
 * inside the school-bounded budget.
 *
 * SPEC GAP, deliberately left open rather than half-solved here. Decision 3
 * (2026-09-18) says qualification is measured on players PRESENT, not players
 * registered — and this counts registered, because presence lives in
 * `presentAt` and there is no index that lets an indexed query filter on it
 * alongside `schoolKey`/`score`/`totalMs`. The two real fixes both live outside
 * this file: a doors-close job that FREEZES `qualified` and the present count
 * onto a school roster (which is what "evaluated at doors close" actually
 * means, and what this endpoint should then read), or a new composite index on
 * `schoolKey, presentAt`. Filtering the fetched rows instead would be worse
 * than doing nothing: the pool is five deep, so one absent player inside it
 * would unqualify a school with two hundred students in the room.
 */
async function loadPool(
  db: Firestore,
  tid: string,
  key: string,
  pool: number,
  previous: Map<string, SchoolStanding & { qualifiedAt?: number }>,
  minPlayers: number,
  now: number,
  /**
   * The frozen roster, keyed by school — written once by `doors-close` from
   * who was actually in the room. Without it this function qualifies schools
   * on REGISTRATIONS, which is precisely the rule Decision 3 overturned: a
   * school with five registered and three present would be ranked.
   */
  roster: Map<string, { present: number; qualified: boolean }>,
): Promise<SchoolPool | null> {
  const players = db.collection(`tournaments/${tid}/players`).where('schoolKey', '==', key);
  const [top, counted] = await Promise.all([
    players.orderBy('score', 'desc').orderBy('totalMs', 'asc').limit(pool).get(),
    players.count().get(),
  ]);

  const rows = top.docs.map((doc) => toPlayerRow(doc.id, doc.data() as Row));
  if (rows.length === 0) return null;

  const before = previous.get(key);
  const label = str(rows[0].schoolLabel, before ? before.label : key);
  const frozen = roster.get(key);
  // Before doors close there is no roster and registration IS the count; after
  // it, presence is the only count that decides anything.
  const headCount = frozen ? frozen.present : num(counted.data().count, rows.length);
  return {
    key,
    label,
    shortName: str(rows[0].schoolShort, before ? before.shortName : label),
    members: headCount,
    presentCount: frozen ? frozen.present : undefined,
    rows,
    qualifiedAt: qualifiedAtFor(
      before?.qualifiedAt,
      frozen ? frozen.qualified : rows.length >= minPlayers,
      now,
    ),
  };
}

/**
 * Write the board and the events it describes, numbering them at commit time.
 *
 * TWO properties, and the second is the one that was missing:
 *
 *  1. ONE TRANSACTION. Two writes would leave a window in which a spectator's
 *     listener has delivered "CODOSA just took the lead" while
 *     `standings/current` still shows the old order — the stage animates a move
 *     the board denies. Both land, or neither does.
 *  2. THE SEQ IS ALLOCATED HERE, from a `standings/current` re-read INSIDE the
 *     transaction, not from the read at the top of the tick. Between those two
 *     moments this tick runs one query per school; `advance` closing a question
 *     emits in that window, and the events numbered from the stale read landed
 *     on the same document ids — one event silently replacing another, and
 *     `standings.seq` set back below where the emitter had left it. Firestore
 *     aborts and retries whichever of the two transactions loses the race, so
 *     the retry reads the counter the winner moved.
 *
 * `previousSeq` is only a floor: it keeps the stored seq from going BACKWARDS
 * in the impossible-but-cheap-to-rule-out case of a standings document whose
 * counter was lost.
 */
export async function commitBoard(
  db: Firestore,
  tid: string,
  board: StoredStandings,
  events: ArenaEvent[],
  previousSeq: number,
): Promise<{ events: ArenaEvent[]; seq: number }> {
  const standingsRef = db.doc(`tournaments/${tid}/standings/current`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(standingsRef);
    const allocated = Math.max(
      highestSeq(snap.exists ? (snap.data() as Record<string, unknown>) : null),
      Math.max(0, previousSeq - 1),
    );
    const numbered = renumber(events, allocated + 1);
    writeEvents(tx, db, tid, numbered);
    const stored: StoredStandings = {
      ...board,
      // The board accounts for every event just emitted, so its seq is the
      // highest of them — the invariant `nextSeq` documents.
      seq: seqAfter(numbered, allocated),
    };
    tx.set(standingsRef, { ...stored, updatedAt: FieldValue.serverTimestamp() });
    return { events: numbered, seq: stored.seq };
  });
}

/**
 * One tournament's recompute, lifted out of the handler so the scheduled sweep
 * can run it for each live tournament without faking a request object.
 *
 * Returns the response rather than writing it: the sweep handles several
 * tournaments in one invocation, and a function that writes to `res` can only
 * ever answer for the first.
 */
async function aggregateOne(
  db: Firestore,
  tid: string,
  now: number,
): Promise<{ status: number; body: Row }> {

  try {
    // ── 1 · The tournament, and whether this tick should do anything ────────
    const tournamentRef = db.doc(`tournaments/${tid}`);
    const tournamentSnap = await tournamentRef.get();
    if (!tournamentSnap.exists) {
      return { status: 404, body: { error: 'not_found' } };
    }
    const tournament = tournamentSnap.data() as Row;
    const state = str(tournament.state);
    if (!AGGREGATE_STATES.has(state)) {
      // Not an error: the scheduler is dumb on purpose and calls on a fixed
      // cadence. Rewriting standings in `provisional` would edit a board that
      // has already been announced on a stream.
      return { status: 200, body: { ok: true, skipped: 'state', state } };
    }

    const teamSize = Math.max(1, num(tournament.teamSize, 5));
    const minPlayers = Math.max(1, num(tournament.minPlayers, 5));
    const totalQuestions = Math.max(0, num(tournament.questionCount, 0));
    const current = (tournament.currentQuestion || null) as Row | null;
    const questionIndex = current ? num(current.index, -1) : -1;
    const closesAt = current ? num(millis(current.closesAt), 0) : 0;
    const pool = Math.max(teamSize, minPlayers, INDIVIDUAL_POOL);

    // ── 2 · The previous board (also the roster cursor and cadence marker) ──
    const standingsRef = db.doc(`tournaments/${tid}/standings/current`);
    const previousSnap = await standingsRef.get();
    const previous = previousSnap.exists ? (previousSnap.data() as StoredStandings) : null;
    const previousByKey = new Map(
      (previous?.schools || []).map((s) => [s.key, s as SchoolStanding & { qualifiedAt?: number }]),
    );

    /*
     * The frozen roster, read once per tick.
     *
     * `doors-close` writes one small document per school saying how many of its
     * students were actually in the room. Bounded by school count and read in
     * one query, so it costs a page rather than a scan — and without it this
     * whole aggregation ranks schools on REGISTRATIONS, which is the rule
     * Decision 3 overturned.
     *
     * Empty before doors close, which is correct: until then registration IS
     * the count, and every school is provisional anyway.
     */
    const rosterSnap = await db.collection(`tournaments/${tid}/roster`).get();
    const roster = new Map<string, { present: number; qualified: boolean }>(
      rosterSnap.docs.map((d) => {
        const data = d.data() as Row;
        return [d.id, { present: num(data.present, 0), qualified: data.qualified === true }];
      }),
    );

    // ── 3 · One indexed query per SCHOOL. Never one per player. ─────────────
    const { keys, cursorMs } = await discoverSchools(db, tid, previous);
    const pools = (await mapLimit(
      keys.slice(0, SCHOOL_CAP),
      QUERY_CONCURRENCY,
      (key) => loadPool(db, tid, key, pool, previousByKey, minPlayers, now, roster),
    )).filter((p): p is SchoolPool => p !== null);

    // ── 4 · Rank with the shared functions, then diff against the last board ─
    //
    // `seq` here is PROVISIONAL. It is what the board read at the top of this
    // tick, which is precisely the value that an emitter committing while these
    // queries ran has already moved. `deriveEvents` needs a number to count
    // from; the real allocation happens at commit time in step 5, and the
    // events are renumbered there.
    const seq = nextSeq(previous);
    const next = buildSnapshot(pools, { teamSize, minPlayers, seq, now });

    const ctx: DeriveContext = {
      seq,
      round: num(tournament.currentRound, 0),
      questionIndex,
      questionsRemaining: cadenceRemaining({
        questionsRemaining: Math.max(0, totalQuestions - (questionIndex + 1)),
        closed: closesAt > 0 && now >= closesAt,
        questionIndex,
        lastCadenceIndex: previous?.cadenceIndex,
      }),
      totalQuestions,
      now,
    };
    const events: ArenaEvent[] = deriveEvents(asPreviousBoard(previous), next, ctx);

    const qualifiedAtByKey = new Map(pools.map((p) => [p.key, p.qualifiedAt]));
    const board: StoredStandings = withoutUndefined({
      ...next,
      schools: next.schools.map((s) => withoutUndefined({
        ...s,
        qualifiedAt: qualifiedAtByKey.get(s.key),
      })),
      rosterCursorMs: cursorMs,
      cadenceIndex: ctx.questionsRemaining >= 0 ? questionIndex : previous?.cadenceIndex,
    });

    // ── 5 · Events and the board they describe, in ONE transaction ──────────
    const committed = await commitBoard(db, tid, board, events, seq);

    return {
      status: 200,
      body: {
        ok: true,
        state,
        schools: next.schools.length,
        players: next.individuals.length,
        events: committed.events.length,
        seq: committed.seq,
      },
    };
  } catch (err) {
    console.error('[arena/aggregate] error:', err);
    return { status: 500, body: { error: 'aggregate_failed' } };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // GET as well as POST: a Vercel cron fires a GET, and the safety net that
  // stops a frozen board is this endpoint's cron entry.
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  // `advance` calls this at every question close with the cron secret; the run
  // console's "recompute standings" calls it by hand. One door, two keys.
  const db = getDb();
  const actor = await authorizeCronOrAdmin(req, res, db, 'arena-control');
  if (!actor) return;

  const body: Row = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const tid = str(body.tid, str(req.query.tid));

  // No id: this is the scheduled sweep. It recomputes every tournament that is
  // actually running, which is the only thing the cron entry can mean — it has
  // no arguments to give us.
  if (!tid) {
    const ids = await tournamentsInStates(db, ['live', 'grading']);
    const ran: string[] = [];
    for (const id of ids) {
      try {
        await aggregateOne(db, id, Date.now());
        ran.push(id);
      } catch (err) {
        console.error(`[arena/aggregate] sweep failed for ${id}:`, err);
      }
    }
    res.status(200).json({ ok: true, swept: ran.length, tournaments: ran });
    return;
  }

  const out = await aggregateOne(db, tid, Date.now());
  res.status(out.status).json(out.body);
}
