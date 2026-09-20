/**
 * arenaAdminService — the data layer behind the Arena admin console.
 *
 * Three different doors, because the Arena deliberately does not have one:
 *
 *  1. **Firestore, read-only.** `tournaments/{tid}`, `live/{index}`,
 *     `standings/current` and `events/{seq}` are all client-readable (see
 *     `firestore.rules`), so the run console watches them directly and gets a
 *     live board for free. No client write is possible anywhere in the Arena —
 *     every write in this feature goes through the Admin SDK by design.
 *  2. **`/api/arena/questions`,** which is the ONLY way an authored question
 *     can be read or written. `tournaments/{tid}/questions/**` is denied to
 *     every client including an admin's, because the whole integrity model
 *     rests on the answer key living server-side only. The endpoint verifies
 *     `users/{uid}.role === 'admin'` with the Admin SDK and takes the admin's
 *     Firebase ID token.
 *  3. **`/api/arena/doors-close`,** which takes EITHER `CRON_SECRET` or a
 *     signed-in admin — explicitly for this console's manual trigger. It is
 *     the one write here that works today.
 *  4. **`/api/arena/advance` and `/api/arena/aggregate`,** which are guarded by
 *     `CRON_SECRET`, NOT by an admin ID token — see `postAdvance` below for
 *     what that means for the run console today.
 *
 * Firestore conventions (getDocs fallback after an ordered read, thin typed
 * wrappers, no component ever touching a collection path) follow
 * `services/adminService.ts`.
 */
import {
  collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, limit as fbLimit,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, authedFetch, getIdToken } from './firebase';
import { canTransition, type ArenaState } from '../../shared/arena/state';
import type { FinalBlocker, FlagSummary, ReviewDecision } from '../../shared/arena/review';
import { schoolKey } from '../../shared/schools';
import seedDoc from '../../shared/data/schools-seed.json';

// ── Shapes ──────────────────────────────────────────────────────────────────

export interface ArenaCurrentQuestion {
  index: number;
  seq: number;
  opensAt: number;
  closesAt: number;
}

export interface ArenaTournament {
  id: string;
  slug: string;
  title: string;
  state: ArenaState;
  startsAt: number;
  doorsAt: number;
  questionCount: number;
  teamSize: number;
  minPlayers: number;
  /** Per-tournament overrides of the two clocks in `api/arena/advance.ts`. */
  questionWindowMs: number;
  pauseMs: number;
  currentRound: number | null;
  currentQuestion: ArenaCurrentQuestion | null;
  countsPublic: { schools: number; players: number; qualifiedSchools: number };
}

/** `tournaments/{tid}/live/{index}` — the delivery document. Never the key. */
export interface ArenaLiveQuestion {
  index: number;
  seq: number;
  prompt: string;
  promptHt: string;
  options: string[];
  optionsHt: string[];
  opensAt: number;
  closesAt: number;
  closedAt: number;
  state: 'pending' | 'open' | 'closed';
}

export interface ArenaStandingsSummary {
  seq: number;
  computedAt: number;
  schools: number;
  qualifiedSchools: number;
  players: number;
  leader: string;
}

/**
 * A question as the LIST endpoint returns it — deliberately without
 * `answerIndex`, so an authoring session that gets screenshotted leaks nothing.
 * `authored` is the server's answer to "does this one have a key yet".
 */
export interface ArenaQuestionRow {
  index: number;
  prompt: string;
  promptHt: string;
  options: string[];
  optionsHt: string[];
  explanation: string;
  category: string;
  difficulty: number;
  authored: boolean;
}

/** One question WITH its key, fetched only when an editor is actually opened. */
export interface ArenaQuestionDraft {
  index: number;
  prompt: string;
  promptHt: string;
  options: string[];
  optionsHt: string[];
  answerIndex: number;
  explanation: string;
  category: string;
  difficulty: number;
}

// ── Errors ──────────────────────────────────────────────────────────────────

export type ArenaAdminErrorCode =
  /** The server route this call needs does not exist yet. */
  | 'not_implemented'
  /** 401/403 — the credential the browser holds is not the one required. */
  | 'unauthorized'
  /** The endpoint refused the admin token and wants `CRON_SECRET` — which a
   *  browser must never hold. A misconfigured deploy, not a normal state. */
  | 'cron_secret_required'
  /** 409 — a question whose window has already opened cannot be rewritten. */
  | 'already_delivered'
  /** 400 — the server's validator refused. `field` names what. */
  | 'invalid_question'
  /** 409 — `canTransition` refused the move the console asked for. */
  | 'illegal_transition'
  /** 409 — the tournament cannot start: not every question is authored. */
  | 'questions_incomplete'
  /** 409 — no standings document, so there is no podium to publish. */
  | 'no_standings'
  /** 409 — a tournament already exists at that id. */
  | 'already_exists'
  /** 409 — `final` refused: the podium still has unresolved items. */
  | 'verification_incomplete'
  /** 400 — a disqualification, or an overridden finalisation, with no reason. */
  | 'reason_required'
  | 'rate_limited'
  | 'not_found'
  | 'server_error';

export class ArenaAdminError extends Error {
  code: ArenaAdminErrorCode;
  /** Set only on `verification_incomplete`: exactly what `final` refused on. */
  blockers?: FinalBlocker[];

  /** For `invalid_question`: which field the server rejected. */
  field?: string;

  constructor(code: ArenaAdminErrorCode, message: string, field?: string) {
    super(message);
    this.name = 'ArenaAdminError';
    this.code = code;
    this.field = field;
  }
}

// ── Readers ─────────────────────────────────────────────────────────────────

type Row = Record<string, any>;

const num = (v: unknown, fallback = 0): number =>
  (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

const str = (v: unknown, fallback = ''): string =>
  (typeof v === 'string' && v !== '' ? v : fallback);

/** Firestore hands timestamps back as `Timestamp`; some rows carry raw ms. */
function millis(v: any): number {
  if (!v) return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return 0;
}

const strings = (v: unknown): string[] =>
  (Array.isArray(v) ? v.map((o) => (typeof o === 'string' ? o : '')) : []);

/**
 * The two clocks, mirrored from `api/arena/advance.ts`.
 *
 * Duplicated rather than imported because that module pulls in `firebase-admin`
 * and the Vercel request types — neither belongs in a browser bundle. The
 * tournament document carries its own overrides and those win; these are only
 * what the console counts down with when it has not been told otherwise.
 */
export const DEFAULT_QUESTION_WINDOW_MS = 20_000;
export const DEFAULT_PAUSE_MS = 10_000;

function toTournament(id: string, data: Row): ArenaTournament {
  const current = (data.currentQuestion || null) as Row | null;
  const counts = (data.countsPublic || {}) as Row;
  return {
    id,
    slug: str(data.slug, id),
    title: str(data.title, id),
    state: str(data.state, 'draft') as ArenaState,
    startsAt: millis(data.startsAt),
    doorsAt: millis(data.doorsAt),
    questionCount: num(data.questionCount, 0),
    teamSize: num(data.teamSize, 5),
    minPlayers: num(data.minPlayers, 5),
    questionWindowMs: num(data.questionWindowMs, DEFAULT_QUESTION_WINDOW_MS),
    pauseMs: num(data.pauseMs, DEFAULT_PAUSE_MS),
    currentRound: typeof data.currentRound === 'number' ? data.currentRound : null,
    currentQuestion: current
      ? {
        index: num(current.index, -1),
        seq: num(current.seq, 0),
        opensAt: millis(current.opensAt),
        closesAt: millis(current.closesAt),
      }
      : null,
    countsPublic: {
      schools: num(counts.schools, 0),
      players: num(counts.players, 0),
      qualifiedSchools: num(counts.qualifiedSchools, 0),
    },
  };
}

/** Every tournament, newest first. Falls back to unordered when `startsAt` is
 *  missing on a draft, exactly as `adminService.listUsers` does. */
export async function listTournaments(max = 50): Promise<ArenaTournament[]> {
  const ref = collection(db, 'tournaments');
  let snap;
  try {
    snap = await getDocs(query(ref, orderBy('startsAt', 'desc'), fbLimit(max)));
  } catch {
    snap = await getDocs(query(ref, fbLimit(max)));
  }
  return snap.docs.map((d) => toTournament(d.id, d.data() as Row));
}

export async function getTournament(tid: string): Promise<ArenaTournament | null> {
  const d = await getDoc(doc(db, 'tournaments', tid));
  return d.exists() ? toTournament(d.id, d.data() as Row) : null;
}

/**
 * Watch one tournament.
 *
 * A run console that polls is a console that tells the host something that
 * stopped being true four seconds ago, on a night where the difference between
 * "open" and "closed" is the whole job. So this is a listener.
 */
export function watchTournament(
  tid: string,
  onChange: (t: ArenaTournament | null) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'tournaments', tid),
    (d) => onChange(d.exists() ? toTournament(d.id, d.data() as Row) : null),
    (e) => onError?.(e as Error),
  );
}

/** Watch the delivery document for one question index. */
export function watchLiveQuestion(
  tid: string,
  index: number,
  onChange: (q: ArenaLiveQuestion | null) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'tournaments', tid, 'live', String(index)),
    (d) => {
      if (!d.exists()) { onChange(null); return; }
      const data = d.data() as Row;
      onChange({
        index: num(data.index, index),
        seq: num(data.seq, 0),
        prompt: str(data.prompt),
        promptHt: str(data.promptHt),
        options: strings(data.options),
        optionsHt: strings(data.optionsHt),
        opensAt: millis(data.opensAt),
        closesAt: millis(data.closesAt),
        closedAt: millis(data.closedAt),
        state: str(data.state, 'pending') as 'pending' | 'open' | 'closed',
      });
    },
    (e) => onError?.(e as Error),
  );
}

/** Watch the single standings document every spectator also subscribes to. */
export function watchStandings(
  tid: string,
  onChange: (s: ArenaStandingsSummary | null) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'tournaments', tid, 'standings', 'current'),
    (d) => {
      if (!d.exists()) { onChange(null); return; }
      const data = d.data() as Row;
      const schools = Array.isArray(data.schools) ? data.schools : [];
      const individuals = Array.isArray(data.individuals) ? data.individuals : [];
      const top = schools[0] as Row | undefined;
      onChange({
        seq: num(data.seq, 0),
        computedAt: millis(data.computedAt),
        schools: schools.length,
        qualifiedSchools: schools.filter((s: Row) => s?.qualified === true).length,
        players: individuals.length,
        leader: str(top?.short, str(top?.label)),
      });
    },
    (e) => onError?.(e as Error),
  );
}

/**
 * Which question indices have already been delivered.
 *
 * `live/{index}` is readable by any signed-in client, so the authoring table
 * can show a delivered question as LOCKED rather than discovering it as a 409
 * after the author has retyped a prompt. The lock is not a UI nicety: a
 * question whose window has opened was answered by students, and re-scoring
 * them against a new key would be indefensible.
 */
export async function listDeliveredIndices(tid: string): Promise<number[]> {
  try {
    const snap = await getDocs(collection(db, 'tournaments', tid, 'live'));
    return snap.docs.map((d) => Number(d.id)).filter((n) => Number.isFinite(n));
  } catch {
    // A tournament with no live documents yet, or a rules edge — nothing is
    // locked, and the endpoint's 409 is still the authority.
    return [];
  }
}

// ── The authenticated calls ─────────────────────────────────────────────────

async function readError(res: Response): Promise<{ error?: string; field?: string }> {
  try {
    return (await res.json()) as { error?: string; field?: string };
  } catch {
    return {};
  }
}

function questionsError(res: Response, body: { error?: string; field?: string }): ArenaAdminError {
  if (res.status === 403) {
    return new ArenaAdminError('unauthorized', 'not_admin');
  }
  if (res.status === 401) {
    return new ArenaAdminError('unauthorized', 'unauthenticated');
  }
  if (res.status === 409) {
    return new ArenaAdminError('already_delivered', 'already_delivered');
  }
  if (res.status === 429) {
    return new ArenaAdminError('rate_limited', 'rate_limit_exceeded');
  }
  if (res.status === 404) {
    return new ArenaAdminError('not_found', 'not_found');
  }
  if (res.status === 400 && body.error === 'invalid_question') {
    return new ArenaAdminError('invalid_question', 'invalid_question', body.field);
  }
  return new ArenaAdminError('server_error', body.error || `http_${res.status}`);
}

/**
 * The run console's refusals, mapped to codes the page can explain.
 *
 * `questions_incomplete` and `no_standings` carry numbers the host needs to
 * act on, so they are surfaced in the message rather than flattened into a
 * generic failure — "start refused" tells nobody which of the 25 is missing.
 */
function stateError(res: Response, body: Row): ArenaAdminError {
  if (res.status === 401 || res.status === 403) {
    return new ArenaAdminError('unauthorized', str(body.error, 'not_admin'));
  }
  if (res.status === 429) return new ArenaAdminError('rate_limited', 'rate_limit_exceeded');
  if (res.status === 404) return new ArenaAdminError('not_found', 'not_found');
  if (body.error === 'questions_incomplete') {
    return new ArenaAdminError(
      'questions_incomplete',
      `${num(body.authored, 0)} / ${num(body.required, 0)}`,
    );
  }
  if (body.error === 'no_standings') return new ArenaAdminError('no_standings', 'no_standings');
  /*
   * `final` refused because the podium is not settled. The BLOCKERS are the
   * whole message — "finalisation refused" tells a host nothing they can act
   * on, the same reasoning `questions_incomplete` above is written for. They
   * ride on the error so the console can list them without a second call.
   */
  if (body.error === 'verification_incomplete') {
    const blockers = Array.isArray(body.blockers) ? body.blockers as FinalBlocker[] : [];
    const err = new ArenaAdminError(
      'verification_incomplete',
      blockers.map((b) => `${b.rank}:${b.why}`).join(', ') || 'unresolved',
    );
    err.blockers = blockers;
    return err;
  }
  if (body.error === 'reason_required') return new ArenaAdminError('reason_required', 'reason_required');
  if (body.error === 'already_exists') return new ArenaAdminError('already_exists', 'already_exists');
  if (body.error === 'illegal_transition') {
    return new ArenaAdminError('illegal_transition', `${str(body.from, '?')}->${str(body.to, '?')}`);
  }
  if (res.status === 400) {
    return new ArenaAdminError('invalid_question', str(body.error, 'invalid'), str(body.field));
  }
  return new ArenaAdminError('server_error', str(body.error, `http_${res.status}`));
}

// ── Prize claims ────────────────────────────────────────────────────────────

export interface AdminClaim {
  uid: string;
  rank: number;
  finishRank: number | null;
  prizeCents: number;
  state: 'open' | 'claimed' | 'verified' | 'rejected' | 'expired';
  contact: string | null;
  isMinor: boolean | null;
  guardian: { name: string; contact: string; relationship: string | null } | null;
  claimedAt: number;
  expiresAt: number;
  /** A signed parental authorisation is on file. The bytes are NEVER here. */
  hasConsent: boolean;
  consentUploadedAt: number;
  consentEmailSent: boolean | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  rolledDownFrom: number | null;
}

/**
 * Watch the claim queue.
 *
 * Read straight from Firestore, not through an endpoint: `firestore.rules`
 * already allows an admin to read `tournaments/{tid}/claims/**`, and a review
 * queue that has to be refreshed by hand is a queue where somebody misses the
 * moment a family finishes uploading at 22:40 on the third day.
 *
 * The consent FILE is not in here and cannot be: `storage.rules` denies every
 * client read of the bucket. This carries only the fact that one exists; the
 * bytes come from `/api/arena/consent`, one signed URL at a time.
 */
export function watchClaims(
  tid: string,
  onClaims: (claims: AdminClaim[]) => void,
  onError?: (e: Error) => void,
): () => void {
  return onSnapshot(
    collection(db, 'tournaments', tid, 'claims'),
    (snap) => {
      const rows: AdminClaim[] = snap.docs.map((d) => {
        const v = d.data() as Row;
        const consent = (v.consent ?? null) as Row | null;
        const email = (v.consentEmail ?? null) as Row | null;
        return {
          uid: d.id,
          rank: num(v.rank),
          finishRank: typeof v.finishRank === 'number' ? v.finishRank : null,
          prizeCents: num(v.prizeCents),
          state: (str(v.state, 'open')) as AdminClaim['state'],
          contact: str(v.contact) || null,
          isMinor: typeof v.isMinor === 'boolean' ? v.isMinor : null,
          guardian: v.guardian && typeof v.guardian === 'object' ? {
            name: str((v.guardian as Row).name),
            contact: str((v.guardian as Row).contact),
            relationship: str((v.guardian as Row).relationship) || null,
          } : null,
          claimedAt: millis(v.claimedAt),
          expiresAt: millis(v.expiresAt),
          hasConsent: !!consent && typeof consent.path === 'string',
          consentUploadedAt: millis(consent?.uploadedAt),
          consentEmailSent: email ? email.sent === true : null,
          reviewedBy: str(v.reviewedBy) || null,
          reviewNote: str(v.reviewNote) || null,
          rolledDownFrom: typeof v.rolledDownFrom === 'number' ? v.rolledDownFrom : null,
        };
      });
      rows.sort((a, b) => a.rank - b.rank || a.uid.localeCompare(b.uid));
      onClaims(rows);
    },
    (e) => onError?.(e as Error),
  );
}

/** Verify or reject one claim. A rejection rolls the prize down immediately. */
export async function reviewClaim(
  tid: string,
  uid: string,
  decision: 'verified' | 'rejected',
  note?: string,
): Promise<void> {
  const res = await authedFetch('/api/arena/claim', {
    action: 'review', tournamentId: tid, uid, decision, note: note || '',
  });
  if (!res.ok) throw stateError(res, await readError(res));
}

/**
 * A short-lived link to one signed consent form.
 *
 * Fetched per view rather than listed with the queue, on purpose. These are
 * documents about children, and a queue that pre-signs every one of them hands
 * out a page full of live links to a document nobody has opened. One click,
 * one link, fifteen minutes.
 */
export async function fetchConsentUrl(tid: string, uid: string): Promise<string> {
  const res = await authedGet(
    `/api/arena/consent?tid=${encodeURIComponent(tid)}&uid=${encodeURIComponent(uid)}`,
  );
  if (!res.ok) throw stateError(res, await readError(res));
  const body = await res.json() as { url?: string };
  if (!body.url) throw new ArenaAdminError('not_found', 'no_consent_on_file');
  return body.url;
}

/** GET with the admin's ID token. `authedFetch` is POST-only, so this is the
 *  same header assembly against a GET. */
async function authedGet(url: string): Promise<Response> {
  const token = await getIdToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(url, { method: 'GET', headers });
}

// ── Integrity review ────────────────────────────────────────────────────────

/**
 * A blocker in the host's own words.
 *
 * Bilingual here rather than in the endpoint, for the same reason every other
 * refusal in this service is: the server names WHAT is wrong in a stable code
 * the tests can assert on, and the console decides how to say it to a person
 * at 22:40. `rank` leads every line because that is what the host is looking
 * at on the podium.
 */
export function blockerLines(blockers: readonly FinalBlocker[], lang: 'fr' | 'ht'): string[] {
  const copy: Record<FinalBlocker['why'], [string, string]> = {
    tie_unresolved: ['égalité non tranchée', 'egalite ki pa tranche'],
    claim_unresolved: ['réclamation non vérifiée', 'reklamasyon ki pa verifye'],
    prize_unassigned: ['prix sans titulaire', 'pri san mèt'],
    unreviewed_flags: ['signalements non examinés', 'siyal ki pa egzamine'],
    disqualified_holder: ['disqualifié qui détient encore le prix', 'moun diskalifye ki gen pri a toujou'],
  };
  return blockers.map((b) => {
    const [fr, ht] = copy[b.why] ?? [b.why, b.why];
    const who = b.uids.length > 0 ? ` (${b.uids.length})` : '';
    return lang === 'fr' ? `rang ${b.rank} : ${fr}${who}` : `ran ${b.rank} : ${ht}${who}`;
  });
}

/**
 * One row of the review queue, as `/api/arena/review` returns it.
 *
 * Fetched through the endpoint rather than watched in Firestore, unlike the
 * claim queue above. It has to be: `players/**`, `answers/**` and `reviews/**`
 * are all server-only, including for an admin's browser, because a player's
 * own score leaks the answer key mid-question. One logged door, not a rule
 * that hands whole collections to every admin tab at once.
 */
export interface ReviewRow {
  uid: string;
  displayName: string;
  schoolShort: string;
  rank: number | null;
  score: number;
  eligible: boolean;
  flags: string[];
  summary: FlagSummary;
  decision: ReviewDecision | null;
  note: string | null;
  reviewedBy: string | null;
  reviewedAt: number | null;
  claimState: string | null;
  claimRank: number | null;
}

export interface ReviewQueue {
  state: ArenaState;
  rows: ReviewRow[];
  /** Why `final` would be refused right now. Empty means it would go through. */
  blockers: FinalBlocker[];
}

export async function fetchReviewQueue(tid: string): Promise<ReviewQueue> {
  const res = await authedGet(`/api/arena/review?tournamentId=${encodeURIComponent(tid)}&action=queue`);
  if (!res.ok) throw stateError(res, await readError(res));
  const body = await res.json() as Partial<ReviewQueue>;
  return {
    state: (body.state ?? 'draft') as ArenaState,
    rows: Array.isArray(body.rows) ? body.rows : [],
    blockers: Array.isArray(body.blockers) ? body.blockers : [],
  };
}

/** One answer of one player, as the evidence view shows it. */
export interface EvidenceAnswer {
  index: number;
  choice: number;
  correct: boolean;
  late: boolean;
  early: boolean;
  impossible: boolean;
  tier: string;
  points: number;
  elapsedMs: number;
  clientShownAt: number | null;
  clampedShownAt: number;
  serverReceivedAt: number;
  focusLosses: number;
  flags: string[];
  appVersion: string | null;
  deviceHash: string | null;
  attestation: 'valid' | 'invalid' | 'absent';
}

export interface Evidence {
  uid: string;
  displayName: string;
  schoolShort: string;
  score: number;
  eligible: boolean;
  flags: string[];
  summary: FlagSummary;
  answers: EvidenceAnswer[];
}

/**
 * One player's answers, with both ends of every timing span.
 *
 * Refused by the endpoint before `grading`, because every answer document
 * carries `correct` and an admin door onto that field mid-tournament is the
 * key-disclosure hole with a nicer login. The console does not pre-fetch these
 * for the queue: it is evidence about a child, and a page that loads all of it
 * to render a list has read every file nobody opened.
 */
export async function fetchEvidence(tid: string, uid: string): Promise<Evidence> {
  const res = await authedGet(
    `/api/arena/review?tournamentId=${encodeURIComponent(tid)}&action=evidence&uid=${encodeURIComponent(uid)}`,
  );
  if (!res.ok) throw stateError(res, await readError(res));
  return await res.json() as Evidence;
}

export interface VerdictResult {
  uid: string;
  decision: ReviewDecision;
  eligible: boolean;
  board: 'aggregated' | 'deferred_to_final';
  /** True when a reinstated player's prize had already moved on. */
  rolledDownAway: boolean;
}

/**
 * Record a verdict. A disqualification needs a reason; clearing does not.
 *
 * The asymmetry is the endpoint's, enforced there — this only avoids sending a
 * request that will be refused.
 */
export async function decideReview(
  tid: string,
  uid: string,
  decision: ReviewDecision,
  note: string,
): Promise<VerdictResult> {
  if (decision === 'disqualified' && note.trim().length < 4) {
    throw new ArenaAdminError('reason_required', 'note_required');
  }
  const res = await authedFetch('/api/arena/review', {
    action: 'decide', tournamentId: tid, uid, decision, note: note.trim(),
  });
  if (!res.ok) throw stateError(res, await readError(res));
  return await res.json() as VerdictResult;
}

/** The question table: every authored row, none of their answer keys. */
export async function listQuestions(tid: string): Promise<ArenaQuestionRow[]> {
  const res = await authedGet(`/api/arena/questions?tid=${encodeURIComponent(tid)}`);
  if (!res.ok) throw questionsError(res, await readError(res));
  const body = await res.json() as { questions?: Row[] };
  return (body.questions || []).map((q) => ({
    index: num(q.index, 0),
    prompt: str(q.prompt),
    promptHt: str(q.promptHt),
    options: strings(q.options),
    optionsHt: strings(q.optionsHt),
    explanation: str(q.explanation),
    category: str(q.category),
    difficulty: num(q.difficulty, 3),
    authored: q.authored === true,
  }));
}

/** One question WITH its key. Called only when an editor is opened. */
export async function getQuestion(tid: string, index: number): Promise<ArenaQuestionDraft | null> {
  const res = await authedGet(`/api/arena/questions?tid=${encodeURIComponent(tid)}&index=${index}`);
  if (res.status === 404) return null;
  if (!res.ok) throw questionsError(res, await readError(res));
  const body = await res.json() as { question?: Row };
  const q = body.question || {};
  return {
    index: num(q.index, index),
    prompt: str(q.prompt),
    promptHt: str(q.promptHt),
    options: strings(q.options),
    optionsHt: strings(q.optionsHt),
    answerIndex: num(q.answerIndex, -1),
    explanation: str(q.explanation),
    category: str(q.category),
    difficulty: num(q.difficulty, 3),
  };
}

/**
 * Create or update one question.
 *
 * The client validator below runs first so an author gets instant feedback, but
 * the endpoint's answer is the authority and its refusals are surfaced
 * verbatim — a client check that disagrees with the server is a client check
 * that lets someone save something that silently did not save.
 */
export async function saveQuestion(tid: string, question: ArenaQuestionDraft): Promise<number> {
  const res = await authedFetch('/api/arena/questions', { tid, question });
  if (!res.ok) throw questionsError(res, await readError(res));
  const body = await res.json() as { index?: number };
  return num(body.index, question.index);
}

/**
 * A tournament id, as `isValidTournamentId` on the server defines it.
 *
 * Duplicated rather than imported because `api/arena/_shared.ts` pulls in
 * `firebase-admin` and the Vercel types, neither of which belongs in a browser
 * bundle. The regex is the contract; if it drifts, the server refuses and the
 * form says so rather than the browser silently accepting something the
 * endpoint will not.
 */
export function isValidTournamentSlug(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value);
}

export interface TournamentDraftIssue { field: string; message: string }

/**
 * The creation form's client-side check.
 *
 * Instant feedback only — `validateCreate` on the server is the authority and
 * its refusals are surfaced verbatim. The one rule worth stating twice is
 * `minPlayers >= teamSize`: `rankSchools` reads qualification off the pool it
 * is handed, so a tournament that scores five but only needs three present
 * would report a school as qualified on a pool that cannot fill its own
 * counting five — and that is discovered on a stream, not in review.
 */
export function validateTournamentDraft(
  d: Partial<NewTournamentInput>,
  isCreole: boolean,
): TournamentDraftIssue[] {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const issues: TournamentDraftIssue[] = [];

  if (!d.tournamentId || !isValidTournamentSlug(d.tournamentId)) {
    issues.push({
      field: 'tournamentId',
      message: t(
        'Identifiant : lettres, chiffres, tiret ou souligné, 64 caractères max.',
        'Idantifyan : lèt, chif, tirè oswa souliyen, 64 karaktè maksimòm.',
      ),
    });
  }
  if (!d.title || d.title.trim().length < 3) {
    issues.push({ field: 'title', message: t('Le titre est trop court.', 'Tit la twò kout.') });
  }
  if (!d.startsAt || !Number.isFinite(d.startsAt) || d.startsAt <= 0) {
    issues.push({ field: 'startsAt', message: t('Date de début manquante.', 'Dat kòmansman an manke.') });
  }
  if (d.doorsAt && d.startsAt && d.doorsAt > d.startsAt) {
    issues.push({
      field: 'doorsAt',
      message: t(
        'Les portes ne peuvent pas ouvrir après la première question.',
        'Pòt yo pa ka louvri apre premye kesyon an.',
      ),
    });
  }
  const teamSize = d.teamSize ?? 5;
  const minPlayers = d.minPlayers ?? 5;
  if (minPlayers < teamSize) {
    issues.push({
      field: 'minPlayers',
      message: t(
        `Il faut au moins ${teamSize} joueurs présents — c’est le nombre qui compte pour l’école.`,
        `Fòk gen omwen ${teamSize} jwè prezan — se kantite ki konte pou lekòl la.`,
      ),
    });
  }
  if ((d.questionCount ?? 25) < 1) {
    issues.push({ field: 'questionCount', message: t('Au moins une question.', 'Omwen yon kesyon.') });
  }
  return issues;
}

/** What `POST /api/arena/state` needs to mint a `draft` tournament. */
export interface NewTournamentInput {
  tournamentId: string;
  title: string;
  titleHt?: string;
  /** Epoch ms. `doorsAt` defaults to ten minutes earlier, server-side. */
  startsAt: number;
  doorsAt?: number;
  questionCount?: number;
  teamSize?: number;
  minPlayers?: number;
  /** Cents USD, biggest first. Defaults to $100 / $50 / $25. */
  prizes?: number[];
}

/**
 * Create a tournament.
 *
 * Server-side, because `firestore.rules` denies every client write under
 * `tournaments/**` — the document that decides prize money is not one a browser
 * session may mint. `POST /api/arena/state` with `action: 'create'` is the door.
 */
export async function createTournament(input: NewTournamentInput): Promise<string> {
  const res = await authedFetch('/api/arena/state', {
    action: 'create',
    tournamentId: input.tournamentId,
    title: input.title,
    titleHt: input.titleHt,
    startsAt: input.startsAt,
    doorsAt: input.doorsAt,
    questionCount: input.questionCount,
    teamSize: input.teamSize,
    minPlayers: input.minPlayers,
    prizes: input.prizes,
  });
  if (!res.ok) throw stateError(res, await readError(res));
  return input.tournamentId;
}

/**
 * Move the tournament from one state to another.
 *
 * `canTransition` is checked here so an illegal request never leaves the
 * browser, and again inside the server's transaction so that two admins sharing
 * one console produce one transition and one 409 rather than two.
 *
 * A `void` carries its reason into the document: it is the one move that erases
 * an event students were told was happening, and "we cancelled it" is not an
 * argument anyone wins later without a written why.
 */
export async function requestTransition(
  tid: string,
  from: ArenaState,
  to: ArenaState,
  reason?: string,
  override?: boolean,
): Promise<void> {
  if (!canTransition(from, to)) {
    throw new ArenaAdminError('illegal_transition', `illegal_transition:${from}->${to}`);
  }
  const res = await authedFetch('/api/arena/state', {
    tournamentId: tid,
    to,
    reason: to === 'void'
      ? (reason || 'Annulé depuis la console d’administration')
      : reason,
    // Only ever sent for `final`, and only with a reason the host typed. The
    // endpoint refuses an override without one; this never supplies a default,
    // because a default reason is a reason nobody wrote.
    ...(override && to === 'final' ? { override: true } : {}),
  });
  if (!res.ok) throw stateError(res, await readError(res));
}

export interface AdvanceResult {
  action: 'waiting' | 'opened' | 'closed' | 'finished' | 'noop';
  index?: number;
  state?: ArenaState;
  pauseMs?: number;
}

/**
 * The safety override: close the open question, or open the next one.
 *
 * ONE transition per call — `force` lifts the two TIMER gates (the question's
 * own window, and the pause between questions) and nothing else, so a host
 * pressing this on an open question closes it and pressing again opens the
 * following one. That is `planAdvance`'s contract, not a UI choice.
 *
 * `advance` takes two doors (`authorizeCronOrAdmin`): the scheduler presents
 * `CRON_SECRET`, and this console presents the admin's Firebase ID token. The
 * secret is never shipped to a browser — a browser holding it hands the whole
 * engine to whoever reads localStorage.
 */
export async function postAdvance(tid: string, force = false): Promise<AdvanceResult> {
  const res = await authedFetch('/api/arena/advance', { tid, force });
  if (!res.ok) throw stateError(res, await readError(res));
  return await res.json() as AdvanceResult;
}

export interface AggregateResult {
  ok: boolean;
  state?: ArenaState;
  schools?: number;
  players?: number;
  events?: number;
  seq?: number;
}

/**
 * Recompute the standings now.
 *
 * `advance` calls this itself when it closes a question, and a once-a-minute
 * cron is the safety net; this control is for the night the board visibly
 * freezes and the host needs it moving before the next question. Same two
 * doors as `advance`: cron secret, or a signed-in admin.
 */
export async function postAggregate(tid: string): Promise<AggregateResult> {
  const res = await authedFetch('/api/arena/aggregate', { tid });
  if (!res.ok) throw stateError(res, await readError(res));
  return await res.json() as AggregateResult;
}

export interface RosterFreezeResult {
  action: 'frozen' | 'already_frozen';
  schools: number;
  qualifiedSchools: number;
  playersRegistered: number;
  playersPresent: number;
  minPlayers: number;
}

/**
 * Freeze the qualification roster at doors close.
 *
 * Decision 3 (2026-09-18): a registered no-show does not count toward a
 * school's five — qualification is measured at doors close, on players
 * PRESENT. `/api/arena/doors-close` is what turns that from a derivation the
 * aggregator cannot express into a stored fact with a timestamp on it, and it
 * has to happen while the tournament is still `doors`, before anyone presses
 * start.
 *
 * It is also the ONE control on this console that works today: unlike
 * `advance` and `aggregate`, this endpoint accepts a signed-in admin
 * (`users/{uid}.role === 'admin'`) alongside `CRON_SECRET`, explicitly for the
 * run console's manual trigger.
 */
export async function freezeRoster(tid: string): Promise<RosterFreezeResult> {
  const res = await authedFetch('/api/arena/doors-close', { tournamentId: tid });
  if (!res.ok) {
    const body = await readError(res);
    if (res.status === 403) throw new ArenaAdminError('unauthorized', body.error || 'not_admin');
    if (res.status === 401) throw new ArenaAdminError('unauthorized', 'unauthenticated');
    if (res.status === 404) throw new ArenaAdminError('not_found', 'tournament_not_found');
    if (res.status === 429) throw new ArenaAdminError('rate_limited', 'rate_limit_exceeded');
    throw new ArenaAdminError('server_error', body.error || `http_${res.status}`);
  }
  return await res.json() as RosterFreezeResult;
}

// ── Pure logic (unit-tested in src/utils/__tests__/arenaAdmin.test.ts) ───────

/** Exactly four. Not "at least two" like the everyday trivia bank — a
 *  tournament question is delivered to a fixed four-button screen. */
export const OPTION_COUNT = 4;

/**
 * Where the prompt-length warning fires.
 *
 * A question gets a 20s window and a phone screen. Past roughly this many
 * characters a student is still reading when the full-points tier (12s) has
 * already passed — the question stops measuring what they know and starts
 * measuring how fast they read. It is a WARNING and never a block: the server
 * truncates at 240 rather than refusing, so blocking here would stop a save the
 * server would happily have accepted.
 */
export const PROMPT_WARN_CHARS = 140;

/** The server's hard ceiling — past this the prompt is silently truncated. */
export const PROMPT_TRUNCATE_CHARS = 240;

export type QuestionIssueCode =
  | 'prompt_empty'
  | 'prompt_short'
  | 'option_count'
  | 'option_empty'
  | 'answer_out_of_range'
  | 'options_ht_partial'
  | 'index_invalid'
  | 'prompt_long'
  | 'prompt_truncated'
  | 'prompt_ht_missing';

export interface QuestionIssue {
  code: QuestionIssueCode;
  /** The 0-based option this issue is about, when it is about one. */
  option?: number;
}

export interface QuestionValidation {
  ok: boolean;
  errors: QuestionIssue[];
  warnings: QuestionIssue[];
}

/**
 * Validate a draft before it is sent.
 *
 * Mirrors `validateQuestion` in `api/arena/questions.ts` — which is the
 * authority — so that the author finds out about a broken option while their
 * cursor is still in it, rather than after a round trip. The one deliberate
 * difference is prompt length: the server truncates, so this only ever warns.
 */
export function validateQuestionDraft(draft: Partial<ArenaQuestionDraft>): QuestionValidation {
  const errors: QuestionIssue[] = [];
  const warnings: QuestionIssue[] = [];

  const index = Number(draft?.index);
  if (!Number.isInteger(index) || index < 0 || index > 200) {
    errors.push({ code: 'index_invalid' });
  }

  const prompt = (draft?.prompt || '').trim();
  if (!prompt) errors.push({ code: 'prompt_empty' });
  else if (prompt.length < 8) errors.push({ code: 'prompt_short' });
  else if (prompt.length > PROMPT_TRUNCATE_CHARS) warnings.push({ code: 'prompt_truncated' });
  else if (prompt.length > PROMPT_WARN_CHARS) warnings.push({ code: 'prompt_long' });

  const options = Array.isArray(draft?.options) ? draft.options : [];
  if (options.length !== OPTION_COUNT) {
    errors.push({ code: 'option_count' });
  }
  options.forEach((o, i) => {
    if (!(o || '').trim()) errors.push({ code: 'option_empty', option: i });
  });

  const answerIndex = Number(draft?.answerIndex);
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= OPTION_COUNT) {
    errors.push({ code: 'answer_out_of_range' });
  }

  // Kreyòl is all-four-or-none. A half-translated set is worse than an
  // untranslated one: a student reading in Kreyòl gets some options in French
  // and cannot tell whether that is the question or a bug.
  const optionsHt = (Array.isArray(draft?.optionsHt) ? draft.optionsHt : [])
    .map((o) => (o || '').trim());
  const filledHt = optionsHt.filter((o) => o.length > 0).length;
  if (filledHt > 0 && filledHt !== OPTION_COUNT) {
    errors.push({ code: 'options_ht_partial' });
  }
  if (filledHt === OPTION_COUNT && !(draft?.promptHt || '').trim()) {
    warnings.push({ code: 'prompt_ht_missing' });
  }

  return { ok: errors.length === 0, errors, warnings };
}

export interface AuthoringProgress {
  authored: number;
  total: number;
  remaining: number;
  /** 0–100, and 0 when the tournament has not said how many it wants. */
  percent: number;
  complete: boolean;
  /** More rows exist than `questionCount` — a mismatch worth showing. */
  over: boolean;
}

/**
 * How much of the monthly authoring bill is paid.
 *
 * 25 questions a month is the recurring operational cost of this format, so
 * the remaining count is the number the tool exists to keep in front of
 * whoever has to write them.
 */
export function authoringProgress(
  rows: Array<{ authored?: boolean }> | number,
  questionCount: number,
): AuthoringProgress {
  const authored = typeof rows === 'number'
    ? Math.max(0, Math.round(rows))
    : rows.filter((r) => r?.authored === true).length;
  const total = Math.max(0, Math.round(Number(questionCount) || 0));
  const remaining = Math.max(0, total - authored);
  return {
    authored,
    total,
    remaining,
    percent: total > 0 ? Math.min(100, Math.round((authored / total) * 100)) : 0,
    complete: total > 0 && authored >= total,
    over: total > 0 && authored > total,
  };
}

// ── The run console's controls ──────────────────────────────────────────────

export type ArenaControl =
  | 'openRegistration'
  | 'openDoors'
  | 'start'
  | 'freezeRoster'
  | 'forceClose'
  | 'forceNext'
  | 'publishProvisional'
  | 'finalise'
  | 'void';

/**
 * The state each control is asking for, or `null` for the two that are not
 * state transitions at all — they drive the question clock inside `live`.
 */
export const CONTROL_TARGET: Record<ArenaControl, ArenaState | null> = {
  openRegistration: 'registration',
  openDoors: 'doors',
  start: 'live',
  freezeRoster: null,
  forceClose: null,
  forceNext: null,
  publishProvisional: 'provisional',
  finalise: 'final',
  void: 'void',
};

/** Which door a control knocks on. Decides which auth story applies to it. */
export const CONTROL_ENDPOINT: Record<ArenaControl, 'transition' | 'advance' | 'doorsClose'> = {
  openRegistration: 'transition',
  openDoors: 'transition',
  start: 'transition',
  freezeRoster: 'doorsClose',
  forceClose: 'advance',
  forceNext: 'advance',
  publishProvisional: 'transition',
  finalise: 'transition',
  void: 'transition',
};

export type ControlReason =
  | 'illegal_transition'
  | 'not_doors'
  | 'not_live'
  | 'no_open_question'
  | 'question_still_open'
  | 'live_document_missing'
  | 'all_questions_delivered';

export interface ControlContext {
  state: ArenaState;
  /** Index of the question the tournament is on; -1 before the first. */
  index: number;
  /** `live/{index}.state`, or null when that document does not exist. */
  liveState: 'pending' | 'open' | 'closed' | null;
  questionCount: number;
}

export interface ControlPermission {
  allowed: boolean;
  reason: ControlReason | null;
  target: ArenaState | null;
}

/**
 * May this control be pressed right now?
 *
 * Every state-changing control is answered by `canTransition`, the same
 * function the API route and the player client use, so the console cannot offer
 * a move the rest of the product disagrees with — and cannot hide one it
 * agrees with either. A control that is wrong for the moment is DISABLED WITH
 * ITS REASON rather than removed: a host needs to know a control exists
 * before the minute they need it, and a button that appears out of nowhere at
 * 18:41 is a button nobody has ever pressed.
 *
 * The two clock controls are not transitions and are not run through
 * `canTransition` for that reason — they are gated on what `planAdvance` will
 * actually do with them, which is decided by the live document, not by the
 * state machine. Their one real transition (`live → grading`, when the last
 * question closes) is `canTransition`-guarded inside the endpoint.
 */
export function controlPermission(control: ArenaControl, ctx: ControlContext): ControlPermission {
  const target = CONTROL_TARGET[control];

  if (target !== null) {
    return {
      allowed: canTransition(ctx.state, target),
      reason: canTransition(ctx.state, target) ? null : 'illegal_transition',
      target,
    };
  }

  // Freezing the roster is not a transition either: it writes the
  // qualification verdict while the tournament is STILL `doors`, which is the
  // only moment the answer is measurable. Once `start` has been pressed the
  // board is already ranking on a roster and re-freezing it is indefensible —
  // the endpoint refuses, and so does the control.
  if (control === 'freezeRoster') {
    return ctx.state === 'doors'
      ? { allowed: true, reason: null, target: null }
      : { allowed: false, reason: 'not_doors', target: null };
  }

  // ── forceClose / forceNext ────────────────────────────────────────────────
  if (ctx.state !== 'live') {
    return { allowed: false, reason: 'not_live', target: null };
  }

  const started = ctx.index >= 0;

  // `currentQuestion` pointing at a delivery document that does not exist is
  // corruption, not a state. `planAdvance` refuses it and so does the console:
  // guessing costs either a skipped question or a reopened one whose answers
  // are already tiered against the old window.
  if (started && ctx.liveState === null) {
    return { allowed: false, reason: 'live_document_missing', target: null };
  }

  const open = started && (ctx.liveState === 'open' || ctx.liveState === 'pending');

  if (control === 'forceClose') {
    return open
      ? { allowed: true, reason: null, target: null }
      : { allowed: false, reason: 'no_open_question', target: null };
  }

  // forceNext
  if (open) return { allowed: false, reason: 'question_still_open', target: null };
  if (started && ctx.index >= ctx.questionCount - 1) {
    // The last question has closed: the next press finishes the tournament
    // rather than opening anything, and `advance` routes that through
    // `canTransition(live, grading)` itself.
    return { allowed: true, reason: null, target: null };
  }
  if (!started && ctx.questionCount <= 0) {
    return { allowed: false, reason: 'all_questions_delivered', target: null };
  }
  return { allowed: true, reason: null, target: null };
}

export type BeatKind = 'closes' | 'opens' | 'grading' | 'idle';

export interface NextBeat {
  kind: BeatKind;
  /** Milliseconds until it happens; 0 once it is due. */
  inMs: number;
}

/**
 * What happens next, and when.
 *
 * The console's single most important line: a host who cannot see whether the
 * window closes in four seconds or the next question opens in nine is a host
 * talking over a question. Derived from the delivery document rather than from
 * the tournament document because the delivery document is what the players
 * actually read — if the two disagree, what was shown wins.
 */
export function nextBeat(
  ctx: { state: ArenaState; index: number; questionCount: number },
  live: { state: 'pending' | 'open' | 'closed'; closesAt: number; closedAt: number } | null,
  pauseMs: number,
  now: number,
): NextBeat {
  if (ctx.state !== 'live' || !live) return { kind: 'idle', inMs: 0 };
  if (live.state === 'open' || live.state === 'pending') {
    return { kind: 'closes', inMs: Math.max(0, live.closesAt - now) };
  }
  if (ctx.index >= ctx.questionCount - 1) return { kind: 'grading', inMs: 0 };
  return { kind: 'opens', inMs: Math.max(0, live.closedAt + pauseMs - now) };
}

// ── Where a school is ───────────────────────────────────────────────────────

/**
 * One school, as the location editor sees it.
 *
 * `commune` is the whole point and it is nullable. The 94 seeded schools ship
 * with no location at all — `shared/data/schools-seed.json` deliberately
 * carries none, because the version that did inferred it from applicants' home
 * addresses and split one real school into two. So "unknown" is the normal
 * state here, not a loading artefact, and the editor shows it as a count
 * rather than as a blank column nobody reads.
 */
export interface AdminSchoolRow {
  key: string;
  name: string;
  shortName: string | null;
  /** Stated by a person, or null. Never derived from where students live. */
  commune: string | null;
  /** Number of ESLP applicants who named it — the seed's ordering. */
  applicants: number;
  /** Whether a Firestore document exists yet (the seed alone means no). */
  stored: boolean;
}

/**
 * The full school list: the bundled seed, plus everything students have added.
 *
 * Read straight from Firestore rather than through an endpoint, because
 * `firestore.rules` already lets any signed-in client read `schools/{id}` —
 * only the WRITE needs a server. The seed is merged in client-side exactly as
 * `mobile/src/services/schoolService.ts` merges it, so an admin sees the same
 * 94 schools the student's picker offers rather than only the handful that
 * happen to have documents.
 */
export async function listSchoolsForLocation(): Promise<AdminSchoolRow[]> {
  const seeded: AdminSchoolRow[] = (seedDoc.schools as Row[]).map((s) => ({
    key: schoolKey(str(s.name)),
    name: str(s.name),
    shortName: str(s.shortName) || null,
    commune: null,
    applicants: num(s.applicants, 0),
    stored: false,
  }));

  const byKey = new Map<string, AdminSchoolRow>();
  for (const row of seeded) if (row.key) byKey.set(row.key, row);

  try {
    const snap = await getDocs(collection(db, 'schools'));
    for (const d of snap.docs) {
      const v = d.data() as Row;
      const key = str(v.key) || schoolKey(str(v.name));
      if (!key) continue;
      const seed = byKey.get(key);
      byKey.set(key, {
        key,
        // The seed's name wins for a seeded school: it is the spelling the
        // picker shows and the standings group by.
        name: seed?.name || str(v.name) || key,
        shortName: str(v.shortName) || seed?.shortName || null,
        commune: str(v.commune) || null,
        applicants: seed?.applicants ?? num(v.applicants, 0),
        stored: true,
      });
    }
  } catch (e) {
    // The seed alone is still a usable editor — and an admin who can see the
    // list can at least see WHICH schools have no location, which is the
    // number this screen exists to move.
    console.warn('[arena] school list read failed, showing the seed only:', e);
  }

  return [...byKey.values()].sort(
    (a, b) => b.applicants - a.applicants || a.name.localeCompare(b.name),
  );
}

/**
 * State — or clear — where one school is.
 *
 * `commune` must be a commune from `src/data/haitiGeo.ts`; the endpoint refuses
 * anything else, because the broadcast map joins a school's commune against the
 * villes students picked from that same list and a free-typed spelling is a
 * school that silently never appears. `null` clears the location, which an
 * admin who realises they guessed must be able to do.
 *
 * `name` is sent so the endpoint can create the document for a seeded school,
 * which has none until the first time anybody says anything about it.
 */
export async function setSchoolCommune(
  key: string,
  commune: string | null,
  name: string,
): Promise<void> {
  const res = await authedFetch('/api/arena/school-location', { key, commune, name });
  if (!res.ok) throw stateError(res, await readError(res));
}
