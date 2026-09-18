/**
 * Vercel serverless function: POST /api/arena/doors-close
 * ────────────────────────────────────────────────────────────────────────────
 * Freeze the qualification roster at the moment the doors close.
 *
 * WHY THIS ENDPOINT EXISTS AT ALL. Decision 3 of 2026-09-18 says a registered
 * no-show does NOT count toward a school's five: qualification is measured at
 * DOORS CLOSE, on players PRESENT. `api/arena/aggregate.ts` cannot enforce
 * that. Its per-school query is ordered `schoolKey ASC, score DESC, totalMs
 * ASC` to match the one composite index that exists, and there is no way to
 * filter on `presentAt` alongside those without another index — so its
 * `members` count is a head count of REGISTERED players. Its own header calls
 * this out and names the fix. This is the fix.
 *
 * Filtering the five fetched rows instead would be WORSE than doing nothing:
 * the pool is five deep, so a single absent player inside it would unqualify a
 * school with two hundred students standing in the room.
 *
 * So the answer is frozen rather than recomputed. This job runs once, while
 * the tournament is still `doors`, and writes one immutable document per
 * school — `tournaments/{tid}/roster/{schoolKey}` — carrying the registered
 * count, the present count, and the qualification verdict those two produced.
 * From then on qualification is a stored fact with a timestamp on it, not a
 * derivation that can quietly give a different answer on the next tick.
 *
 * ── Three properties this file is built around ────────────────────────────
 *
 *  · IDEMPOTENT. A second call after the roster is frozen returns the stored
 *    summary and writes NOTHING. The freeze is claimed with a lease so two
 *    schedulers firing together cannot both scan and both write — presence is
 *    still landing while the state is `doors`, so two concurrent scans would
 *    genuinely produce two different answers.
 *  · REFUSES AFTER `live`. Once the board is ranking on a roster, re-freezing
 *    it is indefensible: a school that lost qualification mid-tournament
 *    because a job re-ran is a result nobody can defend on a stream, and there
 *    is no way to un-announce it. A run that arrives late is rejected loudly so
 *    a human sees it, never absorbed silently.
 *  · A SCHOOL THAT FAILS TO QUALIFY IS NOT REMOVED. Its students still play,
 *    still answer, still score, still appear in the individual standings. The
 *    school is simply UNRANKED. Every roster document says so in three ways
 *    (`excluded: false`, `studentsStillPlay: true`, and a plain-language
 *    `meaning`) because a later reader — a person, a query, or the next
 *    endpoint — must not be able to mistake "not qualified" for "excluded",
 *    and the cost of that mistake is a student told they may not play.
 *
 * ── Auth ──────────────────────────────────────────────────────────────────
 * Two doors, because this job has two legitimate callers and only one of them
 * is a person:
 *   · `Authorization: Bearer <CRON_SECRET>` (or `x-cron-secret`) — the
 *     scheduler, which has no Firebase user to authenticate as. Same model as
 *     api/arena/advance.ts and api/arena/aggregate.ts.
 *   · A signed-in admin (`users/{uid}.role === 'admin'`, the same test
 *     `isAdmin()` makes in firestore.rules), rate-limited on the
 *     `arena-doors-close` bucket, for the run console's manual trigger.
 *
 * Request  (POST): { tournamentId: string }   (`tid` accepted as an alias)
 * Response (200):  { ok: true, action, schools, qualifiedSchools,
 *                    playersRegistered, playersPresent, minPlayers, rows? }
 *   action ∈ frozen | already_frozen
 *
 * Errors: 400 invalid input · 401 unauthorized · 403 not_admin ·
 *         404 tournament_not_found · 409 doors_not_closed /
 *         doors_already_closed / freeze_in_progress · 429 rate limited ·
 *         500 roster_too_large / freeze_failed.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  FieldPath,
  FieldValue,
  Timestamp,
  type DocumentReference,
  type Firestore,
  type Query,
  type QuerySnapshot,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { requireAuthDecoded } from '../_lib/requireAuth';
import { checkRateLimit } from '../_lib/rateLimit';
import { getDb } from '../_lib/firebaseAdmin';
import {
  DEFAULT_MIN_PLAYERS,
  asArenaState,
  isValidTournamentId,
  parseBody,
  toMillis,
  tournamentsInStates,
} from './_shared';
import type { ArenaState } from '../../shared/arena/state';

// ── Tunables ────────────────────────────────────────────────────────────────

/**
 * How many present uids are stored on a school's roster document.
 *
 * The roster is an audit record, not a directory: a reviewer needs to be able
 * to pull the actual players behind a contested count, and 500 is far past the
 * largest plausible school. Past the cap the document records `truncated: true`
 * and the COUNT stays exact — an approximate count would change a
 * qualification verdict, an approximate uid list only shortens an audit trail.
 */
export const PRESENT_UIDS_CAP = 500;

/** Players read per page. Bounded so one page cannot exhaust function memory. */
const ROSTER_PAGE = 1_000;

/**
 * Pages the scan will take before giving up.
 *
 * Hitting this ABORTS the freeze rather than writing what was read. A partial
 * scan is the one failure mode that must never reach Firestore here: schools
 * whose players sit on the unread pages would be frozen at zero present and
 * marked unqualified, which looks exactly like a real verdict.
 */
const ROSTER_MAX_PAGES = 50;

/** Documents per write batch. Firestore's hard limit is 500. */
const ROSTER_BATCH = 400;

/**
 * How long one freeze attempt may hold the lease before another may take over.
 *
 * Without a lease, two schedulers firing together both scan — and because
 * presence is STILL LANDING while the state is `doors`, the two scans produce
 * two different answers and the loser's answer overwrites the winner's. With
 * no expiry, a crashed attempt would wedge the freeze forever, which at 18:00
 * on a live night is worse than a rare double-scan.
 */
const FREEZE_LEASE_MS = 120_000;

// ── Pure logic (unit-tested in api/__tests__/arenaDoorsClose.test.ts) ────────

type Row = Record<string, unknown>;

/** What this invocation may do, decided from the tournament document alone. */
export type DoorsClosePlan =
  | 'freeze'
  | 'already_frozen'
  | 'in_progress'
  | 'too_early'
  | 'too_late';

export interface DoorsClosePlanInput {
  state: ArenaState | null;
  /** `rosterFrozenAt` in ms, or null if the roster has never been frozen. */
  frozenAt: number | null;
  /** `rosterFreezeStartedAt` in ms — an attempt currently holding the lease. */
  freezeStartedAt: number | null;
  now: number;
}

/**
 * Freeze, replay, or refuse.
 *
 * Order matters, and each branch is a decision about what is safest to do when
 * something has already happened:
 *
 *  1. ALREADY FROZEN wins over everything, including the state. A re-run in
 *     `live` or `provisional` must replay the stored answer, not argue with it
 *     — that is what makes this endpoint safe to wire into a cron that retries.
 *  2. AN ATTEMPT IN FLIGHT backs off. Two concurrent scans during `doors` read
 *     different presence and would disagree.
 *  3. `doors` FREEZES. This is the only state where the answer is the one
 *     Decision 3 asks for: measured at doors close, on players present.
 *  4. ANYTHING PAST `doors` REFUSES. The board is already ranking, and a fresh
 *     freeze could hand a school a different verdict than the one announced.
 *     `void` refuses too: an event that did not count has no roster to publish.
 *  5. ANYTHING BEFORE `doors` REFUSES. Presence has not been collected yet, so
 *     a freeze now would record every school at zero present and unqualify the
 *     entire tournament.
 */
export function planDoorsClose(input: DoorsClosePlanInput): DoorsClosePlan {
  const { state, frozenAt, freezeStartedAt, now } = input;

  if (frozenAt !== null) return 'already_frozen';

  if (freezeStartedAt !== null && now - freezeStartedAt < FREEZE_LEASE_MS) {
    return 'in_progress';
  }

  if (state === 'doors') return 'freeze';
  if (state === 'draft' || state === 'registration' || state === null) return 'too_early';
  return 'too_late';
}

/** One player row, reduced to the three fields qualification depends on. */
export interface PresenceRow {
  uid: string;
  schoolKey: string;
  schoolLabel?: string;
  schoolShort?: string;
  /** Stamped by api/arena/presence.ts the first time the player is seen. */
  presentAt: unknown;
  /** True when that first sighting happened while the state was `doors`. */
  duringDoors: unknown;
}

/**
 * Does this player count toward their school's five?
 *
 * BOTH conditions, and the second is the one that carries the rule.
 * `presentAt` alone means "was in the room at some point"; presence.ts keeps
 * accepting heartbeats into `live` on purpose, so that a client that crosses
 * the transition is not spammed with errors. `duringDoors === true` is the
 * field presence.ts stamps to say the sighting happened BEFORE the cut-off,
 * which is precisely what "evaluated at doors close" means — and reading it
 * rather than comparing `presentAt` against `doorsAt` is deliberate: an admin
 * who slides `doorsAt` after the fact would otherwise silently re-decide
 * qualification for every school in the tournament.
 */
export function countsPresent(row: Pick<PresenceRow, 'presentAt' | 'duringDoors'>): boolean {
  return !!row.presentAt && row.duringDoors === true;
}

/** One school's head counts, as the scan tallied them. */
export interface SchoolPresence {
  schoolKey: string;
  label: string;
  shortName: string;
  /** Players who registered for this tournament at this school. */
  registered: number;
  /** Players present BEFORE the cut-off. The number qualification rests on. */
  present: number;
  /** Players first seen after the doors closed. Recorded, never counted. */
  presentLate: number;
  /** Capped at PRESENT_UIDS_CAP, in scan order so a re-run lists the same ones. */
  presentUids: string[];
  /** True when the uid list was capped. The COUNTS above are always exact. */
  truncated: boolean;
}

/**
 * Tally every player row into per-school counts.
 *
 * Pure and order-independent apart from `presentUids`, which follows scan
 * order (document id) so that re-running the scan produces the same list —
 * an audit sample that reshuffles between runs is not an audit sample.
 */
export function tallySchools(rows: PresenceRow[]): Map<string, SchoolPresence> {
  const schools = new Map<string, SchoolPresence>();

  for (const row of rows) {
    const key = typeof row.schoolKey === 'string' ? row.schoolKey.trim() : '';
    // A player row with no school cannot be counted toward one. They still
    // play and still score individually — nothing about this drops them from
    // the tournament, it only means no school banks their presence.
    if (!key) continue;

    let school = schools.get(key);
    if (!school) {
      school = {
        schoolKey: key,
        label: key,
        shortName: key,
        registered: 0,
        present: 0,
        presentLate: 0,
        presentUids: [],
        truncated: false,
      };
      schools.set(key, school);
    }

    school.registered += 1;
    if (typeof row.schoolLabel === 'string' && row.schoolLabel) school.label = row.schoolLabel;
    if (typeof row.schoolShort === 'string' && row.schoolShort) school.shortName = row.schoolShort;

    if (countsPresent(row)) {
      school.present += 1;
      if (school.presentUids.length < PRESENT_UIDS_CAP) school.presentUids.push(row.uid);
      else school.truncated = true;
    } else if (row.presentAt) {
      school.presentLate += 1;
    }
  }

  return schools;
}

export interface QualificationInput {
  registered: number;
  present: number;
  minPlayers: number;
}

export interface QualificationDecision {
  qualified: boolean;
  /** How many more present players the school needed. 0 when qualified. */
  shortBy: number;
  /** Named so nobody has to guess which count decided. Always 'present'. */
  basis: 'present';
}

/**
 * The qualification verdict, from the counts alone.
 *
 * PRESENT decides. `registered` is carried on the document beside it because
 * students must be able to see both — "CODOSA · 5 inscrits · 3 présents" is
 * the lobby copy Decision 3 asks for — but it is not an input here, and the
 * `basis` field says so on every document so that a future reader cannot
 * quietly reinterpret a roster as having been decided on registrations.
 */
export function decideQualification(input: QualificationInput): QualificationDecision {
  const minPlayers = Number.isFinite(input.minPlayers) && input.minPlayers > 0
    ? Math.floor(input.minPlayers)
    : DEFAULT_MIN_PLAYERS;
  const present = Number.isFinite(input.present) ? Math.max(0, Math.floor(input.present)) : 0;
  const qualified = present >= minPlayers;
  return { qualified, shortBy: qualified ? 0 : minPlayers - present, basis: 'present' };
}

/** The frozen document written to `tournaments/{tid}/roster/{schoolKey}`. */
export interface RosterEntry {
  schoolKey: string;
  label: string;
  shortName: string;
  registered: number;
  present: number;
  presentLate: number;
  minPlayers: number;
  qualified: boolean;
  /** When the verdict was frozen. Null when the school did not qualify. */
  qualifiedAt: number | null;
  shortBy: number;
  basis: 'present';
  presentUids: string[];
  truncated: boolean;
  /**
   * THE THREE FIELDS BELOW EXIST TO PREVENT ONE MISREADING.
   *
   * "Not qualified" means the SCHOOL is unranked on the school board. It does
   * not mean anybody is removed, blocked, or disqualified: every student at an
   * unqualified school still plays every question, still scores, still appears
   * in the individual standings, and is still eligible for an individual
   * prize. Decision 3 says it outright — "a school that fails to qualify still
   * plays; nobody is turned away."
   *
   * They are written as literals on every document, including the qualified
   * ones, rather than left to be inferred from the absence of a field, because
   * the thing being guarded against is a reader — or a query, or the next
   * endpoint someone writes — treating a missing flag as permission to filter
   * these students out.
   */
  excluded: false;
  studentsStillPlay: true;
  meaning: 'qualified' | 'unranked_not_excluded';
}

export function buildRosterEntry(
  school: SchoolPresence,
  opts: { minPlayers: number; frozenAtMs: number },
): RosterEntry {
  const decision = decideQualification({
    registered: school.registered,
    present: school.present,
    minPlayers: opts.minPlayers,
  });

  return {
    schoolKey: school.schoolKey,
    label: school.label,
    shortName: school.shortName,
    registered: school.registered,
    present: school.present,
    presentLate: school.presentLate,
    minPlayers: opts.minPlayers,
    qualified: decision.qualified,
    qualifiedAt: decision.qualified ? opts.frozenAtMs : null,
    shortBy: decision.shortBy,
    basis: decision.basis,
    presentUids: school.presentUids,
    truncated: school.truncated,
    excluded: false,
    studentsStillPlay: true,
    meaning: decision.qualified ? 'qualified' : 'unranked_not_excluded',
  };
}

/** Totals for the tournament document and the response. */
export interface RosterSummary {
  schools: number;
  qualifiedSchools: number;
  playersRegistered: number;
  playersPresent: number;
  minPlayers: number;
}

export function summarize(entries: RosterEntry[], minPlayers: number): RosterSummary {
  let qualifiedSchools = 0;
  let playersRegistered = 0;
  let playersPresent = 0;
  for (const entry of entries) {
    if (entry.qualified) qualifiedSchools += 1;
    playersRegistered += entry.registered;
    playersPresent += entry.present;
  }
  return { schools: entries.length, qualifiedSchools, playersRegistered, playersPresent, minPlayers };
}

// ── Auth ────────────────────────────────────────────────────────────────────

/** Constant-time compare — copied from advance.ts, which cannot be imported
 *  from (it is a route module, and importing it would drag its handler in). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function cronAuthorized(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) return false; // refuse to run unprotected
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const headerSecret = (req.headers['x-cron-secret'] as string) || '';
  return (
    (!!bearer && timingSafeEqual(bearer, secret))
    || (!!headerSecret && timingSafeEqual(headerSecret, secret))
  );
}

/**
 * The same admin test `isAdmin()` makes in firestore.rules: `users/{uid}.role`.
 *
 * Read server-side rather than trusted from a custom claim because this
 * codebase has no admin custom claims — the role lives on the user document and
 * the console already writes it there. A second definition of "admin" is how
 * one surface eventually lets somebody in that another would not.
 */
async function isAdminUid(db: Firestore, uid: string): Promise<boolean> {
  try {
    const snap = await db.doc(`users/${uid}`).get();
    return snap.exists && (snap.data() as Row | undefined)?.role === 'admin';
  } catch (err) {
    console.error('[arena/doors-close] admin lookup failed:', err);
    return false; // fail closed: this endpoint decides who is ranked for money
  }
}

// ── The scan ────────────────────────────────────────────────────────────────

interface ScanResult {
  schools: Map<string, SchoolPresence>;
  complete: boolean;
  pages: number;
}

/**
 * Read every player row once, paginated by document id.
 *
 * ONE full scan, not a query per school, because the set of schools is not
 * known until the players have been read — there is no school index to iterate.
 * It is O(players) reads, which is the right trade for a job that runs once per
 * tournament and decides prize eligibility; aggregate.ts stays school-bounded
 * precisely because it runs every ten seconds and this does not.
 *
 * Ordered by document id so the pages cannot overlap or skip, and so the
 * `presentUids` sample is stable across runs. `.select()` keeps the payload to
 * the four fields that matter rather than pulling full player rows.
 */
async function scanPresence(db: Firestore, tid: string): Promise<ScanResult> {
  const base = db
    .collection(`tournaments/${tid}/players`)
    .orderBy(FieldPath.documentId())
    .select('schoolKey', 'schoolLabel', 'schoolShort', 'presentAt', 'duringDoors');

  const rows: PresenceRow[] = [];
  let cursor: QueryDocumentSnapshot | null = null;
  let pages = 0;

  for (; pages < ROSTER_MAX_PAGES; pages += 1) {
    // Annotated because `cursor` is assigned from `snap` below, and TS cannot
    // infer a type that refers back to its own initializer (same reason
    // aggregate.ts annotates its paged query).
    const query: Query = cursor ? base.startAfter(cursor).limit(ROSTER_PAGE) : base.limit(ROSTER_PAGE);
    const snap: QuerySnapshot = await query.get();
    if (snap.empty) return { schools: tallySchools(rows), complete: true, pages: pages + 1 };

    for (const doc of snap.docs) {
      rows.push({
        uid: doc.id,
        schoolKey: String(doc.get('schoolKey') ?? ''),
        schoolLabel: typeof doc.get('schoolLabel') === 'string' ? (doc.get('schoolLabel') as string) : undefined,
        schoolShort: typeof doc.get('schoolShort') === 'string' ? (doc.get('schoolShort') as string) : undefined,
        presentAt: doc.get('presentAt'),
        duringDoors: doc.get('duringDoors'),
      });
    }

    if (snap.size < ROSTER_PAGE) {
      return { schools: tallySchools(rows), complete: true, pages: pages + 1 };
    }
    cursor = snap.docs[snap.size - 1];
  }

  // Out of pages with more to read. Reported as INCOMPLETE and nothing is
  // written — see ROSTER_MAX_PAGES.
  return { schools: tallySchools(rows), complete: false, pages };
}

// ── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // GET as well as POST: a Vercel cron fires a GET, and the cron entry for
  // this path is what freezes the roster if nobody presses the button.
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const db = getDb();

  // ── Who is calling ──────────────────────────────────────────────────────
  let actor = 'cron';
  if (!cronAuthorized(req)) {
    const decoded = await requireAuthDecoded(req, res);
    if (!decoded) return;

    const { allowed, remaining, resetAt } = await checkRateLimit(decoded.uid, 'arena-doors-close');
    if (!allowed) {
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))));
      res.status(429).json({ error: 'rate_limit_exceeded', message: 'Trop de requêtes. Réessayez plus tard.' });
      return;
    }
    res.setHeader('X-RateLimit-Remaining', String(remaining));

    if (!(await isAdminUid(db, decoded.uid))) {
      res.status(403).json({ error: 'not_admin' });
      return;
    }
    actor = decoded.uid;
  }

  // ── Input ───────────────────────────────────────────────────────────────
  const body = parseBody(req);
  // `tournamentId` matches register/presence/answer; `tid` matches
  // advance/aggregate. Both are accepted rather than picking a side, because a
  // scheduler entry that posts the wrong key would fail silently at 17:50.
  let tournamentId = body.tournamentId ?? body.tid ?? req.query.tid;

  // A cron entry carries no arguments, so a scheduled call finds its own work:
  // the tournament currently at `doors`. One per tick is enough — the doors
  // window is about ten minutes and this runs every minute, so a second
  // tournament in the same window is picked up sixty seconds later. Two
  // tournaments holding their doors open in the same minute is not a situation
  // this product has.
  if (!isValidTournamentId(tournamentId)) {
    const waiting = await tournamentsInStates(db, ['doors']);
    if (waiting.length === 0) {
      res.status(200).json({ ok: true, action: 'nothing_at_doors' });
      return;
    }
    tournamentId = waiting[0];
  }

  const tournamentRef = db.doc(`tournaments/${tournamentId}`);

  try {
    // ── 1 · Claim the freeze ──────────────────────────────────────────────
    //
    // In a transaction, because the read that decides and the write that
    // claims must not be separable: two schedulers that both read "not frozen"
    // would both scan, and during `doors` presence is still arriving, so they
    // would disagree about who was in the room.
    const now = Date.now();
    const claim = await db.runTransaction(async (tx) => {
      const snap = await tx.get(tournamentRef);
      if (!snap.exists) return { plan: 'not_found' as const };

      const tournament = (snap.data() ?? {}) as Row;
      const state = asArenaState(tournament.state);
      const plan = planDoorsClose({
        state,
        frozenAt: toMillis(tournament.rosterFrozenAt),
        freezeStartedAt: toMillis(tournament.rosterFreezeStartedAt),
        now,
      });

      const minPlayers = typeof tournament.minPlayers === 'number' && tournament.minPlayers > 0
        ? tournament.minPlayers
        : DEFAULT_MIN_PLAYERS;

      if (plan === 'freeze') {
        tx.update(tournamentRef, {
          rosterFreezeStartedAt: Timestamp.fromMillis(now),
          rosterFreezeBy: actor,
        });
      }

      return {
        plan,
        state,
        minPlayers,
        summary: (tournament.rosterSummary ?? null) as RosterSummary | null,
      };
    });

    if (claim.plan === 'not_found') {
      res.status(404).json({ error: 'tournament_not_found' });
      return;
    }

    if (claim.plan === 'already_frozen') {
      // The whole point of the idempotency guarantee: replay, never recompute.
      res.status(200).json({ ok: true, action: 'already_frozen', ...(claim.summary ?? {}) });
      return;
    }

    if (claim.plan === 'in_progress') {
      res.status(409).json({ error: 'freeze_in_progress', state: claim.state });
      return;
    }

    if (claim.plan === 'too_early') {
      res.status(409).json({
        error: 'doors_not_closed',
        state: claim.state,
        message: 'Presence has not been collected yet; freezing now would unqualify every school.',
      });
      return;
    }

    if (claim.plan === 'too_late') {
      // Refuse rather than re-freeze. The board is already ranking on this
      // roster (or the event is void); a school that lost qualification
      // mid-tournament because a job re-ran is indefensible in public.
      res.status(409).json({
        error: 'doors_already_closed',
        state: claim.state,
        message: 'The tournament has moved past `doors`; the roster may not be re-frozen.',
      });
      return;
    }

    // ── 2 · Count who is actually in the room ─────────────────────────────
    let scan: ScanResult;
    try {
      scan = await scanPresence(db, String(tournamentId));
    } catch (err) {
      await releaseLease(tournamentRef);
      throw err;
    }

    if (!scan.complete) {
      // Nothing is written. A partial roster would read as a real verdict and
      // mark every school on the unread pages as unqualified.
      await releaseLease(tournamentRef);
      res.status(500).json({
        error: 'roster_too_large',
        message: `Player scan exceeded ${ROSTER_MAX_PAGES} pages; roster NOT frozen.`,
      });
      return;
    }

    const frozenAtMs = Date.now();
    const entries = [...scan.schools.values()]
      .map((school) => buildRosterEntry(school, { minPlayers: claim.minPlayers, frozenAtMs }))
      .sort((a, b) => a.schoolKey.localeCompare(b.schoolKey));
    const summary = summarize(entries, claim.minPlayers);

    // ── 3 · Write the frozen roster ───────────────────────────────────────
    //
    // Batched, not transactional: a transaction caps at 500 writes and a
    // tournament may field more schools than that. `schoolKey` is safe as a
    // document id — isValidSchoolKey() restricts it to lowercase alphanumerics
    // and single spaces, so it can carry no `/`.
    try {
      for (let i = 0; i < entries.length; i += ROSTER_BATCH) {
        const batch = db.batch();
        for (const entry of entries.slice(i, i + ROSTER_BATCH)) {
          batch.set(db.doc(`tournaments/${tournamentId}/roster/${entry.schoolKey}`), {
            ...entry,
            qualifiedAt: entry.qualifiedAt === null ? null : Timestamp.fromMillis(entry.qualifiedAt),
            frozenAt: Timestamp.fromMillis(frozenAtMs),
            frozenBy: actor,
          });
        }
        await batch.commit();
      }
    } catch (err) {
      await releaseLease(tournamentRef);
      throw err;
    }

    // ── 4 · Seal it ───────────────────────────────────────────────────────
    //
    // LAST, deliberately. `rosterFrozenAt` is what makes every later call
    // idempotent, so it must not be set until the documents it promises are
    // actually on disk — otherwise a crash between the two would leave a
    // tournament that claims a frozen roster and has none, and the refusal
    // path above would then block the retry that could fix it.
    await tournamentRef.update({
      rosterFrozenAt: Timestamp.fromMillis(frozenAtMs),
      rosterSummary: summary,
      'countsPublic.qualifiedSchools': summary.qualifiedSchools,
      'countsPublic.schools': summary.schools,
      doorsClosedAt: FieldValue.serverTimestamp(),
    });

    res.status(200).json({
      ok: true,
      action: 'frozen',
      ...summary,
      rows: entries.map((entry) => ({
        schoolKey: entry.schoolKey,
        shortName: entry.shortName,
        registered: entry.registered,
        present: entry.present,
        qualified: entry.qualified,
        shortBy: entry.shortBy,
        // Repeated in the response for the same reason it is on the document:
        // the run console renders this list, and "unqualified" on a screen at
        // 17:59 must not read as "these students are out".
        meaning: entry.meaning,
      })),
    });
  } catch (err) {
    console.error('[arena/doors-close] error:', err);
    res.status(500).json({ error: 'freeze_failed' });
  }
}

/**
 * Hand the lease back after a failed attempt.
 *
 * Without this a crashed scan blocks every retry for FREEZE_LEASE_MS, and the
 * window this job has to run in is measured in seconds. Best-effort: if the
 * release itself fails the lease simply expires, which is the slow-but-correct
 * outcome.
 */
async function releaseLease(ref: DocumentReference): Promise<void> {
  try {
    await ref.update({ rosterFreezeStartedAt: FieldValue.delete() });
  } catch (err) {
    console.error('[arena/doors-close] lease release failed:', err);
  }
}
