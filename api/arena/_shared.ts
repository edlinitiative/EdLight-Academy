/**
 * api/arena/_shared — the decisions the three Arena endpoints must agree on.
 * ───────────────────────────────────────────────────────────────────────────
 * Files under api/ whose name begins with `_` are not deployed as endpoints
 * (same convention as api/_lib), so this is safe to import from register.ts,
 * answer.ts and presence.ts.
 *
 * Everything here that can be pure IS pure — no clock of its own, no I/O in the
 * decision functions — for the same reason shared/arena/scoring.ts is pure: the
 * tournament must be re-scorable and re-judgeable from `answers/*` months
 * later. A rule that only exists inside a request handler cannot be replayed,
 * and a disqualification we cannot reproduce is a judgement call, not a ruling.
 *
 * Scoring and state transitions are NOT re-implemented here. They live in
 * shared/arena/scoring.ts and shared/arena/state.ts and are imported by the
 * endpoints, because a rule implemented twice is a rule that disagrees with
 * itself at 18:40 on a live stream.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { checkRateLimit } from '../_lib/rateLimit';
import { ARENA_STATES, type ArenaState } from '../../shared/arena/state';

// ── Windows and thresholds ──────────────────────────────────────────────────

/**
 * How long after `closesAt` a submission is still ACCEPTED (and recorded).
 *
 * Decision 2 of 2026-09-18: the ~10s pause between questions is where late
 * answers land. A student on a bad connection whose answer arrives at 21s is
 * still submitting in good faith, and the pause exists to make that visible
 * rather than invisible. The answer is recorded, counted toward their school's
 * participation, and scored at whatever tier its timestamp earns — which past
 * the 20s half-tier boundary is almost always zero.
 *
 * Rejecting instead would hide exactly the students this scoring model was
 * designed to protect: the ones whose network, not whose knowledge, was slow.
 */
export const LATE_GRACE_MS = 10_000;

/**
 * An answer this fast on a four-option question is flagged, never blocked.
 *
 * Section M. 800ms is below the time it takes to read a Haitian-Creole or
 * French sentence and move a thumb; it is not proof of anything on its own —
 * a student who guessed the instant the options painted produces it honestly —
 * which is precisely why it flags for review instead of deciding anything live.
 */
export const FAST_ANSWER_MS = 800;

/**
 * Focus losses on a single question before the player is flagged.
 *
 * SPEC AMBIGUITY RESOLVED: section M names `focusLosses` as evidence but sets
 * no threshold. One blur is a notification banner, an incoming call, or a
 * battery warning — flagging on one would flag half of Haiti and make the flag
 * useless, which is the real failure mode of an over-eager signal. Two within a
 * single 20-second question is a pattern. The RAW count is stored on every
 * answer document regardless, so a reviewer can apply any threshold later
 * against the complete record; this constant only decides what gets surfaced on
 * the player row in real time.
 */
export const FOCUS_LOSS_FLAG_MIN = 2;

/** Bounds on untrusted body input. A tournament has 25 questions, not 500. */
export const MAX_QUESTION_INDEX = 499;
/** More than this many focus losses in one question is a broken client, not evidence. */
export const MAX_FOCUS_LOSSES = 1_000;

/** The grade that is attested away: the Arena is for primary and secondary students. */
export const INELIGIBLE_GRADES: readonly string[] = ['POSTBAC'];

/** Grade codes from shared/trackConfig GRADES, minus the ineligible one. */
export const ELIGIBLE_GRADES: readonly string[] = ['7e', '8e', '9e', 'NS1', 'NS2', 'NS3', 'NS4'];

/**
 * Qualification floor when a tournament document does not carry `minPlayers`.
 * Section C freezes `teamSize`/`minPlayers` PER TOURNAMENT, never globally, so
 * this is only the fallback for a malformed document — never the source.
 */
export const DEFAULT_MIN_PLAYERS = 5;

// ── Input plumbing ──────────────────────────────────────────────────────────

/** Vercel hands JSON pre-parsed, except when it doesn't. Same shape as api/challenges/*. */
export function parseBody(req: VercelRequest): Record<string, unknown> {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body || '{}') as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (req.body as Record<string, unknown>) || {};
}

/** Firestore document ids may not contain `/`; tournament ids come from a slug. */
export function isValidTournamentId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value);
}

/**
 * A school key as produced by `schoolKey()` in shared/schools.ts: folded to
 * lowercase, accents stripped, punctuation collapsed to single spaces. Validated
 * rather than re-derived, because the key the student's client picked is the key
 * the board groups by, and normalising it a second time here — with a copy of
 * the rules that could drift — is how one school becomes two.
 */
export function isValidSchoolKey(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9]+( [a-z0-9]+)*$/.test(value) && value.length <= 120;
}

/**
 * The per-device fingerprint the multi-account signal is built on.
 *
 * Optional on purpose. A client that cannot compute one still registers: shared
 * phones are ordinary in Haiti (section M prices multi-account at "many
 * devices" and flags rather than blocks it), and turning a missing fingerprint
 * into a rejection would lock out real students to catch a threat we have
 * already decided not to block.
 */
export function normalizeDeviceHash(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^[A-Za-z0-9_-]{8,128}$/.test(trimmed) ? trimmed : null;
}

/** An integer inside bounds, or null. Never coerces a float or a numeric string silently. */
export function boundedInt(value: unknown, min: number, max: number): number | null {
  const n = typeof value === 'number' ? value : NaN;
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

/** Firestore Timestamp | epoch ms | ISO string → epoch ms, or null when unusable. */
export function toMillis(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  // Duck-typed Timestamp: the Admin SDK returns real Timestamps, but a document
  // written by an older path (or a test fixture) can carry the plain shape.
  if (value && typeof value === 'object' && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    const ms = (value as { toMillis: () => number }).toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/** A state string off a Firestore document, narrowed — or null if it is not one of ours. */
export function asArenaState(value: unknown): ArenaState | null {
  return typeof value === 'string' && (ARENA_STATES as readonly string[]).includes(value)
    ? (value as ArenaState)
    : null;
}

// ── Registration window ─────────────────────────────────────────────────────

/**
 * May a student still register?
 *
 * `registration` and `doors` — and `doors` is the one that matters. It is the
 * state `registration` advances into (canTransition('registration','doors') is
 * true, and the test asserts it so the pair cannot drift apart), which means a
 * student arriving at T−9 minutes finds the room already open. Closing
 * registration the moment the doors open would turn the single highest-intent
 * ten minutes in the whole product — the push that says "il manque 2 joueurs à
 * CODOSA, la salle est ouverte" — into a link that rejects everyone it reaches.
 *
 * Every later state is closed: an answer in `live` from someone who registered
 * mid-round has no `opensAt` to be timed against for the questions already gone.
 */
export function isRegistrationOpen(state: ArenaState): boolean {
  return state === 'registration' || state === 'doors';
}

/**
 * Is this grade allowed to compete?
 *
 * ATTESTED, NOT PROVEN — the distinction is the whole design of this check.
 * Nothing here verifies that a student is in NS3; the student says so, and the
 * registration document records `attestedAt` beside it. The deterrent is that
 * verification happens at CLAIM, for winners only (section M principle 5), and
 * that it is announced beforehand. So this rejects the one case the product has
 * actually decided about — a post-bac student in a primary-and-secondary
 * tournament — and records the claim for everything else.
 */
export function isEligibleGrade(grade: unknown): grade is string {
  return typeof grade === 'string' && ELIGIBLE_GRADES.includes(grade);
}

// ── The submission window ───────────────────────────────────────────────────

export type SubmissionRejection = 'no_window' | 'too_late';

export interface SubmissionWindow {
  /** Server time the question window opened. */
  opensAt: number | null;
  /** Server time the window closed. */
  closesAt: number | null;
  /** When WE received it. The only trusted end of the span. */
  serverReceivedAt: number;
}

export interface SubmissionDecision {
  accept: boolean;
  /** Landed after `closesAt` but inside the pause. Recorded, almost always worth 0. */
  late: boolean;
  /** Landed before the question opened. Recorded and flagged, never silently dropped. */
  early: boolean;
  reason: SubmissionRejection | null;
}

/**
 * Accept, or reject, one submission on its timestamps alone.
 *
 * Three outcomes, and only one of them is a rejection:
 *
 *  - ACCEPTED, on time. The ordinary case.
 *  - ACCEPTED, late — after `closesAt`, within LATE_GRACE_MS. Decision 2: the
 *    pause is where late answers land. It scores what its timestamp earns
 *    (normally nothing) but it is recorded, shown, and counted toward the
 *    school's participation, because a student answering in good faith on a bad
 *    connection must appear in the record.
 *  - ACCEPTED, early — received before `opensAt`. Section M's threat table says
 *    "server rejects"; section M's PRINCIPLES say "flag, don't block, in real
 *    time", and the principle wins. An answer that arrives before the question
 *    was delivered is evidence of a leak, and the one thing we must not do with
 *    evidence is throw it away at the door. It scores zero either way —
 *    scoreAnswer's isImpossible() path sees to that — so the student's outcome
 *    is identical and the audit trail is not empty.
 *
 * The single rejection is a submission more than LATE_GRACE_MS past the close.
 * By then the next question is open; accepting would let a client bank answers
 * and submit them against whichever window it preferred.
 */
export function decideSubmission(w: SubmissionWindow): SubmissionDecision {
  const { opensAt, closesAt, serverReceivedAt } = w;

  // A live document with no usable window is our bug, not the student's — but
  // we cannot score against a clock that does not exist, and inventing one
  // would silently score everybody at the full tier.
  if (opensAt === null || closesAt === null || !Number.isFinite(serverReceivedAt)) {
    return { accept: false, late: false, early: false, reason: 'no_window' };
  }

  if (serverReceivedAt > closesAt + LATE_GRACE_MS) {
    return { accept: false, late: true, early: false, reason: 'too_late' };
  }

  return {
    accept: true,
    late: serverReceivedAt > closesAt,
    early: serverReceivedAt < opensAt,
    reason: null,
  };
}

// ── Integrity flags ─────────────────────────────────────────────────────────

export interface FlagInput {
  questionIndex: number;
  /** From scoreAnswer(). Negative for an impossible submission. */
  elapsedMs: number;
  /** From isImpossible() in shared/arena/scoring.ts. */
  impossible: boolean;
  /** How many times the app lost focus during this question, as reported. */
  focusLosses: number;
}

/**
 * The flags one submission earns. FLAG, DO NOT BLOCK — section M principle 2.
 *
 * A false positive that disqualifies a real student live, on a stream, is far
 * worse than a cheat caught in review two days later: the first is a public
 * accusation we cannot take back and the second is the process working as
 * announced. So nothing in this function stops a request; it only writes to
 * `flags[]` on the player row for a human to read afterwards.
 *
 * Each flag carries its question index. Twenty-five entries is a readable
 * audit trail; a bare `'fast'` repeated twenty-five times is not, and a
 * reviewer needs to know WHICH questions to pull the answer documents for.
 */
export function integrityFlags(input: FlagInput): string[] {
  const flags: string[] = [];
  const { questionIndex, elapsedMs, impossible, focusLosses } = input;

  if (impossible) flags.push(`impossible:${questionIndex}`);
  // `elapsedMs >= 0` keeps this from double-reporting the impossible case,
  // which already has its own, more specific flag and a negative span.
  else if (Number.isFinite(elapsedMs) && elapsedMs >= 0 && elapsedMs < FAST_ANSWER_MS) {
    flags.push(`fast:${questionIndex}`);
  }

  if (Number.isFinite(focusLosses) && focusLosses >= FOCUS_LOSS_FLAG_MIN) {
    flags.push(`focus:${questionIndex}:${focusLosses}`);
  }

  return flags;
}

// ── Firestore helpers ───────────────────────────────────────────────────────

/** Firestore's ALREADY_EXISTS. A duplicate submission, not a failure. */
export function isAlreadyExists(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === 6 || code === 'already-exists' || code === 'ALREADY_EXISTS') return true;
  return /already exists/i.test(String((err as { message?: unknown } | null)?.message ?? ''));
}

/** The shape /api/arena/answer returns, whether it just scored or is replaying. */
export interface AnswerResult {
  correct: boolean;
  tier: string;
  points: number;
  score: number;
  streak: number;
  late: boolean;
}

/**
 * Rebuild the response from an answer document that was already recorded.
 *
 * A retry after a network timeout is normal — the student's phone dropped the
 * response, not the answer — so the second POST must return what the first one
 * decided, not an error and NOT a fresh scoring pass. Re-scoring would use a
 * new `serverReceivedAt` and could hand the same submission a different tier,
 * which is the one thing a record that has to survive a public dispute cannot do.
 */
export function replayAnswer(stored: DocumentData, player: DocumentData | undefined): AnswerResult {
  return {
    correct: stored.correct === true,
    tier: typeof stored.tier === 'string' ? stored.tier : 'none',
    points: typeof stored.points === 'number' ? stored.points : 0,
    score: typeof player?.score === 'number' ? player.score : 0,
    streak: typeof player?.streak === 'number' ? player.streak : 0,
    late: stored.late === true,
  };
}

export interface SchoolCounts {
  /** Players who registered for this tournament at this school. */
  registered: number;
  /** Players who actually turned up — the number qualification is measured on. */
  present: number;
}

/**
 * How many players a school has, registered and present.
 *
 * Both numbers, always, because Decision 3 of 2026-09-18 made them different
 * and the difference is a thing students must SEE: "CODOSA · 5 inscrits · 3
 * présents". A school can lose qualification on the night, and discovering that
 * at kick-off is the bad story the lobby copy exists to prevent.
 *
 * One query, not two aggregations: a school fields tens of players, the read is
 * bounded, and `getCountFromServer` has been flaky enough in this codebase
 * (see the admin console) that two counts would be two chances to be wrong.
 */
export async function schoolCounts(
  db: Firestore,
  tournamentId: string,
  schoolKey: string,
): Promise<SchoolCounts> {
  const snap = await db
    .collection(`tournaments/${tournamentId}/players`)
    .where('schoolKey', '==', schoolKey)
    .select('presentAt')
    .get();

  let present = 0;
  for (const doc of snap.docs) if (doc.get('presentAt')) present += 1;
  return { registered: snap.size, present };
}

// ── Public display name ─────────────────────────────────────────────────────

/** A public alias must contain at least one letter (matches leaderboardService). */
export function isValidAlias(name: unknown): boolean {
  return /\p{L}/u.test(String(name ?? ''));
}

/**
 * Privacy-safe default alias from a verified account name — the SAME derivation
 * as api/challenges/create.ts and api/leaderboard/award.ts ("Ted Olivier
 * Jacquet" → "Ted J.").
 *
 * Copied deliberately rather than generalised, so the rule is identical on
 * every surface that publishes a name. Most of this audience is under 18 and
 * the Arena standings go on a public stream: a minor's full name must never
 * reach a board, and a board that derives names slightly differently from the
 * others is how one eventually does.
 */
export function defaultAlias(name: string | undefined): string | null {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length || !isValidAlias(parts[0])) return null;
  const first = parts[0].slice(0, 30);
  const lastInitial = parts.length > 1 ? ` ${parts[parts.length - 1][0].toUpperCase()}.` : '';
  return `${first}${lastInitial}`;
}

/**
 * The name that may appear on the Arena standings: the student's stored board
 * alias first — they chose it, and a hidden entry means they chose NOT to be
 * named — then the token derivation, then null.
 *
 * Null is a real answer, not a failure. `rankIndividuals` renders an empty
 * display name, the leaderboard already hides and prompts nameless entries
 * rather than inventing one, and a name we made up is worse on a stream than no
 * name at all.
 */
export async function publicDisplayName(
  db: Firestore,
  uid: string,
  tokenName: string | undefined,
): Promise<string | null> {
  try {
    const entry = (await db.doc(`leaderboards/all-time/entries/${uid}`).get()).data();
    if (entry && entry.hidden !== true && isValidAlias(entry.displayName)) {
      return String(entry.displayName).slice(0, 40);
    }
  } catch {
    /* best-effort: a missing board entry is the common case, not an error */
  }
  return defaultAlias(tokenName);
}

/**
 * The school's display label, best-effort.
 *
 * Never blocks a registration. A student whose school is mid-approval still
 * plays (section M: nobody is turned away), and falling back to the key keeps a
 * readable row instead of an empty one on the standings.
 */
export async function schoolLabel(db: Firestore, key: string): Promise<string> {
  try {
    const snap = await db.collection('schools').where('key', '==', key).limit(1).get();
    const data = snap.docs[0]?.data();
    const short = typeof data?.shortName === 'string' ? data.shortName.trim() : '';
    const name = typeof data?.name === 'string' ? data.name.trim() : '';
    return short || name || key;
  } catch (err) {
    console.error('[arena] school lookup failed:', err);
    return key;
  }
}

// ── Rate limiting ───────────────────────────────────────────────────────────

/**
 * Apply the shared limiter and answer the request if it is over.
 *
 * Factored because all three endpoints do it identically and the arena buckets
 * FAIL CLOSED (api/_lib/rateLimit.ts): a limiter that is down during a
 * tournament must not quietly become no limiter, because this is the one
 * feature in the product where being wrong costs somebody money. Returns true
 * when the caller may continue.
 */
export async function enforceRateLimit(
  res: VercelResponse,
  uid: string,
  bucket: 'arena-register' | 'arena-answer' | 'arena-presence',
): Promise<boolean> {
  const { allowed, remaining, resetAt } = await checkRateLimit(uid, bucket);
  if (!allowed) {
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))));
    res.status(429).json({ error: 'rate_limit_exceeded', message: 'Trop de requêtes. Réessayez plus tard.' });
    return false;
  }
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  return true;
}

// ── Who may drive the engine ────────────────────────────────────────────────

/**
 * The Arena's scheduled endpoints were built for a cron and authenticate with
 * a shared secret. The run console cannot hold that secret — a browser session
 * that carries `CRON_SECRET` has handed the whole engine to whoever reads
 * localStorage — so a human host needs a second door, and the two doors have
 * to agree on what they open.
 *
 * That agreement lives here rather than in each endpoint, because the failure
 * mode of three copies is not a crash: it is one route that quietly accepts a
 * stale custom claim while the other two read the user document, and nobody
 * notices until somebody who was demoted in March forces a question closed in
 * September.
 */

export type ArenaActor =
  | { kind: 'cron'; label: 'cron' }
  | { kind: 'admin'; label: string; uid: string };

/** Constant-time compare — the secret must not leak through response timing. */
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

/** `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret`. */
export function cronAuthorized(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) return false; // refuse to run unprotected
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const headerSecret = (req.headers['x-cron-secret'] as string) || '';
  return (
    (!!bearer && secretsMatch(bearer, secret))
    || (!!headerSecret && secretsMatch(headerSecret, secret))
  );
}

/**
 * The same admin test `isAdmin()` makes in firestore.rules: `users/{uid}.role`.
 *
 * Read server-side rather than trusted from a custom claim, because this
 * codebase has no admin custom claims — the role lives on the user document.
 * A failed lookup is NOT an admin: everything behind this door touches money.
 */
export async function isAdminUid(db: Firestore, uid: string): Promise<boolean> {
  try {
    const snap = await db.doc(`users/${uid}`).get();
    return snap.exists && (snap.data() as DocumentData | undefined)?.role === 'admin';
  } catch (err) {
    console.error('[arena] admin lookup failed:', err);
    return false;
  }
}

/**
 * Cron secret, or a signed-in admin. Writes its own 401/403/429 and returns
 * null when the caller may not proceed.
 *
 * The cron check comes first and deliberately costs no Firestore read: the
 * scheduler calls `advance` every few seconds during a live tournament, and
 * making the hot path pay for a user lookup it can never satisfy is how a
 * safety net becomes a bill.
 *
 * `requireAuthDecoded` is imported lazily so that a cron invocation does not
 * pull the auth module into its cold start.
 */
export async function authorizeCronOrAdmin(
  req: VercelRequest,
  res: VercelResponse,
  db: Firestore,
  bucket: string,
): Promise<ArenaActor | null> {
  if (cronAuthorized(req)) return { kind: 'cron', label: 'cron' };

  const { requireAuthDecoded } = await import('../_lib/requireAuth');
  const decoded = await requireAuthDecoded(req, res);
  if (!decoded) return null; // requireAuthDecoded has already answered 401

  const { allowed, remaining, resetAt } = await checkRateLimit(decoded.uid, bucket);
  if (!allowed) {
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))));
    res.status(429).json({ error: 'rate_limit_exceeded', message: 'Trop de requêtes. Réessayez plus tard.' });
    return null;
  }
  res.setHeader('X-RateLimit-Remaining', String(remaining));

  if (!(await isAdminUid(db, decoded.uid))) {
    res.status(403).json({ error: 'not_admin' });
    return null;
  }
  return { kind: 'admin', label: decoded.uid, uid: decoded.uid };
}
