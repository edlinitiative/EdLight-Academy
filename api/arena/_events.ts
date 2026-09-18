/**
 * arena/_events — one place that hands out event sequence numbers.
 * ────────────────────────────────────────────────────────────────
 * `shared/arena/events.ts` DERIVES the events that a change in the standings
 * implies. It cannot derive the ones that fire when a question opens or when
 * the tournament changes state, because it never sees those edges — only
 * `advance` and `state` do. This module is where those emitters live, and,
 * more importantly, it is where EVERY writer of an event gets its `seq`.
 *
 * ── Why the allocation had to move here ────────────────────────────────────
 * `seq` is not decoration. `eventDocId(seq)` is the event's DOCUMENT ID, so
 * two writers that both believe the next seq is 41 do not produce two events —
 * they produce one, because the second `set()` overwrites the first. And
 * `standings/current.seq` is the allocator's only state, so the loser also
 * pushes the counter backwards and the collision repeats.
 *
 * Before this module the aggregate tick read `standings.seq` at the TOP of a
 * tick and wrote its events, numbered from that read, in a batch at the
 * bottom — hundreds of milliseconds of queries later. Any emitter that
 * committed inside that gap was silently erased. `/api/arena/aggregate` runs
 * on a cron AND is driven at every question close, which is exactly when
 * `advance` emits, so the gap was not theoretical.
 *
 * THE RULE, and it is the whole of the fix:
 *
 *   A seq may only be allocated from a `standings/current` snapshot that was
 *   READ INSIDE THE SAME TRANSACTION THAT WRITES THE EVENTS.
 *
 * Firestore's optimistic concurrency does the rest: two transactions that both
 * read that document cannot both commit, so the loser retries and re-reads the
 * counter the winner just moved. `appendEvents` below takes the snapshot as an
 * argument for precisely this reason — it is a signature that makes the unsafe
 * call awkward to write.
 *
 * ── Idempotence ────────────────────────────────────────────────────────────
 * Most emitters here are called from INSIDE the transaction that performs the
 * transition they describe (opening a question, entering `grading`). That
 * transition happens exactly once by construction, so the event does too. The
 * one emitter that cannot work that way is `QUESTION_CLOSED`, whose payload is
 * a summary of every answer to the question and therefore cannot be gathered
 * inside a transaction; it goes through `emitKeyedEvents`, which records a
 * marker under `tournaments/{tid}/eventKeys/{key}` in the same transaction as
 * the events and refuses to emit twice for the same key.
 *
 * ── The answer key never travels ───────────────────────────────────────────
 * Nothing in this file reads `questions/{index}.answerIndex`, and no payload
 * derives from it. `QUESTION_CLOSED` summarises `answers/*` — which choice was
 * right is never named, only how many students were right, and that is emitted
 * after the window has closed and the key is already public on `live/{index}`.
 * `ROUND_START` carries the question's `category`, which is a topic word.
 */

import {
  FieldValue,
  Timestamp,
  type DocumentSnapshot,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import {
  ARENA_EVENT_PRIORITY,
  ARENA_EVENT_TTL_MS,
  type ArenaEvent,
  type ArenaEventType,
  type ArenaPlayerRef,
  type ArenaSchoolRef,
  type IndividualStanding,
  type SchoolStanding,
  type StandingsSnapshot,
} from '../../shared/arena/events';

type Row = Record<string, unknown>;

const num = (v: unknown, fallback = 0): number =>
  (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

const str = (v: unknown, fallback = ''): string =>
  (typeof v === 'string' && v !== '' ? v : fallback);

// ── Allocation ──────────────────────────────────────────────────────────────

/**
 * The first seq this writer may hand out.
 *
 * `standings.seq` is the HIGHEST event seq the stored board already accounts
 * for, so the next event starts one above it. Kept here rather than in
 * aggregate.ts so that the allocator and its definition live together;
 * aggregate.ts re-exports it for the callers that already import it from there.
 */
export function nextSeq(previous: StandingsSnapshot | null): number {
  return highestSeq(previous as Row | null) + 1;
}

/**
 * The highest seq already allocated, read defensively off a standings document.
 *
 * Defensive because the document may legitimately be a stub: `appendEvents`
 * creates `standings/current` carrying nothing but `seq` when the first event
 * of the night (`TOURNAMENT_OPEN`) fires during registration, long before any
 * aggregate tick has computed a board.
 */
export function highestSeq(standings: Row | null | undefined): number {
  const raw = standings && typeof standings.seq === 'number' && Number.isFinite(standings.seq)
    ? standings.seq
    : 0;
  return Math.max(0, Math.trunc(raw));
}

/**
 * Document id for an event.
 *
 * Zero-padded because Firestore orders document ids LEXICOGRAPHICALLY: with raw
 * ids, `events/10` sorts before `events/9` and a broadcast paging the feed by
 * document id replays the match out of order. The numeric `seq` is on the
 * document too, so a client may order by either.
 */
export function eventDocId(seq: number): string {
  return String(Math.max(0, Math.trunc(seq))).padStart(6, '0');
}

// ── Drafts ──────────────────────────────────────────────────────────────────

/** An event before it has been numbered. The envelope is filled in from here. */
export interface ArenaEventDraft {
  type: ArenaEventType;
  payload: unknown;
  round: number;
  questionIndex: number;
}

/**
 * Put drafts on the envelope, numbered from `fromSeq`, gapless.
 *
 * Pure, so the numbering is testable without a database. `priority` and `ttlMs`
 * are read from the shared tables rather than passed in: an emitter that could
 * choose its own priority is an emitter that can take the screen from a lead
 * change, and the tables are what the director and the scenes agree on.
 */
export function numberDrafts(drafts: ArenaEventDraft[], fromSeq: number, now: number): ArenaEvent[] {
  return drafts.map((draft, i) => ({
    seq: fromSeq + i,
    type: draft.type,
    priority: ARENA_EVENT_PRIORITY[draft.type],
    createdAt: now,
    round: draft.round,
    questionIndex: draft.questionIndex,
    ttlMs: ARENA_EVENT_TTL_MS[draft.type],
    payload: draft.payload,
  }) as unknown as ArenaEvent);
}

/**
 * Re-number already-built events from `fromSeq`, gapless and in order.
 *
 * `deriveEvents` numbers its own output from the seq the tick READ, which is
 * the stale value this module exists to stop trusting. The aggregate tick
 * therefore renumbers at commit time; everything else about the events it
 * produced — order, payload, suppression — is already decided and preserved.
 */
export function renumber(events: ArenaEvent[], fromSeq: number): ArenaEvent[] {
  return events.map((event, i) => ({ ...event, seq: fromSeq + i }) as ArenaEvent);
}

/** The seq a board that has just emitted `events` accounts for. */
export function seqAfter(events: ArenaEvent[], previousHighest: number): number {
  return events.length ? events[events.length - 1].seq : previousHighest;
}

// ── Writing ─────────────────────────────────────────────────────────────────

/** The sliver of `Transaction` / `WriteBatch` this module writes through. */
export interface EventWriter {
  set(ref: FirebaseFirestore.DocumentReference, data: Row, options?: { merge?: boolean }): unknown;
}

/** Write the event documents. Callers own the standings write. */
export function writeEvents(
  writer: EventWriter,
  db: Firestore,
  tid: string,
  events: ArenaEvent[],
): void {
  for (const event of events) {
    writer.set(db.doc(`tournaments/${tid}/events/${eventDocId(event.seq)}`), {
      ...event,
      tid,
      writtenAt: FieldValue.serverTimestamp(),
    });
  }
}

/**
 * Allocate, write and bump — the safe path, for a caller inside a transaction.
 *
 * `standingsSnap` MUST have been read by `tx` itself. Passing a snapshot read
 * outside the transaction compiles and is exactly the race this module exists
 * to close, so it is called out here and nowhere else: if you did not write
 * `await tx.get(standingsRef)` on the line above, do not call this.
 *
 * The standings write is a MERGE of one field. The aggregate tick replaces the
 * whole board in the same transaction and therefore does not use this helper —
 * it numbers with `renumber` and writes `seq` itself, from the same snapshot.
 */
export function appendEvents(
  tx: Transaction,
  db: Firestore,
  tid: string,
  standingsSnap: DocumentSnapshot,
  drafts: ArenaEventDraft[],
  now: number,
): ArenaEvent[] {
  if (drafts.length === 0) return [];
  const from = highestSeq(standingsSnap.exists ? (standingsSnap.data() as Row) : null) + 1;
  const events = numberDrafts(drafts, from, now);
  writeEvents(tx, db, tid, events);
  // Merge, never set: this document is the broadcast's board, and an emitter
  // firing during registration must create it carrying only the counter rather
  // than a board of nobody that the next aggregate tick would diff against.
  tx.set(db.doc(`tournaments/${tid}/standings/current`), { seq: events[events.length - 1].seq }, { merge: true });
  return events;
}

// ── The keyed emitter, for edges that cannot emit inside their transaction ──

/**
 * A key is a document id, so it may not carry `/` and may not be `.` or `..`.
 * Built from constants and a question index in practice; validated anyway,
 * because a key that silently becomes a different key is an event emitted
 * twice on a stream.
 */
function isValidEventKey(key: string): boolean {
  return key.length > 0 && key.length <= 120 && /^[A-Za-z0-9_-]+$/.test(key);
}

export interface KeyedEmitResult {
  emitted: ArenaEvent[];
  /** True when this key had already been emitted and nothing was written. */
  duplicate: boolean;
}

/**
 * Emit once per key, ever.
 *
 * For the edges whose payload cannot be gathered inside the transaction that
 * produced them — `QUESTION_CLOSED` summarises every answer to a question, and
 * a transaction that read ten thousand documents would hold the standings lock
 * for the length of the pause. The marker and the events are written together,
 * so a retry either finds the marker (and writes nothing) or finds neither.
 */
export async function emitKeyedEvents(
  db: Firestore,
  tid: string,
  key: string,
  drafts: ArenaEventDraft[],
  now: number,
): Promise<KeyedEmitResult> {
  if (drafts.length === 0) return { emitted: [], duplicate: false };
  if (!isValidEventKey(key)) throw new Error(`arena/_events: invalid event key "${key}"`);

  const markerRef = db.doc(`tournaments/${tid}/eventKeys/${key}`);
  const standingsRef = db.doc(`tournaments/${tid}/standings/current`);

  return db.runTransaction(async (tx): Promise<KeyedEmitResult> => {
    // Both reads before any write — Firestore's rule, and the standings read is
    // also what makes the allocation safe against a concurrent aggregate tick.
    const markerSnap = await tx.get(markerRef);
    const standingsSnap = await tx.get(standingsRef);
    if (markerSnap.exists) return { emitted: [], duplicate: true };

    const events = appendEvents(tx, db, tid, standingsSnap, drafts, now);
    tx.set(markerRef, {
      key,
      firstSeq: events[0].seq,
      lastSeq: events[events.length - 1].seq,
      types: events.map((e) => e.type),
      emittedAt: Timestamp.fromMillis(now),
    });
    return { emitted: events, duplicate: false };
  });
}

// ── Payload builders (pure; unit-tested) ────────────────────────────────────

export const schoolRefOf = (s: SchoolStanding): ArenaSchoolRef => ({
  key: s.key,
  label: s.label,
  shortName: s.shortName,
});

export const playerRefOf = (p: IndividualStanding): ArenaPlayerRef => ({
  uid: p.uid,
  displayName: p.displayName,
  schoolKey: p.schoolKey,
  schoolShort: p.schoolShort,
});

/** The stored board, read defensively — it may be a stub carrying only `seq`. */
export function boardOf(data: Row | null | undefined): {
  schools: SchoolStanding[];
  individuals: IndividualStanding[];
} {
  const schools = Array.isArray(data?.schools) ? (data!.schools as SchoolStanding[]) : [];
  const individuals = Array.isArray(data?.individuals)
    ? (data!.individuals as IndividualStanding[])
    : [];
  return { schools, individuals };
}

/** Ranked schools, best first. Rank 0 means "not competing", not "last". */
export function rankedSchools(schools: SchoolStanding[]): SchoolStanding[] {
  return schools
    .filter((s) => num(s?.rank, 0) > 0)
    .slice()
    .sort((a, b) => a.rank - b.rank);
}

/** How many teamAvg each contender is behind the leader, biggest threat first. */
export function atStakeFrom(
  schools: SchoolStanding[],
  limit: number,
): Array<{ school: ArenaSchoolRef; behind: number }> {
  const ranked = rankedSchools(schools).slice(0, Math.max(0, limit));
  const leader = ranked[0];
  if (!leader) return [];
  return ranked.map((school) => ({
    school: schoolRefOf(school),
    // Two decimals: teamAvg is a mean of scores, and the gap the host reads out
    // is "quatre points", not a float with eleven digits behind it.
    behind: Math.round((leader.teamAvg - school.teamAvg) * 100) / 100,
  }));
}

/**
 * The provisional school champion, and the five that earned it.
 *
 * Read from the board that was ANNOUNCED — never recomputed. A podium
 * recalculated at reveal time is a podium that can disagree with the one the
 * room watched settle, on the one screen where that cannot happen.
 */
export function championSchoolFrom(
  schools: SchoolStanding[],
  individuals: IndividualStanding[],
): { school: ArenaSchoolRef; teamAvg: number; top5: ArenaPlayerRef[] } | null {
  const winner = rankedSchools(schools).find((s) => s.rank === 1 && s.qualified !== false);
  if (!winner) return null;
  const byUid = new Map(individuals.map((p) => [p.uid, p]));
  const top5 = (winner.top5 || [])
    .map((uid) => byUid.get(uid))
    .filter((p): p is IndividualStanding => !!p)
    .map(playerRefOf);
  return { school: schoolRefOf(winner), teamAvg: winner.teamAvg, top5 };
}

/** The provisional individual podium: ranks 1..`size`, in rank order. */
export function podiumFrom(individuals: IndividualStanding[], size = 3): IndividualStanding[] {
  return individuals
    .filter((p) => num(p?.rank, 0) >= 1 && num(p?.rank, 0) <= size)
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .slice(0, size);
}

// ── QUESTION_CLOSED's figures ───────────────────────────────────────────────

/**
 * How many answer documents one question's summary will read.
 *
 * The one place in the Arena engine whose cost is bounded by PLAYERS rather
 * than by schools — `answers/{uid}_{index}` is one document per student per
 * question and there is no aggregation that can produce a MINIMUM. It happens
 * once per question close (25 times a night), not once per five-second tick,
 * which is the distinction that makes it affordable; the cap is the promise
 * that it stays that way.
 */
export const ANSWER_SCAN_CAP = 20_000;

/** One answer row, as the summary reads it. Never carries a choice. */
export interface AnswerStatRow {
  uid: string;
  correct: boolean;
  elapsedMs: number;
  late: boolean;
  impossible: boolean;
}

export interface QuestionStats {
  /** Percentage of ON-TIME submissions that were correct, one decimal. */
  correctPct: number;
  /** The fastest correct on-time answer, or null when there was none. */
  fastest: { uid: string; elapsedMs: number } | null;
  answers: number;
}

/**
 * Summarise one question from its answers.
 *
 * Two exclusions, both of which would otherwise put a false number on a screen:
 *
 *  · LATE answers do not count. The key becomes public the moment the window
 *    closes and `answer.ts` keeps accepting for ten seconds afterwards, on
 *    purpose — so a late "correct" is somebody reading the reveal. It already
 *    counts for nothing that ranks; counting it in "% de bonnes réponses"
 *    would inflate the one figure the audience is asked to read.
 *  · IMPOSSIBLE submissions cannot be the fastest. `scoreAnswer` records an
 *    impossible span as a NEGATIVE elapsed time — the negative IS the finding —
 *    so an unfiltered minimum would put a cheat's name under "réponse la plus
 *    rapide" with a nonsense duration, at full screen.
 *
 * The denominator is submissions received on time, not students present: a
 * student who did not answer at all did not get it wrong, and folding the
 * silent into the denominator would report a question as harder than it was.
 */
export function summariseAnswers(rows: AnswerStatRow[]): QuestionStats {
  const onTime = rows.filter((row) => !row.late);
  const correct = onTime.filter((row) => row.correct);
  const correctPct = onTime.length > 0
    ? Math.round((correct.length / onTime.length) * 1000) / 10
    : 0;

  let fastest: { uid: string; elapsedMs: number } | null = null;
  for (const row of correct) {
    if (row.impossible || !(row.elapsedMs > 0)) continue;
    if (!fastest || row.elapsedMs < fastest.elapsedMs
      // uid as the tie-break so two identical spans cannot name a different
      // student on a re-read of the same feed.
      || (row.elapsedMs === fastest.elapsedMs && row.uid.localeCompare(fastest.uid) < 0)) {
      fastest = { uid: row.uid, elapsedMs: row.elapsedMs };
    }
  }

  return { correctPct, fastest, answers: onTime.length };
}

/**
 * Read one question's answers and summarise them.
 *
 * Returns null when the scan hit its cap — a percentage computed from an
 * arbitrary page of the submissions is a made-up statistic, and a missing
 * sequence is better than a wrong number on a projector. The scan is projected
 * (`select`) so nothing about a student's CHOICE is ever loaded.
 */
export async function loadQuestionStats(
  db: Firestore,
  tid: string,
  index: number,
): Promise<QuestionStats | null> {
  const snap = await db.collection(`tournaments/${tid}/answers`)
    .where('index', '==', index)
    .select('uid', 'correct', 'elapsedMs', 'late', 'impossible')
    .limit(ANSWER_SCAN_CAP + 1)
    .get();

  if (snap.size > ANSWER_SCAN_CAP) {
    console.warn(`[arena/_events] question ${index} of ${tid} has more than ${ANSWER_SCAN_CAP} answers; skipping QUESTION_CLOSED rather than summarising a sample`);
    return null;
  }

  return summariseAnswers(snap.docs.map((doc) => ({
    uid: str(doc.get('uid'), doc.id.split('_')[0]),
    correct: doc.get('correct') === true,
    elapsedMs: num(doc.get('elapsedMs'), 0),
    late: doc.get('late') === true,
    impossible: doc.get('impossible') === true,
  })));
}

/**
 * Name the fastest student, from the board first and their own row second.
 *
 * `standings/current` already carries the denormalised name and school for
 * every counting player, so the common case costs nothing extra; a student
 * outside every school's five is looked up directly. Returns null rather than
 * a nameless reference — the scene renders "aucune bonne réponse" for null,
 * which is a true sentence, where a blank name is just broken.
 */
export async function nameFastest(
  db: Firestore,
  tid: string,
  uid: string,
  individuals: IndividualStanding[],
): Promise<ArenaPlayerRef | null> {
  const known = individuals.find((p) => p.uid === uid);
  if (known) return playerRefOf(known);

  const snap = await db.doc(`tournaments/${tid}/players/${uid}`).get();
  if (!snap.exists) return null;
  const row = snap.data() as Row;
  const displayName = str(row.displayName);
  if (!displayName) return null;
  const label = str(row.schoolLabel);
  return {
    uid,
    displayName,
    schoolKey: str(row.schoolKey),
    schoolShort: str(row.schoolShort, label),
  };
}

// ── TOURNAMENT_OPEN's counts ────────────────────────────────────────────────

/** Bounded like the answer scan, and for the same reason. Runs once a night. */
export const ROSTER_SCAN_CAP = 50_000;

/**
 * How many students and how many schools are registered, right now.
 *
 * Firestore has no DISTINCT, so the school count has to come from a projected
 * scan of the roster. That is a player-bounded read, and it is allowed here for
 * exactly one reason: this runs once, on the `registration → doors` transition
 * an admin presses by hand. It must never be called from a tick.
 */
export async function registrationCounts(
  db: Firestore,
  tid: string,
): Promise<{ players: number; schools: number }> {
  const snap = await db.collection(`tournaments/${tid}/players`)
    .select('schoolKey')
    .limit(ROSTER_SCAN_CAP)
    .get();
  const schools = new Set<string>();
  for (const doc of snap.docs) {
    const key = str(doc.get('schoolKey'));
    if (key) schools.add(key);
  }
  return { players: snap.size, schools: schools.size };
}
