/**
 * Vercel serverless function: GET|POST /api/arena/review
 * ────────────────────────────────────────────────────────────────────────────
 * The integrity review: the queue, the evidence, and the verdict.
 *
 * ── WHY THIS ENDPOINT EXISTS ────────────────────────────────────────────────
 *
 * From an external audit (E8). `eligible: false` was honoured in four places —
 * `answer.ts` refuses a submission, `aggregate.ts` drops the player from both
 * boards, `claim.ts` skips them in roll-down — and written in exactly none.
 * `register.ts` writes `eligible: true` and nothing in the product could ever
 * write anything else. The disqualification machinery was complete and wired
 * to a switch that did not exist.
 *
 * The same audit: "No usable integrity investigation workflow exposes the
 * private answer evidence to authorized reviewers." Flags accumulated on the
 * player rows from the first event onward and no surface anywhere read them.
 *
 * This is that switch and that workflow.
 *
 * ── WHY THE EVIDENCE DOOR IS SHUT UNTIL `grading` ───────────────────────────
 *
 * Every answer document carries `correct`. Integrity rule 2 is that the answer
 * endpoint reveals nothing, because five accounts submitting five different
 * options would otherwise read the key off whoever scored — and an admin door
 * onto the same field, open mid-tournament, is that hole with a nicer login.
 * By `grading` every question has closed and every key is already public, so
 * the evidence view can show everything without being a second way in.
 *
 * ── WHY A VERDICT CANNOT BE RECORDED DURING `live` ──────────────────────────
 *
 * Integrity rule 6: signals FLAG, never block. A notification, a phone call
 * and a low battery all look like tabbing out to an AI. Disqualifying
 * mid-tournament would mean ruling on a student without the evidence view
 * (shut until `grading`) and while the thing being judged is still happening.
 * Verdicts belong to `grading` and `provisional`, which is what `provisional`
 * is FOR — "Rezilta yo pwovizwa jiskaske nou verifye."
 *
 * ── Actions ─────────────────────────────────────────────────────────────────
 *   GET  ?tournamentId=x&action=queue                 → who is worth reading
 *   GET  ?tournamentId=x&action=evidence&uid=y        → one player's answers
 *   POST { action:'decide', tournamentId, uid,
 *          decision:'cleared'|'disqualified', note }  → the verdict
 *
 * Admin only, and ONLY a person: `authorizeCronOrAdmin` accepts the cron
 * secret, and this route then refuses it. Nothing scheduled disqualifies a
 * child.
 *
 * Errors: 400 invalid input · 401 · 403 not_admin / cron_not_allowed ·
 *         404 tournament_not_found / player_not_found · 409 wrong_state · 429 · 500.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { getDb } from '../_lib/firebaseAdmin';
import {
  asArenaState,
  authorizeCronOrAdmin,
  isValidTournamentId,
  parseBody,
  toMillis,
} from './_shared';
import {
  finalBlockers,
  flagSummary,
  type FinalBlocker,
  type ReviewDecision,
} from '../../shared/arena/review';
import { effectiveClaimState, type ClaimRecord } from '../../shared/arena/claims';
import { applyRollDown, loadClaims } from './claim';
import { aggregateOne } from './aggregate';
import type { ArenaState } from '../../shared/arena/state';

type Row = Record<string, unknown>;

/**
 * How far down the announced board the queue reaches.
 *
 * The board is what the review is ABOUT — the prize ranks and the students
 * close enough to inherit one through roll-down. Deep enough that a
 * disqualification at the top cannot promote somebody nobody has looked at;
 * shallow enough to be a bounded read on a tournament of any size.
 */
const QUEUE_DEPTH = 25;

/** States in which the keys are all public, so evidence discloses nothing new. */
const EVIDENCE_STATES: ReadonlySet<ArenaState> = new Set<ArenaState>([
  'grading', 'provisional', 'final', 'void',
]);

/** States in which a verdict may be recorded. See the header. */
const VERDICT_STATES: ReadonlySet<ArenaState> = new Set<ArenaState>(['grading', 'provisional']);

const str = (v: unknown, max = 200): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

// ── Reading the tournament's review state ───────────────────────────────────

export interface ReviewRecord {
  uid: string;
  decision: ReviewDecision;
  note: string | null;
  reviewedBy: string;
  reviewedAt: number | null;
  /** The flags as they stood when the verdict was recorded. */
  flags: string[];
}

function readReview(uid: string, data: Row | undefined): ReviewRecord | null {
  if (!data) return null;
  const decision = data.decision;
  if (decision !== 'cleared' && decision !== 'disqualified') return null;
  return {
    uid,
    decision,
    note: typeof data.note === 'string' ? data.note : null,
    reviewedBy: str(data.reviewedBy, 128),
    reviewedAt: toMillis(data.reviewedAt),
    flags: Array.isArray(data.flags) ? data.flags.filter((f): f is string => typeof f === 'string') : [],
  };
}

async function loadReviews(db: Firestore, tid: string): Promise<ReviewRecord[]> {
  const snap = await db.collection(`tournaments/${tid}/reviews`).get();
  const out: ReviewRecord[] = [];
  for (const doc of snap.docs) {
    const record = readReview(doc.id, doc.data() as Row);
    if (record) out.push(record);
  }
  return out;
}

/** The announced board, uid + rank + the little the queue displays. */
interface BoardRow {
  uid: string;
  rank: number;
  displayName: string;
  schoolShort: string;
  schoolKey: string;
  score: number;
}

function readBoard(standings: Row | null): BoardRow[] {
  const rows = Array.isArray(standings?.individuals) ? (standings?.individuals as Row[]) : [];
  return rows.map((raw) => ({
    uid: str(raw.uid, 128),
    rank: Math.trunc(num(raw.rank, 0)),
    displayName: str(raw.displayName, 80),
    schoolShort: str(raw.schoolShort, 40),
    schoolKey: str(raw.schoolKey, 80),
    score: num(raw.score, 0),
  })).filter((row) => row.uid !== '' && row.rank > 0);
}

// ── 1 · The queue ───────────────────────────────────────────────────────────

export interface QueueRow {
  uid: string;
  displayName: string;
  schoolShort: string;
  rank: number | null;
  score: number;
  eligible: boolean;
  flags: string[];
  summary: ReturnType<typeof flagSummary>;
  decision: ReviewDecision | null;
  note: string | null;
  reviewedBy: string | null;
  reviewedAt: number | null;
  /** The claim this student holds, if any, as the gate reads it. */
  claimState: string | null;
  claimRank: number | null;
}

async function handleQueue(ctx: {
  db: Firestore; res: VercelResponse; tid: string; tournament: Row; now: number;
}): Promise<void> {
  const { db, res, tid, tournament, now } = ctx;

  const [standingsSnap, claims, reviews] = await Promise.all([
    db.doc(`tournaments/${tid}/standings/current`).get(),
    loadClaims(db, tid),
    loadReviews(db, tid),
  ]);

  const board = readBoard(standingsSnap.exists ? (standingsSnap.data() as Row) : null);

  /*
   * WHO IS IN THE QUEUE: the top of the announced board, plus anybody holding
   * a claim, plus anybody already ruled on. Not a scan of every player.
   *
   * A scan would need a `flagCount` field and a new composite index to be
   * bounded at all, and it would answer a question nobody is asking: a
   * flagged student in 300th place is not a decision anyone has to make. The
   * three sets here are exactly the people whose status can change who gets
   * paid — which is the same scope as the finalisation gate, deliberately, so
   * the console cannot show a clean queue while the gate refuses to finalise.
   */
  const uids = [...new Set([
    ...board.slice(0, QUEUE_DEPTH).map((row) => row.uid),
    ...claims.map((claim) => claim.uid),
    ...reviews.map((review) => review.uid),
  ])];

  const players = uids.length > 0
    ? await db.getAll(...uids.map((uid) => db.doc(`tournaments/${tid}/players/${uid}`)))
    : [];

  const byUid = new Map(board.map((row) => [row.uid, row]));
  const reviewByUid = new Map(reviews.map((review) => [review.uid, review]));
  const claimByUid = new Map<string, ClaimRecord>();
  for (const claim of claims) {
    // A student can hold at most one prize; a second document for the same uid
    // is a vacated one, and the holder is whichever is still live.
    const seen = claimByUid.get(claim.uid);
    const live = effectiveClaimState(claim, now);
    if (!seen || (live !== 'rejected' && live !== 'expired')) claimByUid.set(claim.uid, claim);
  }

  const rows: QueueRow[] = players.map((snap) => {
    const uid = snap.id;
    const data = (snap.exists ? snap.data() : {}) as Row;
    const boardRow = byUid.get(uid);
    const review = reviewByUid.get(uid) ?? null;
    const claim = claimByUid.get(uid);
    const flags = Array.isArray(data.flags)
      ? data.flags.filter((f): f is string => typeof f === 'string')
      : [];

    return {
      uid,
      displayName: boardRow?.displayName || str(data.displayName, 80),
      schoolShort: boardRow?.schoolShort || str(data.schoolShort, 40),
      rank: boardRow ? boardRow.rank : null,
      score: boardRow ? boardRow.score : num(data.score, 0),
      eligible: data.eligible !== false,
      flags,
      summary: flagSummary(flags),
      decision: review?.decision ?? null,
      note: review?.note ?? null,
      reviewedBy: review?.reviewedBy ?? null,
      reviewedAt: review?.reviewedAt ?? null,
      claimState: claim ? (effectiveClaimState(claim, now) ?? null) : null,
      claimRank: claim ? claim.rank : null,
    };
  });

  // Worth reading first: an unruled flag in the money, then rank order.
  rows.sort((a, b) => {
    const aUrgent = a.decision === null && a.summary.total > 0 ? 0 : 1;
    const bUrgent = b.decision === null && b.summary.total > 0 ? 0 : 1;
    if (aUrgent !== bUrgent) return aUrgent - bUrgent;
    return (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER);
  });

  res.status(200).json({
    ok: true,
    state: str(tournament.state, 20),
    rows,
    blockers: blockersFor({ tournament, board, claims, reviews, players, now }),
  });
}

/**
 * The finalisation gate's answer, computed from documents already in hand.
 *
 * Returned by the queue as well as enforced by `state.ts`, from the same pure
 * function, so the console's reason for disabling "Finaliser" is the endpoint's
 * reason for refusing it — the pattern `controlPermission` already follows for
 * `canTransition`.
 */
export function blockersFor(input: {
  tournament: Row;
  board: BoardRow[];
  claims: ClaimRecord[];
  reviews: ReviewRecord[];
  players: Array<{ id: string; exists: boolean; data: () => Row | undefined }>;
  now: number;
}): FinalBlocker[] {
  const { tournament, board, claims, reviews, players, now } = input;

  const prizes = ((tournament.prizes ?? {}) as Row).individual;
  const decisions: Record<string, ReviewDecision> = {};
  for (const review of reviews) decisions[review.uid] = review.decision;

  const flags: Record<string, string[]> = {};
  for (const snap of players) {
    const data = snap.exists ? snap.data() : undefined;
    const raw = data?.flags;
    if (Array.isArray(raw)) flags[snap.id] = raw.filter((f): f is string => typeof f === 'string');
  }

  return finalBlockers({
    individuals: board.map((row) => ({ uid: row.uid, rank: row.rank })),
    claims,
    prizeCents: Array.isArray(prizes) ? (prizes as number[]) : [],
    decisions,
    flags,
    now,
  });
}

// ── 2 · The evidence ────────────────────────────────────────────────────────

async function handleEvidence(ctx: {
  db: Firestore; res: VercelResponse; tid: string; tournament: Row; uid: string;
}): Promise<void> {
  const { db, res, tid, tournament, uid } = ctx;

  const state = asArenaState(tournament.state) ?? 'draft';
  if (!EVIDENCE_STATES.has(state)) {
    // See the header: every answer document carries `correct`.
    res.status(409).json({
      error: 'wrong_state',
      state,
      message: 'Evidence is readable once every question has closed.',
    });
    return;
  }

  const [playerSnap, answersSnap] = await Promise.all([
    db.doc(`tournaments/${tid}/players/${uid}`).get(),
    db.collection(`tournaments/${tid}/answers`).where('uid', '==', uid).get(),
  ]);

  if (!playerSnap.exists) {
    res.status(404).json({ error: 'player_not_found' });
    return;
  }
  const player = playerSnap.data() as Row;

  const answers = answersSnap.docs
    .map((doc) => {
      const a = doc.data() as Row;
      return {
        index: Math.trunc(num(a.index, -1)),
        choice: num(a.choice, -1),
        correct: a.correct === true,
        late: a.late === true,
        early: a.early === true,
        impossible: a.impossible === true,
        tier: str(a.tier, 20),
        points: num(a.points, 0),
        elapsedMs: num(a.elapsedMs, 0),
        /*
         * BOTH ends of the span, and the value the clamp actually used. The
         * gap between what the phone claimed and what the server stamped is
         * the finding in most of these cases, and a reviewer who only sees
         * the clamped result is reading a conclusion rather than evidence.
         */
        clientShownAt: toMillis(a.clientShownAt),
        clampedShownAt: num(a.clampedShownAt, 0),
        serverReceivedAt: num(a.serverReceivedAt, 0),
        focusLosses: num(a.focusLosses, 0),
        flags: Array.isArray(a.flags) ? a.flags.filter((f): f is string => typeof f === 'string') : [],
        appVersion: str(a.appVersion, 40) || null,
        deviceHash: str(a.deviceHash, 80) || null,
        // 'absent' for every answer written before the app attested at all.
        attestation: str(a.attestation, 12) || 'absent',
      };
    })
    .sort((a, b) => a.index - b.index);

  const flags = Array.isArray(player.flags)
    ? player.flags.filter((f): f is string => typeof f === 'string')
    : [];

  res.status(200).json({
    ok: true,
    uid,
    displayName: str(player.displayName, 80),
    schoolShort: str(player.schoolShort, 40),
    score: num(player.score, 0),
    eligible: player.eligible !== false,
    flags,
    summary: flagSummary(flags),
    answers,
  });
}

// ── 3 · The verdict ─────────────────────────────────────────────────────────

export interface VerdictInput {
  uid: string;
  decision: ReviewDecision;
  note: string;
}

/**
 * A disqualification MUST say why; clearing someone need not.
 *
 * Asymmetric on purpose. "Cleared" is the default state of every player in the
 * tournament and adding a note to it changes nothing about what happens to
 * them. Taking a student's result away is the one action here that has to
 * survive being questioned in public months later, by a parent, with the
 * reviewer no longer in the room.
 */
export function validateVerdict(body: Row): { ok: true; value: VerdictInput } | { ok: false; reason: string } {
  const uid = str(body.uid, 128);
  if (!uid) return { ok: false, reason: 'uid' };

  const decision = body.decision;
  if (decision !== 'cleared' && decision !== 'disqualified') return { ok: false, reason: 'decision' };

  const note = str(body.note, 500);
  if (decision === 'disqualified' && note.length < 4) return { ok: false, reason: 'note_required' };

  return { ok: true, value: { uid, decision, note } };
}

async function handleDecide(ctx: {
  db: Firestore; res: VercelResponse; tid: string; tournament: Row; adminUid: string; body: Row; now: number;
}): Promise<void> {
  const { db, res, tid, tournament, adminUid, body, now } = ctx;

  const state = asArenaState(tournament.state) ?? 'draft';
  if (!VERDICT_STATES.has(state)) {
    res.status(409).json({
      error: 'wrong_state',
      state,
      message: state === 'final'
        ? 'The prizes have been released; a correction after `final` is a refund, not a review.'
        : 'Verdicts are recorded in `grading` or `provisional`.',
    });
    return;
  }

  const parsed = validateVerdict(body);
  if (!parsed.ok) {
    res.status(400).json({ error: `invalid_${parsed.reason}` });
    return;
  }
  const { uid, decision, note } = parsed.value;

  const playerRef = db.doc(`tournaments/${tid}/players/${uid}`);
  const reviewRef = db.doc(`tournaments/${tid}/reviews/${uid}`);

  const written = await db.runTransaction(async (tx) => {
    const snap = await tx.get(playerRef);
    if (!snap.exists) return null;
    const player = snap.data() as Row;
    const flags = Array.isArray(player.flags)
      ? player.flags.filter((f): f is string => typeof f === 'string')
      : [];

    tx.update(playerRef, {
      eligible: decision === 'cleared',
      reviewedAt: Timestamp.fromMillis(now),
      reviewedBy: adminUid,
    });

    /*
     * The flags AS THEY STOOD. A verdict read back next month has to show what
     * was in front of the reviewer, not what the row says by then — and the
     * row can still change, because `answer.ts` keeps appending flags for as
     * long as the tournament accepts answers.
     */
    tx.set(reviewRef, {
      uid,
      decision,
      note: note || null,
      flags,
      reviewedBy: adminUid,
      reviewedAt: Timestamp.fromMillis(now),
      state,
    }, { merge: true });

    return { flags, previouslyEligible: player.eligible !== false };
  });

  if (!written) {
    res.status(404).json({ error: 'player_not_found' });
    return;
  }

  /*
   * The board. In `grading` the aggregator is still allowed to run, so the
   * standings can be corrected on the spot and the podium is announced with
   * the disqualification already applied. In `provisional` it deliberately
   * refuses — that board has been read out on a stream — so the correction is
   * applied once, at the `final` transition, by `correctIndividuals`. Either
   * way nothing here rewrites an announced board.
   */
  let boardCorrected: 'aggregated' | 'deferred_to_final' = 'deferred_to_final';
  if (state === 'grading') {
    try {
      await aggregateOne(db, tid, now);
      boardCorrected = 'aggregated';
    } catch (err) {
      console.error('[arena/review] re-aggregate after verdict failed:', err);
    }
  }

  /*
   * The money. A disqualified student cannot keep a prize, and the roll-down
   * that hands it to the next finisher is the same one a rejected claim
   * triggers — `applyRollDown` already skips `eligible: false` finishers, and
   * the flag it reads was written above.
   */
  let rollDown: unknown = null;
  if (decision === 'disqualified') {
    const claims = await loadClaims(db, tid);
    const held = claims.filter((claim) => claim.uid === uid);
    for (const claim of held) {
      const live = effectiveClaimState(claim, now);
      if (live === 'rejected' || live === 'expired') continue;
      await db.doc(`tournaments/${tid}/claims/${uid}`).update({
        state: 'rejected',
        reviewedBy: adminUid,
        reviewNote: `Integrity review: ${note}`.slice(0, 500),
        reviewedAt: Timestamp.fromMillis(now),
      });
      rollDown = await applyRollDown({ db, tid, rank: claim.rank, actorUid: adminUid, now });
    }
  }

  /*
   * Reinstating somebody whose prize has already moved does NOT take it back.
   * The student it rolled down to was told they had won; reversing that
   * automatically, on a second admin click, is a worse outcome than a human
   * deciding it. Reported so the console can say so out loud.
   */
  let rolledDownAway = false;
  if (decision === 'cleared') {
    const claims = await loadClaims(db, tid);
    const theirs = claims.find((claim) => claim.uid === uid);
    if (theirs) {
      const live = effectiveClaimState(theirs, now);
      rolledDownAway = live === 'rejected' || live === 'expired';
    }
  }

  res.status(200).json({
    ok: true,
    uid,
    decision,
    eligible: decision === 'cleared',
    board: boardCorrected,
    rollDown,
    rolledDownAway,
  });
}

// ── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const db = getDb();
  const actor = await authorizeCronOrAdmin(req, res, db, 'arena-review');
  if (!actor) return; // already answered

  // The shared door accepts the cron secret. Nothing scheduled rules on a
  // child's result, so this route closes that half of it.
  if (actor.kind !== 'admin' || !actor.uid) {
    res.status(403).json({ error: 'cron_not_allowed' });
    return;
  }

  const body = req.method === 'POST' ? parseBody(req) : {};
  const tid = str(body.tournamentId, 120) || str(req.query.tournamentId, 120);
  if (!isValidTournamentId(tid)) {
    res.status(400).json({ error: 'invalid_tournamentId' });
    return;
  }

  const action = str(body.action, 20) || str(req.query.action, 20) || 'queue';
  if (action !== 'queue' && action !== 'evidence' && action !== 'decide') {
    res.status(400).json({ error: 'invalid_action' });
    return;
  }

  const tournamentSnap = await db.doc(`tournaments/${tid}`).get();
  if (!tournamentSnap.exists) {
    res.status(404).json({ error: 'tournament_not_found' });
    return;
  }
  const tournament = tournamentSnap.data() as Row;
  const now = Date.now();

  try {
    if (action === 'queue') {
      await handleQueue({ db, res, tid, tournament, now });
      return;
    }
    if (action === 'evidence') {
      const uid = str(body.uid, 128) || str(req.query.uid, 128);
      if (!uid) {
        res.status(400).json({ error: 'invalid_uid' });
        return;
      }
      await handleEvidence({ db, res, tid, tournament, uid });
      return;
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }
    await handleDecide({ db, res, tid, tournament, adminUid: actor.uid, body, now });
  } catch (err) {
    console.error('[arena/review] failed:', err);
    res.status(500).json({ error: 'review_failed' });
  }
}
