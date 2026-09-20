/**
 * Vercel serverless function: POST /api/arena/claim
 * ────────────────────────────────────────────────────────────────────────────
 * The prize claim: a provisional winner claims, an admin verifies, and an
 * unclaimed or failed prize rolls down to the next eligible finisher.
 *
 * Section M is the whole specification for this file, and three of its
 * principles are load-bearing here:
 *
 *  · PROVISIONAL WINNERS, ANNOUNCED LIVE (principle 3). The podium happens on
 *    the stream at `provisional`, before anything is paid, under one published
 *    line: "Rezilta yo pwovizwa jiskaske nou verifye." Removing a cheat
 *    afterwards is then the rule working as announced, not a reversal.
 *  · A 72-HOUR CLAIM WINDOW, PUBLISHED IN ADVANCE, WITH ROLL-DOWN (principle
 *    4). The window is the entire reason roll-down is defensible: without a
 *    deadline stated beforehand, "it rolled down" is an argument you cannot
 *    win in public. So the deadline is stored ON the claim as `expiresAt`, and
 *    every roll-down records WHY it moved and WHO it passed over.
 *  · A MINOR WINNING $100 NEEDS A GUARDIAN PATH (principle 6). Most of this
 *    audience is under 18, so the guardian is a NORMAL FIELD on every claim,
 *    not an exception branch — `guardian` is written on every document, null
 *    for an adult — and an adult is never asked for one.
 *
 * VERIFICATION HAPPENS ON A CALL, AND NOTHING ELSE IS STORED. A claim carries
 * a name and a contact string. It never carries an identity document, a
 * photograph of one, a document number, or a link to either — see
 * FORBIDDEN_CLAIM_FIELDS below, which rejects them at the door. Three reasons,
 * any one of which is sufficient: we are collecting from minors, so a store of
 * children's identity documents is the highest-consequence data this product
 * could hold and the one we are least equipped to protect; section M's
 * verification is a short video call, so the document adds nothing the call
 * does not already establish; and data we never hold cannot leak, be
 * subpoenaed, or be handed to the wrong admin.
 *
 * ── Documents ─────────────────────────────────────────────────────────────
 * `tournaments/{tid}/claims/{uid}`
 *   uid, rank, prizeCents, state, claimedAt, expiresAt, guardian,
 *   reviewedBy, reviewNote, rolledDownFrom
 *
 *   `rank` is the PRIZE rank, never the finishing position — prizeCents is
 *   read from `prizes.individual[rank - 1]`, so if the two could disagree the
 *   document could say "2nd place, $100". A prize that rolled down to the
 *   student who finished 4th is `{ rank: 1, finishRank: 4, rolledDownFrom: 1 }`.
 *
 * ── Actions ───────────────────────────────────────────────────────────────
 *   { action: 'claim',  tournamentId, contact, isMinor, guardian? }
 *   { action: 'review', tournamentId, uid, decision: 'verified'|'rejected', note? }  (admin)
 *   { action: 'sweep',  tournamentId }                                               (admin/cron)
 *
 * Only meaningful in `provisional`: before it there is no winner to claim, and
 * after `final` the prizes have been released and a claim would be a refund
 * problem rather than a state change.
 *
 * Errors: 400 invalid input · 401 unauthorized · 403 not_a_winner / not_admin ·
 *         404 tournament_not_found / claim_not_found · 409 wrong_state /
 *         claim_rejected / rank_pending_review · 410 claim_expired ·
 *         429 rate limited · 500.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue, Timestamp, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { requireAuthDecoded } from '../_lib/requireAuth';
import { checkRateLimit } from '../_lib/rateLimit';
import { getConsentBucket, getDb } from '../_lib/firebaseAdmin';
import { sendConsentEmail } from '../_lib/arenaConsentEmail';
import {
  asArenaState,
  cronAuthorized,
  isValidTournamentId,
  parseBody,
  publicDisplayName,
  toMillis,
  tournamentsInStates,
} from './_shared';

// ── The published window ────────────────────────────────────────────────────

/**
 * 72 hours, exactly as announced (section M principle 4).
 *
 * Stored per claim as `expiresAt` rather than recomputed from `claimedAt` on
 * read, so that changing this constant later can never retroactively expire a
 * window a student was already told they had. The published number and the
 * stored number must be the same number.
 */
export const CLAIM_WINDOW_MS = 72 * 60 * 60 * 1000;

/**
 * Fields a claim body may never carry.
 *
 * A runtime check on the INCOMING BODY rather than a type, for the same reason
 * `assertNoAnswerKey` in advance.ts is: the body is untyped at the boundary, so
 * a well-meaning client that starts uploading an ID photo would otherwise be
 * silently accepted by whatever writes the document next. Rejected loudly so
 * the client is fixed rather than the data quietly accumulating.
 */
export const FORBIDDEN_CLAIM_FIELDS = [
  'idPhoto', 'idPhotoUrl', 'idNumber', 'idDocument', 'documentUrl', 'photoUrl',
  'passport', 'nif', 'cin', 'nationalId', 'birthCertificate', 'selfie',
] as const;

// ── Pure logic (unit-tested in api/__tests__/arenaDoorsClose.test.ts) ────────

export type ClaimState = 'open' | 'claimed' | 'verified' | 'rejected' | 'expired';

/** States in which a prize is SPOKEN FOR and may not be offered to anyone else. */
export const HOLDING_STATES: readonly ClaimState[] = ['open', 'claimed', 'verified'];

/**
 * A guardian, for a claimant under 18.
 *
 * A name and a way to reach them. Nothing else — see the file header on why no
 * document is ever stored. `relationship` is optional and free text because
 * "mother", "tante", "direktè lekòl la" are all real answers here and a fixed
 * enum would force somebody to lie.
 */
export interface GuardianContact {
  name: string;
  contact: string;
  relationship: string | null;
}

export interface ClaimRecord {
  uid: string;
  /** The PRIZE rank this claim is for. */
  rank: number;
  prizeCents: number;
  state: ClaimState;
  /** Epoch ms. The published deadline this claim must be completed by. */
  expiresAt: number;
}

/** One finisher in the individual standings, ranked ascending from 1. */
export interface RankedFinisher {
  uid: string;
  rank: number;
  /**
   * False when the player row is marked ineligible (a completed integrity
   * review, not a live flag). Undefined means eligible: section M flags rather
   * than blocks, so the absence of a verdict is not a verdict.
   */
  eligible?: boolean;
}

/** Why a prize left the finisher who held it. */
export type RollDownReason =
  | 'window_open'
  | 'still_held'
  | 'expired'
  | 'rejected'
  | 'unclaimed'
  | 'no_eligible_finisher';

/** Why a candidate further down the board was passed over. */
export type SkipReason = 'already_holding' | 'rejected' | 'expired' | 'ineligible';

export interface RollDownResult {
  /** The prize rank being resolved. */
  fromRank: number;
  /** True when the prize actually moves. */
  moves: boolean;
  toUid: string | null;
  /** The new holder's FINISHING position, not the prize rank. */
  toFinishRank: number | null;
  reason: RollDownReason;
  /** Everybody passed over, in order, with why. This is the public record. */
  skipped: { uid: string; rank: number; why: SkipReason }[];
}

/**
 * An 'open' claim whose published window has passed is EXPIRED, whatever the
 * document still says.
 *
 * Derived rather than stored-and-trusted because the transition from open to
 * expired happens on a clock, not on a request: nobody calls an endpoint at the
 * 72-hour mark. The sweep writes the state down afterwards, but every decision
 * in this file reads it through here first, so a sweep that has not run yet can
 * never hand a prize to two people at once.
 */
export function effectiveClaimState(claim: ClaimRecord | undefined, now: number): ClaimState | null {
  if (!claim) return null;
  if (claim.state === 'open' && now >= claim.expiresAt) return 'expired';
  return claim.state;
}

/**
 * Which claim document currently owns prize `rank`?
 *
 * A prize that has rolled down leaves TWO documents carrying the same `rank`:
 * the vacated one (expired or rejected) and the new holder's. Taking whichever
 * the collection happened to return first would roll the prize down a second
 * time from somebody who never held it, and hand the same money to two
 * students — the single worst outcome this file can produce.
 *
 * So: a claim in a holding state owns the prize outright, because only one can
 * be. Otherwise the most recently OFFERED one wins, which is the greatest
 * `expiresAt` — every roll-down stamps a fresh 72-hour window, so the newest
 * offer always has the latest deadline. Uid breaks a tie, purely so the
 * function stays deterministic on a corrupt pair rather than picking at random.
 */
export function currentHolder(
  claims: ClaimRecord[],
  rank: number,
  now: number,
): ClaimRecord | undefined {
  const atRank = claims.filter((c) => c.rank === rank);
  if (atRank.length <= 1) return atRank[0];

  const holding = atRank.filter((c) => {
    const state = effectiveClaimState(c, now);
    return state !== null && HOLDING_STATES.includes(state);
  });
  const pool = holding.length > 0 ? holding : atRank;

  return [...pool].sort(
    (a, b) => (b.expiresAt - a.expiresAt) || a.uid.localeCompare(b.uid),
  )[0];
}

/**
 * Would a fresh self-service claim at `rank` collide with someone else's?
 *
 * CORRECTION, from an external audit (E8): `podiumClaims` (state.ts)
 * deliberately writes a placeholder for only the FIRST finisher at a paying
 * rank — a tie there is "a human decision, not an automatic double payment,"
 * and every OTHER tied finisher is left with no placeholder on purpose, for
 * the review queue. The self-service claim fallback used to ignore that
 * entirely: it derives `rank` from the student's OWN finishing position with
 * no regard for whether somebody else already holds a claim on it, so a
 * second student tied at the same rank could mint a competing claim document
 * of their own — and both could clear admin review, paying the same prize
 * twice. Any other claim at this rank, in ANY state (even one that later
 * expired or was rejected — reassigning it is still the human decision
 * podiumClaims deferred, not something this endpoint should infer on its
 * own), means the tie is still unresolved.
 */
export function tiedAtUnclaimedRank(claims: ClaimRecord[], rank: number, uid: string): boolean {
  return claims.some((c) => c.rank === rank && c.uid !== uid);
}

export interface RollDownInput {
  /** The prize rank to resolve (1-based). */
  fromRank: number;
  /** The individual standings, ranked ascending. */
  finishers: RankedFinisher[];
  /** Every claim in this tournament, however few. */
  claims: ClaimRecord[];
  now: number;
}

/**
 * Where does prize `fromRank` go next, and why?
 *
 * Pure, deterministic and total: given the same board, the same claims and the
 * same clock it returns the same answer, which is what lets a roll-down be
 * shown to a student — or argued in public — instead of asserted. It decides
 * nothing about state and writes nothing; the caller applies it.
 *
 * TWO RULES DO ALL THE WORK.
 *
 * 1. THE PRIZE ONLY MOVES IF ITS WINDOW IS ACTUALLY OVER. A claim that is
 *    `claimed` or `verified` is held and stays held. A claim still inside its
 *    72 hours stays put even if the student has not touched it — the whole
 *    point of publishing a window is that it is honoured to the last minute.
 *    Only `expired`, `rejected`, and never-claimed-past-the-deadline move.
 *
 * 2. IT NEVER ROLLS DOWN TO SOMEBODY ALREADY HOLDING A PRIZE. The next
 *    eligible finisher is the next one who holds NOTHING. It is tempting to
 *    shift everybody up a place instead — 2nd takes 1st, 3rd takes 2nd — and
 *    that is exactly the wrong move: it retroactively rewrites three announced
 *    results to fix one, and it re-opens claim windows that have already
 *    closed. One prize moves; everyone else keeps what they were told they had.
 *    A finisher who already let a prize expire, or who failed verification, is
 *    likewise passed over rather than offered a second one.
 */
export function rollDown(input: RollDownInput): RollDownResult {
  const { fromRank, finishers, claims, now } = input;

  const byUid = new Map<string, ClaimRecord>();
  for (const claim of claims) byUid.set(claim.uid, claim);

  const held = currentHolder(claims, fromRank, now);
  const heldState = effectiveClaimState(held, now);

  // ── Does the prize move at all? ─────────────────────────────────────────
  let reason: RollDownReason;
  if (heldState === null) {
    // Never claimed. The window still runs from the moment the podium was
    // published, which the caller stamps onto a placeholder claim; with no
    // record at all there is no deadline to have passed, so it stays put.
    reason = 'window_open';
  } else if (heldState === 'open') {
    reason = 'window_open';
  } else if (heldState === 'claimed' || heldState === 'verified') {
    reason = 'still_held';
  } else if (heldState === 'rejected') {
    reason = 'rejected';
  } else {
    // 'expired' — either written down by the sweep or derived just now from a
    // window that has run out while nobody was looking.
    reason = 'expired';
  }

  if (reason === 'window_open' || reason === 'still_held') {
    return { fromRank, moves: false, toUid: null, toFinishRank: null, reason, skipped: [] };
  }

  // ── Who is next? ────────────────────────────────────────────────────────
  const holderUid = held?.uid;
  const ordered = [...finishers].sort((a, b) => a.rank - b.rank);
  const skipped: RollDownResult['skipped'] = [];

  for (const finisher of ordered) {
    if (finisher.uid === holderUid) continue;
    // Only finishers BELOW the vacated prize are candidates. Someone above it
    // already has a better prize by definition.
    if (finisher.rank <= fromRank) continue;

    if (finisher.eligible === false) {
      skipped.push({ uid: finisher.uid, rank: finisher.rank, why: 'ineligible' });
      continue;
    }

    const state = effectiveClaimState(byUid.get(finisher.uid), now);
    if (state !== null && HOLDING_STATES.includes(state)) {
      skipped.push({ uid: finisher.uid, rank: finisher.rank, why: 'already_holding' });
      continue;
    }
    if (state === 'rejected') {
      skipped.push({ uid: finisher.uid, rank: finisher.rank, why: 'rejected' });
      continue;
    }
    if (state === 'expired') {
      skipped.push({ uid: finisher.uid, rank: finisher.rank, why: 'expired' });
      continue;
    }

    return { fromRank, moves: true, toUid: finisher.uid, toFinishRank: finisher.rank, reason, skipped };
  }

  // The board ran out. Recorded as an outcome rather than an error: a prize
  // with nobody left to give it to is a real result, and the reason it
  // happened is exactly what the next person to ask will want to read.
  return { fromRank, moves: false, toUid: null, toFinishRank: null, reason: 'no_eligible_finisher', skipped };
}

// ── Input validation ────────────────────────────────────────────────────────

/** A human name, loosely: at least one letter, bounded. Never parsed further. */
function isValidName(value: unknown): value is string {
  const s = String(value ?? '').trim();
  return s.length >= 2 && s.length <= 80 && /\p{L}/u.test(s);
}

/**
 * A contact string — a phone number, a WhatsApp number, an email, anything a
 * person can be reached on. Deliberately NOT validated as an email: in Haiti
 * the reachable channel is usually a WhatsApp number, and a regex that insisted
 * on an `@` would reject the winners it is meant to reach.
 */
function isValidContact(value: unknown): value is string {
  const s = String(value ?? '').trim();
  return s.length >= 5 && s.length <= 120;
}

export interface ClaimSubmission {
  contact: string;
  isMinor: boolean;
  guardian: GuardianContact | null;
}

export type ClaimSubmissionError =
  | 'forbidden_field'
  | 'invalid_contact'
  | 'minor_status_required'
  | 'guardian_required'
  | 'invalid_guardian';

/**
 * Read a claim submission out of an untrusted body.
 *
 * Field by field, never by spread — a spread is how an ID photo ends up in
 * Firestore because somebody's client started sending one.
 *
 * `isMinor` must be stated explicitly. Guessing it either way is worse than
 * asking: default it to false and a 14-year-old's prize is arranged without a
 * guardian; default it to true and an adult is blocked behind a guardian they
 * do not have. The guardian FIELD is on the form for everybody — that is what
 * "the default case, not an edge case" means — but the ANSWER comes from the
 * claimant.
 */
export function parseClaimSubmission(
  body: Record<string, unknown>,
): { ok: true; value: ClaimSubmission } | { ok: false; error: ClaimSubmissionError; field?: string } {
  for (const field of FORBIDDEN_CLAIM_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      return { ok: false, error: 'forbidden_field', field };
    }
  }

  if (!isValidContact(body.contact)) return { ok: false, error: 'invalid_contact' };
  if (typeof body.isMinor !== 'boolean') return { ok: false, error: 'minor_status_required' };

  const isMinor = body.isMinor;
  const raw = body.guardian;

  if (!isMinor) {
    // An adult is never asked for a guardian, and one sent anyway is kept
    // rather than dropped: a 19-year-old who wants their mother handling the
    // payout is not an error to correct.
    if (raw && typeof raw === 'object') {
      const g = raw as Record<string, unknown>;
      if (isValidName(g.name) && isValidContact(g.contact)) {
        return { ok: true, value: { contact: String(body.contact).trim(), isMinor, guardian: readGuardian(g) } };
      }
    }
    return { ok: true, value: { contact: String(body.contact).trim(), isMinor, guardian: null } };
  }

  if (!raw || typeof raw !== 'object') return { ok: false, error: 'guardian_required' };
  const g = raw as Record<string, unknown>;
  if (!isValidName(g.name) || !isValidContact(g.contact)) {
    return { ok: false, error: 'invalid_guardian' };
  }

  return { ok: true, value: { contact: String(body.contact).trim(), isMinor, guardian: readGuardian(g) } };
}

function readGuardian(g: Record<string, unknown>): GuardianContact {
  return {
    name: String(g.name).trim().slice(0, 80),
    contact: String(g.contact).trim().slice(0, 120),
    relationship: typeof g.relationship === 'string' && g.relationship.trim()
      ? g.relationship.trim().slice(0, 40)
      : null,
  };
}

// ── The parental consent form ───────────────────────────────────────────────

/**
 * Where a signed consent form lives.
 *
 * `arena-consent/{tid}/{uid}/consent-{ms}.{ext}` — the uid is IN the path
 * because storage.rules pins it to `request.auth.uid`, which is the only thing
 * stopping one winner from attaching a form to another winner's claim. The
 * timestamp makes every upload a new object: the rules deny `update` and
 * `delete`, so a corrected form lands beside the first one rather than
 * replacing it, and an admin who has already looked at a form can be sure the
 * bytes they looked at are still there.
 */
export const CONSENT_PREFIX = 'arena-consent';

/** What a parent can actually produce: a scan, a phone photo, or a signed PDF. */
export const CONSENT_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/webp': 'webp',
};

/** 8 MB. A phone photo of a signed page is ~2–4 MB; a scan is less. */
export const CONSENT_MAX_BYTES = 8 * 1024 * 1024;

export function consentPath(tid: string, uid: string, contentType: string, now: number): string | null {
  const ext = CONSENT_TYPES[contentType];
  if (!ext) return null;
  return `${CONSENT_PREFIX}/${tid}/${uid}/consent-${now}.${ext}`;
}

export type ConsentPathError = 'wrong_prefix' | 'wrong_owner' | 'bad_filename';

/**
 * Is this path one THIS student may claim to have written, for THIS tournament?
 *
 * The client uploads straight to Storage and then tells us the path, so the
 * path is untrusted input. Storage's own rules already stop a write outside the
 * uploader's own folder; this is the second half — stopping a student from
 * POINTING a claim at an object that is not theirs, which the rules cannot see.
 */
export function parseConsentPath(
  path: unknown,
  tid: string,
  uid: string,
): { ok: true; ext: string } | { ok: false; error: ConsentPathError } {
  if (typeof path !== 'string') return { ok: false, error: 'wrong_prefix' };
  const parts = path.split('/');
  if (parts.length !== 4 || parts[0] !== CONSENT_PREFIX) return { ok: false, error: 'wrong_prefix' };
  if (parts[1] !== tid) return { ok: false, error: 'wrong_prefix' };
  if (parts[2] !== uid) return { ok: false, error: 'wrong_owner' };

  const m = /^consent-(\d{10,16})\.([a-z]{3,4})$/.exec(parts[3]);
  if (!m) return { ok: false, error: 'bad_filename' };
  const ext = m[2];
  if (!Object.values(CONSENT_TYPES).includes(ext)) return { ok: false, error: 'bad_filename' };
  return { ok: true, ext };
}

// ── Firestore plumbing ──────────────────────────────────────────────────────

type Row = Record<string, unknown>;

/** Same admin test as firestore.rules' `isAdmin()`: `users/{uid}.role`. */
async function isAdminUid(db: Firestore, uid: string): Promise<boolean> {
  try {
    const snap = await db.doc(`users/${uid}`).get();
    return snap.exists && (snap.data() as Row | undefined)?.role === 'admin';
  } catch (err) {
    console.error('[arena/claim] admin lookup failed:', err);
    return false; // fail closed: this endpoint moves prize money
  }
}

/** `prizes.individual` in cents, as section C stores it. */
function prizeCentsFor(tournament: Row, rank: number): number | null {
  const prizes = (tournament.prizes ?? {}) as Row;
  const individual = prizes.individual;
  if (!Array.isArray(individual)) return null;
  const cents = individual[rank - 1];
  return typeof cents === 'number' && Number.isFinite(cents) && cents > 0 ? cents : null;
}

function readClaim(uid: string, data: Row | undefined): ClaimRecord | undefined {
  if (!data) return undefined;
  const state = String(data.state ?? '') as ClaimState;
  if (!HOLDING_STATES.includes(state) && state !== 'rejected' && state !== 'expired') return undefined;
  return {
    uid,
    rank: typeof data.rank === 'number' ? data.rank : 0,
    prizeCents: typeof data.prizeCents === 'number' ? data.prizeCents : 0,
    state,
    expiresAt: toMillis(data.expiresAt) ?? 0,
  };
}

/** Every claim in the tournament. Three prizes deep, so never a large read. */
async function loadClaims(db: Firestore, tid: string): Promise<ClaimRecord[]> {
  const snap = await db.collection(`tournaments/${tid}/claims`).get();
  const claims: ClaimRecord[] = [];
  for (const doc of snap.docs) {
    const claim = readClaim(doc.id, doc.data() as Row);
    if (claim) claims.push(claim);
  }
  return claims;
}

/**
 * The finishers a prize may roll down to.
 *
 * Read from `standings/current`, which is the board that was ANNOUNCED — not
 * recomputed from the player rows. Recomputing could hand a different order
 * than the one on the stream, and the whole defensibility of roll-down rests on
 * it moving down the board people watched.
 *
 * `eligible` comes from the player rows, but only for the shallow window a
 * prize could plausibly reach; reading ten thousand player documents to answer
 * a question about the top handful would be absurd.
 */
async function loadFinishers(db: Firestore, tid: string, depth: number): Promise<RankedFinisher[]> {
  const snap = await db.doc(`tournaments/${tid}/standings/current`).get();
  const individuals = (snap.data() as Row | undefined)?.individuals;
  if (!Array.isArray(individuals)) return [];

  const rows = individuals
    .map((row) => row as Row)
    .filter((row) => typeof row.uid === 'string' && typeof row.rank === 'number')
    .sort((a, b) => (a.rank as number) - (b.rank as number))
    .slice(0, depth);

  if (rows.length === 0) return [];

  const players = await db.getAll(
    ...rows.map((row) => db.doc(`tournaments/${tid}/players/${row.uid as string}`)),
  );
  const eligibleByUid = new Map<string, boolean>();
  for (const player of players) {
    if (player.exists) eligibleByUid.set(player.id, (player.data() as Row).eligible !== false);
  }

  return rows.map((row) => ({
    uid: row.uid as string,
    rank: row.rank as number,
    eligible: eligibleByUid.get(row.uid as string) ?? true,
  }));
}

/** How far down the board a prize may be chased. Bounded so one bad night
 *  cannot turn a claim request into a full-table scan. */
const ROLLDOWN_DEPTH = 50;

// ── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // GET as well as POST: the hourly sweep is a Vercel cron entry, and a cron
  // fires a GET. That sweep is the ONLY thing enforcing the 72-hour window we
  // published before the tournament — a deadline nothing enforces is a
  // deadline we cannot defend when a prize rolls down.
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const db = getDb();
  const body = parseBody(req);

  // Read from the query string too: a cron entry can only carry arguments
  // there, and `?action=sweep` in vercel.json has to mean what it says.
  const action = typeof body.action === 'string'
    ? body.action
    : (typeof req.query.action === 'string' ? req.query.action : 'claim');
  if (action !== 'claim' && action !== 'review' && action !== 'sweep' && action !== 'consent') {
    res.status(400).json({ error: 'invalid_action' });
    return;
  }

  // The scheduler has no Firebase user to authenticate as, so the sweep — and
  // only the sweep — accepts the shared secret. Every other action still
  // requires a signed-in person, because every other action is one.
  const scheduled = action === 'sweep' && cronAuthorized(req);

  let uid = 'cron';
  if (!scheduled) {
    const decoded = await requireAuthDecoded(req, res);
    if (!decoded) return;
    uid = decoded.uid;

    const { allowed, remaining, resetAt } = await checkRateLimit(uid, 'arena-claim');
    if (!allowed) {
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))));
      res.status(429).json({ error: 'rate_limit_exceeded', message: 'Trop de requêtes. Réessayez plus tard.' });
      return;
    }
    res.setHeader('X-RateLimit-Remaining', String(remaining));
  }

  let tournamentId = body.tournamentId ?? body.tid ?? req.query.tid;
  if (!isValidTournamentId(tournamentId)) {
    // A scheduled sweep finds its own work: the tournament whose results are
    // provisional, which is the only state a claim window runs in. One per
    // tick, because there is one tournament a month and `provisional` lasts
    // three days — a second would be swept an hour later.
    if (!scheduled) {
      res.status(400).json({ error: 'invalid_tournament_id' });
      return;
    }
    const open = await tournamentsInStates(db, ['provisional']);
    if (open.length === 0) {
      res.status(200).json({ ok: true, action: 'nothing_provisional' });
      return;
    }
    tournamentId = open[0];
  }

  try {
    const tSnap = await db.doc(`tournaments/${tournamentId}`).get();
    if (!tSnap.exists) {
      res.status(404).json({ error: 'tournament_not_found' });
      return;
    }
    const tournament = (tSnap.data() ?? {}) as Row;
    const state = asArenaState(tournament.state);

    // ONLY `provisional`. Before it there is no announced podium to claim
    // against; after `final` the money has been released and a state change
    // here would contradict a payment that has already happened.
    if (state !== 'provisional') {
      res.status(409).json({ error: 'wrong_state', state, message: 'Claims are only open while results are provisional.' });
      return;
    }

    if (action === 'claim') {
      await handleClaim({ db, res, uid, tid: String(tournamentId), tournament, body });
      return;
    }

    // The claimant attaches their own signed form. Not an admin action: the
    // family does this, and an admin who could upload on their behalf is an
    // admin who could manufacture the consent they are meant to be checking.
    if (action === 'consent') {
      await handleConsent({ db, res, uid, tid: String(tournamentId), body });
      return;
    }

    if (!scheduled && !(await isAdminUid(db, uid))) {
      res.status(403).json({ error: 'not_admin' });
      return;
    }

    if (action === 'review') {
      await handleReview({ db, res, adminUid: uid, tid: String(tournamentId), body });
      return;
    }
    await handleSweep({ db, res, adminUid: uid, tid: String(tournamentId) });
  } catch (err) {
    console.error('[arena/claim] error:', err);
    res.status(500).json({ error: 'claim_failed' });
  }
}

// ── 1 · A winner claims ─────────────────────────────────────────────────────

async function handleClaim(ctx: {
  db: Firestore;
  res: VercelResponse;
  uid: string;
  tid: string;
  tournament: Row;
  body: Record<string, unknown>;
}): Promise<void> {
  const { db, res, uid, tid, tournament, body } = ctx;

  const parsed = parseClaimSubmission(body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error, field: parsed.field });
    return;
  }
  const submission = parsed.value;

  const claimRef = db.doc(`tournaments/${tid}/claims/${uid}`);
  const now = Date.now();

  // The rank this student is claiming FOR. An existing document wins: it is
  // either the placeholder the podium wrote, or a prize that already rolled
  // down to them, and in both cases the rank and prize were decided by
  // something with more information than this request has.
  const existingSnap = await claimRef.get();
  const existing = (existingSnap.data() ?? null) as Row | null;

  let rank: number;
  let prizeCents: number;
  let finishRank: number | null = null;

  if (existing && typeof existing.rank === 'number') {
    rank = existing.rank;
    prizeCents = typeof existing.prizeCents === 'number' ? existing.prizeCents : 0;
    finishRank = typeof existing.finishRank === 'number' ? existing.finishRank : null;
  } else {
    const finishers = await loadFinishers(db, tid, ROLLDOWN_DEPTH);
    const me = finishers.find((f) => f.uid === uid);
    const cents = me ? prizeCentsFor(tournament, me.rank) : null;
    if (!me || cents === null) {
      // Not a winner is a 403, not a 404: the tournament and the student both
      // exist, and telling them plainly beats an ambiguous "not found".
      res.status(403).json({ error: 'not_a_winner' });
      return;
    }

    // E8: see tiedAtUnclaimedRank's own doc comment for why this check exists.
    const claims = await loadClaims(db, tid);
    if (tiedAtUnclaimedRank(claims, me.rank, uid)) {
      res.status(409).json({ error: 'rank_pending_review' });
      return;
    }

    rank = me.rank;
    finishRank = me.rank;
    prizeCents = cents;
  }

  const outcome = await db.runTransaction(async (tx) => {
    const snap = await tx.get(claimRef);
    const current = (snap.data() ?? null) as Row | null;
    const currentState = current ? (String(current.state) as ClaimState) : null;

    if (currentState === 'rejected') return { error: 'claim_rejected' as const };
    if (currentState === 'expired') return { error: 'claim_expired' as const };

    const storedExpiry = toMillis(current?.expiresAt);
    // The window runs from when the prize was OFFERED, not from when the
    // student got round to filling in the form. Re-stamping it on submit would
    // let a claimant extend their own deadline by claiming late.
    const expiresAt = storedExpiry ?? now + CLAIM_WINDOW_MS;
    if (now >= expiresAt) return { error: 'claim_expired' as const };

    const claimedAt = toMillis(current?.claimedAt) ?? now;

    tx.set(claimRef, {
      uid,
      rank,
      finishRank,
      prizeCents,
      // `claimed`, not `verified`. Nothing this endpoint receives verifies
      // anybody; verification is the call an admin makes afterwards, and
      // collapsing the two would make the claim form the whole check.
      state: 'claimed' satisfies ClaimState,
      contact: submission.contact,
      isMinor: submission.isMinor,
      // Written on EVERY claim, null for an adult. A guardian modelled as an
      // optional afterthought is a guardian that half the code forgets to read.
      guardian: submission.guardian,
      claimedAt: Timestamp.fromMillis(claimedAt),
      expiresAt: Timestamp.fromMillis(expiresAt),
      updatedAt: Timestamp.fromMillis(now),
      // Preserved rather than recomputed: the chain of where a prize came from
      // is the record that makes a roll-down explainable months later.
      rolledDownFrom: current?.rolledDownFrom ?? null,
      rolledDownFromUid: current?.rolledDownFromUid ?? null,
      rollDownReason: current?.rollDownReason ?? null,
      reviewedBy: current?.reviewedBy ?? null,
      reviewNote: current?.reviewNote ?? null,
    }, { merge: true });

    return { ok: true as const, rank, prizeCents, expiresAt };
  });

  if ('error' in outcome) {
    res.status(outcome.error === 'claim_expired' ? 410 : 409).json({ error: outcome.error });
    return;
  }

  // The guardian email goes out AFTER the claim is written, and its failure is
  // recorded rather than raised: the claim is already valid, the page in front
  // of the student already lists the same three steps, and a bounced email
  // costs a reminder, not a prize. An admin chasing a silent winner needs to be
  // able to see that the message never went out.
  let consentEmail: { sent: boolean; to?: string[]; error?: string } | null = null;
  if (submission.isMinor && submission.guardian) {
    // The name the podium showed. A parent recognises their child from it;
    // falling back to "your child" is better than falling back to a uid, which
    // would read like a scam in an email about money.
    const alias = await publicDisplayName(db, uid, undefined);
    const isCreole = body.lang !== 'fr';
    const result = await sendConsentEmail({
      to: [submission.guardian.contact, submission.contact],
      lang: isCreole ? 'ht' : 'fr',
      playerName: alias || (isCreole ? 'pitit ou a' : 'votre enfant'),
      guardianName: submission.guardian.name,
      tournamentTitle: String(tournament.title ?? tid),
      rank: outcome.rank,
      prizeCents: outcome.prizeCents,
      expiresAt: outcome.expiresAt,
      tournamentId: tid,
    });
    consentEmail = 'sent' in result ? { sent: true, to: result.to } : { sent: false, error: result.error };
    await claimRef.set({
      consentEmail: { ...consentEmail, at: Timestamp.fromMillis(Date.now()) },
    }, { merge: true }).catch((err) => {
      console.error('[arena/claim] could not record consent email result:', err);
    });
  }

  res.status(200).json({
    ok: true,
    action: 'claimed',
    rank: outcome.rank,
    prizeCents: outcome.prizeCents,
    expiresAt: outcome.expiresAt,
    guardianRequired: submission.isMinor,
    consentRequired: submission.isMinor,
    consentEmail,
    message: 'Reklamasyon an anrejistre. Nou pral rele w pou verifye.',
  });
}

// ── 1b · The family attaches the signed consent form ────────────────────────

/**
 * Record a consent form the claimant has already uploaded to Storage.
 *
 * The upload itself goes straight from the browser to Cloud Storage, under
 * rules that pin the path to the uploader's own uid and deny every read. This
 * endpoint does the half the rules cannot: it checks that the path names THIS
 * tournament and THIS student, and that an object is actually there — a claim
 * pointing at a file that does not exist would show an admin a broken link and
 * a student a finished task.
 *
 * It does NOT verify anybody. The state stays `claimed`: an upload is a
 * document arriving, and a document arriving is not a person checked. Moving to
 * `verified` on upload would make the form its own approval, which is exactly
 * the check this whole flow exists to perform.
 */
async function handleConsent(ctx: {
  db: Firestore;
  res: VercelResponse;
  uid: string;
  tid: string;
  body: Record<string, unknown>;
}): Promise<void> {
  const { db, res, uid, tid, body } = ctx;

  const parsed = parseConsentPath(body.path, tid, uid);
  if (!parsed.ok) {
    res.status(400).json({ error: 'invalid_consent_path', reason: parsed.error });
    return;
  }
  const path = String(body.path);

  const claimRef = db.doc(`tournaments/${tid}/claims/${uid}`);
  const snap = await claimRef.get();
  if (!snap.exists) {
    res.status(404).json({ error: 'claim_not_found' });
    return;
  }
  const claim = (snap.data() ?? {}) as Row;
  const state = String(claim.state ?? '') as ClaimState;
  if (state === 'rejected') { res.status(409).json({ error: 'claim_rejected' }); return; }
  if (state === 'expired') { res.status(410).json({ error: 'claim_expired' }); return; }

  const expiresAt = toMillis(claim.expiresAt) ?? 0;
  const now = Date.now();
  if (expiresAt > 0 && now >= expiresAt) {
    res.status(410).json({ error: 'claim_expired' });
    return;
  }

  // The object must exist, and it must be within the size the rules allow —
  // read from the object itself rather than from what the client said it
  // uploaded, because the client is the one thing here we did not write.
  let size = 0;
  let contentType = '';
  try {
    const file = getConsentBucket().file(path);
    const [exists] = await file.exists();
    if (!exists) {
      res.status(404).json({ error: 'consent_file_missing' });
      return;
    }
    const [meta] = await file.getMetadata();
    size = Number(meta.size ?? 0);
    contentType = String(meta.contentType ?? '');
    if (size > CONSENT_MAX_BYTES || !CONSENT_TYPES[contentType]) {
      res.status(400).json({ error: 'consent_file_rejected' });
      return;
    }
  } catch (err) {
    if ((err as Error)?.message === 'storage_not_configured') {
      console.error('[arena/claim] FIREBASE_STORAGE_BUCKET is not set; consent uploads cannot be recorded');
      res.status(503).json({ error: 'storage_not_configured' });
      return;
    }
    console.error('[arena/claim] consent object check failed:', err);
    res.status(502).json({ error: 'consent_check_failed' });
    return;
  }

  // Appended, not replaced. The rules make each upload a new object, so the
  // history of what was submitted stays readable; `consent` points at the one
  // an admin should look at now.
  const entry = { path, size, contentType, uploadedAt: Timestamp.fromMillis(now) };
  await claimRef.set({
    consent: entry,
    consentHistory: FieldValue.arrayUnion({ path, size, contentType, uploadedAtMs: now }),
    updatedAt: Timestamp.fromMillis(now),
  }, { merge: true });

  res.status(200).json({ ok: true, action: 'consent_recorded', path, size, contentType });
}

// ── 2 · An admin verifies or rejects ────────────────────────────────────────

async function handleReview(ctx: {
  db: Firestore;
  res: VercelResponse;
  adminUid: string;
  tid: string;
  body: Record<string, unknown>;
}): Promise<void> {
  const { db, res, adminUid, tid, body } = ctx;

  const targetUid = typeof body.uid === 'string' ? body.uid.trim() : '';
  const decision = body.decision;
  if (!targetUid || (decision !== 'verified' && decision !== 'rejected')) {
    res.status(400).json({ error: 'invalid_review' });
    return;
  }
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : null;

  const claimRef = db.doc(`tournaments/${tid}/claims/${targetUid}`);
  const snap = await claimRef.get();
  if (!snap.exists) {
    res.status(404).json({ error: 'claim_not_found' });
    return;
  }
  const claim = snap.data() as Row;
  const now = Date.now();

  await claimRef.update({
    state: decision satisfies ClaimState,
    reviewedBy: adminUid,
    reviewNote: note,
    reviewedAt: Timestamp.fromMillis(now),
  });

  if (decision === 'verified') {
    res.status(200).json({ ok: true, action: 'verified', uid: targetUid });
    return;
  }

  // A rejection vacates the prize, so it rolls down immediately rather than
  // waiting for the window: the window protects a student who has not answered
  // yet, and this one has answered and failed.
  const rank = typeof claim.rank === 'number' ? claim.rank : 0;
  const applied = await applyRollDown({ db, tid, rank, actorUid: adminUid, now });
  res.status(200).json({ ok: true, action: 'rejected', uid: targetUid, rollDown: applied });
}

// ── 3 · The sweep: expire what the window has run out on ────────────────────

async function handleSweep(ctx: {
  db: Firestore;
  res: VercelResponse;
  adminUid: string;
  tid: string;
}): Promise<void> {
  const { db, res, adminUid, tid } = ctx;
  const now = Date.now();

  const claims = await loadClaims(db, tid);
  const results: unknown[] = [];

  // One pass per prize rank, lowest rank first, so that a prize which rolls
  // down is already recorded as held before the next rank is resolved and
  // cannot be offered to the same student twice in one sweep.
  const ranks = [...new Set(claims.map((c) => c.rank))].sort((a, b) => a - b);
  for (const rank of ranks) {
    // `currentHolder`, not a bare find: a rolled-down prize leaves two
    // documents at the same rank and the stale one must never be re-expired.
    const claim = currentHolder(claims, rank, now);
    if (!claim) continue;
    if (effectiveClaimState(claim, now) !== 'expired') continue;

    // Write the expiry down before rolling down, so that a crash between the
    // two leaves a prize nobody holds rather than a prize two people hold.
    if (claim.state !== 'expired') {
      await db.doc(`tournaments/${tid}/claims/${claim.uid}`).update({
        state: 'expired' satisfies ClaimState,
        expiredAt: Timestamp.fromMillis(now),
        reviewNote: 'Claim window closed without a completed claim.',
      });
    }
    results.push(await applyRollDown({ db, tid, rank, actorUid: adminUid, now }));
  }

  res.status(200).json({ ok: true, action: 'swept', rollDowns: results });
}

// ── Applying a roll-down ────────────────────────────────────────────────────

/**
 * Compute the roll-down and write the new open claim.
 *
 * The decision is `rollDown()` — pure, replayable, testable. This function only
 * persists it, and it persists the REASON alongside the prize, because "it
 * rolled down" without a stated reason is the argument section M principle 4
 * exists to avoid having in public.
 */
async function applyRollDown(ctx: {
  db: Firestore;
  tid: string;
  rank: number;
  actorUid: string;
  now: number;
}): Promise<RollDownResult & { written: boolean }> {
  const { db, tid, rank, actorUid, now } = ctx;

  const [finishers, claims] = await Promise.all([
    loadFinishers(db, tid, ROLLDOWN_DEPTH),
    loadClaims(db, tid),
  ]);

  const result = rollDown({ fromRank: rank, finishers, claims, now });
  if (!result.moves || !result.toUid) return { ...result, written: false };

  const vacated = currentHolder(claims, rank, now);
  const nextRef: DocumentReference = db.doc(`tournaments/${tid}/claims/${result.toUid}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(nextRef);
    // Last-moment guard against the race the pure function cannot see: if this
    // student picked up a prize between the read above and this write, leave it
    // alone. Two prizes to one student is the one outcome worth aborting for.
    const existing = readClaim(result.toUid as string, snap.data() as Row | undefined);
    const existingState = effectiveClaimState(existing, now);
    if (existingState !== null && HOLDING_STATES.includes(existingState)) return;

    tx.set(nextRef, {
      uid: result.toUid,
      rank,
      finishRank: result.toFinishRank,
      prizeCents: vacated?.prizeCents ?? 0,
      state: 'open' satisfies ClaimState,
      claimedAt: null,
      // A fresh 72 hours: the published window belongs to whoever holds the
      // prize, and inheriting the previous holder's remaining minutes would
      // hand somebody a deadline that had already passed.
      expiresAt: Timestamp.fromMillis(now + CLAIM_WINDOW_MS),
      guardian: null,
      reviewedBy: null,
      reviewNote: null,
      rolledDownFrom: vacated ? vacated.rank : rank,
      rolledDownFromUid: vacated?.uid ?? null,
      rollDownReason: result.reason,
      rolledDownAt: Timestamp.fromMillis(now),
      rolledDownBy: actorUid,
      // The people passed over, and why. Stored on the claim rather than in a
      // log because the question "why not me?" is asked of the prize, and the
      // answer has to live where somebody can find it.
      passedOver: result.skipped,
    }, { merge: true });

    if (vacated) {
      tx.update(db.doc(`tournaments/${tid}/claims/${vacated.uid}`), {
        rolledDownTo: result.toUid,
        rolledDownToAt: Timestamp.fromMillis(now),
      });
    }
  });

  return { ...result, written: true };
}
