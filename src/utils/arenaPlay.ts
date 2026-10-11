/**
 * arenaPlay — the pure half of playing the Arena on the web.
 *
 * Everything here is framework-free and Firestore-free so it can be tested
 * without a renderer or a network: the document readers, which screen a
 * student should be on, what the clock is worth, and what to tell them about
 * their tap. The hooks (src/hooks/useArenaPlay.ts) and the page
 * (src/pages/ArenaPlay.tsx) only wire these to live data.
 *
 * It mirrors the mobile client deliberately — mobile/src/services/arenaService.ts
 * (readers, tierRing, qualificationState) and
 * mobile/src/utils/arenaAnswerReceipt.ts (classifyAnswerResult). `src/` cannot
 * import from `mobile/` (React Native), so the logic is restated here and the
 * tests in src/utils/__tests__/arenaPlay.test.ts pin it to the same behaviour.
 *
 * What a client may read is narrow and that shapes the types: the tournament,
 * the live question (`live/{index}`, which never carries the key until the
 * question is closed), the public standings, and the student's own
 * registration. Never `players/{uid}` — that row is server-only, even for its
 * owner, because a score that moves the instant an answer lands tells a group
 * of friends which option was right while the question is still open.
 */

import type { ArenaState } from '../../shared/arena/state';
import { TIER_FULL_MS, TIER_HALF_MS, RENDER_GRACE_MS, type AnswerTier } from '../../shared/arena/scoring';

// ── Shapes ──────────────────────────────────────────────────────────────────

export interface ArenaTournament {
  id: string;
  title: string;
  titleHt: string;
  state: ArenaState;
  startsAt: number;
  doorsAt: number;
  questionCount: number;
  teamSize: number;
  minPlayers: number;
  /** Prize pool in cents USD, biggest first. */
  prizes: number[];
  currentQuestion: { index: number; opensAt: number; closesAt: number } | null;
  /** Public room counts — written at doors close, zero before it. */
  counts: { schools: number; players: number; qualifiedSchools: number };
  /** A rehearsal edition — hidden from the public pickers. */
  isTest: boolean;
}

export interface ArenaLiveQuestion {
  index: number;
  prompt: string;
  promptHt: string;
  options: string[];
  optionsHt: string[];
  opensAt: number;
  closesAt: number;
  state: 'pending' | 'open' | 'closed';
  /** The key, ONLY once the question is closed. Null otherwise, always. */
  answerIndex: number | null;
  category: string;
}

export interface ArenaRegistration {
  uid: string;
  schoolKey: string;
  grade: string;
  eligible: boolean;
}

export interface ArenaSchoolStanding {
  key: string;
  label: string;
  shortName: string;
  teamAvg: number;
  members: number;
  qualified: boolean;
  needed: number;
  /** 1-based among qualified schools; 0 when the school cannot compete. */
  rank: number;
  top5: string[];
}

export interface ArenaIndividualStanding {
  uid: string;
  schoolKey: string;
  score: number;
  correct: number;
  avgMs: number;
  rank: number;
  streak: number;
}

export interface ArenaStandings {
  schools: ArenaSchoolStanding[];
  individuals: ArenaIndividualStanding[];
}

/** What the register and presence endpoints report about a school. */
export interface ArenaSchoolCounts {
  registered: number;
  present: number;
  needed: number;
  qualified: boolean;
}

// ── Readers ─────────────────────────────────────────────────────────────────

/** Firestore Timestamp | epoch ms | {seconds} → epoch ms, 0 when unusable. */
export function millis(v: any): number {
  if (!v) return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v.toMillis === 'function') {
    const n = v.toMillis();
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return 0;
}

const str = (v: any, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: any, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const strings = (v: any): string[] => (Array.isArray(v) ? v.filter((s: any) => typeof s === 'string') : []);

const STATES: ArenaState[] = ['draft', 'registration', 'doors', 'live', 'grading', 'provisional', 'final', 'void'];

/** The same test useOpenArena applies: a flag, or the word in the title. */
export function isTestEdition(d: any): boolean {
  if (d?.isTest === true || d?.testMode === true) return true;
  return /\b(test|demo|démo)\b/i.test(str(d?.title));
}

export function toTournament(id: string, d: any): ArenaTournament {
  const cq = d?.currentQuestion;
  // `countsPublic` is what doors-close writes; `counts` is the zeroed block the
  // creation route writes. Read the live one first.
  const counts = d?.countsPublic || d?.counts || {};
  return {
    id,
    title: str(d?.title, id),
    titleHt: str(d?.titleHt) || str(d?.title, id),
    state: STATES.includes(d?.state) ? d.state : 'draft',
    startsAt: millis(d?.startsAt),
    doorsAt: millis(d?.doorsAt),
    questionCount: num(d?.questionCount),
    teamSize: num(d?.teamSize, 5),
    minPlayers: num(d?.minPlayers, 5),
    prizes: Array.isArray(d?.prizes?.individual)
      ? d.prizes.individual.filter((p: any) => typeof p === 'number')
      : [],
    currentQuestion: cq && typeof cq.index === 'number'
      ? { index: cq.index, opensAt: millis(cq.opensAt), closesAt: millis(cq.closesAt) }
      : null,
    counts: {
      schools: num(counts.schools),
      players: num(counts.players),
      qualifiedSchools: num(counts.qualifiedSchools),
    },
    isTest: isTestEdition(d),
  };
}

export function toLiveQuestion(d: any): ArenaLiveQuestion {
  const state = d?.state;
  const closed = state === 'closed';
  return {
    index: num(d?.index),
    prompt: str(d?.prompt),
    promptHt: str(d?.promptHt),
    options: strings(d?.options),
    optionsHt: strings(d?.optionsHt),
    opensAt: millis(d?.opensAt),
    closesAt: millis(d?.closesAt),
    state: state === 'open' || closed ? state : 'pending',
    // Trusted only once the window is shut. A reveal on an open question would
    // be a server bug; the client refuses to show one even if it ever existed.
    answerIndex: closed && typeof d?.answerIndex === 'number' ? d.answerIndex : null,
    category: str(d?.category),
  };
}

export function toRegistration(uid: string, d: any): ArenaRegistration {
  return {
    uid: str(d?.uid, uid),
    schoolKey: str(d?.schoolKey),
    grade: str(d?.grade),
    eligible: d?.eligible !== false,
  };
}

export function toStandings(d: any): ArenaStandings {
  const schools: ArenaSchoolStanding[] = Array.isArray(d?.schools)
    ? d.schools.map((s: any) => {
      const label = str(s?.label);
      return {
        key: str(s?.key),
        label,
        shortName: str(s?.shortName) || label,
        teamAvg: num(s?.teamAvg),
        members: num(s?.members),
        qualified: s?.qualified === true,
        needed: num(s?.needed),
        rank: num(s?.rank),
        top5: strings(s?.top5),
      };
    })
    : [];
  const individuals: ArenaIndividualStanding[] = Array.isArray(d?.individuals)
    ? d.individuals.map((p: any) => ({
      uid: str(p?.uid),
      schoolKey: str(p?.schoolKey),
      score: num(p?.score),
      correct: num(p?.correct),
      avgMs: num(p?.avgMs),
      rank: num(p?.rank),
      streak: num(p?.streak),
    }))
    : [];
  return { schools, individuals };
}

/**
 * The register and presence responses carry the counts at the TOP level
 * (`{ok, registered, present, needed, qualified}`); an older reader looked for
 * a nested `counts` object. Accept both.
 */
export function countsFrom(data: any): ArenaSchoolCounts | null {
  const c = data && typeof data.counts === 'object' && data.counts ? data.counts : data;
  if (!c || (typeof c.registered !== 'number' && typeof c.present !== 'number')) return null;
  return {
    registered: num(c.registered),
    present: num(c.present),
    needed: num(c.needed),
    qualified: c.qualified === true,
  };
}

// ── Which edition ───────────────────────────────────────────────────────────

/** Furthest along first: a question in progress beats a room filling. */
const PLAYABLE_PRIORITY: ArenaState[] = ['live', 'doors', 'grading', 'provisional', 'registration'];
export const PLAYABLE_STATES = [...PLAYABLE_PRIORITY];

/**
 * Which edition `/arena/jouer` (no id) should open. Test editions never win
 * here — an admin rehearsing must not pull every visitor into the rehearsal;
 * they reach it by its id, from the run console.
 */
export function pickPlayableArena(rows: ArenaTournament[]): ArenaTournament | null {
  for (const state of PLAYABLE_PRIORITY) {
    const inState = rows.filter((r) => r.state === state && !r.isTest);
    if (inState.length === 0) continue;
    return [...inState].sort((a, b) => a.startsAt - b.startsAt)[0];
  }
  return null;
}

// ── Which screen ────────────────────────────────────────────────────────────

export type ArenaScreen =
  | 'loading'
  | 'absent'      // no such tournament, or not readable
  | 'notOpen'     // draft — exists but nobody has opened it
  | 'signin'
  | 'register'    // sign-up is open and this student has not registered
  | 'closed'      // sign-up is closed and this student never registered
  | 'appOnly'     // web play is switched off
  | 'lobby'       // registered, waiting for the doors
  | 'doors'
  | 'live'
  | 'grading'
  | 'result'
  | 'void';

export interface ScreenInput {
  loading: boolean;
  tournament: Pick<ArenaTournament, 'state'> | null;
  signedIn: boolean;
  /** `undefined` while the registration listener has not answered yet. */
  registered: boolean | undefined;
  webPlay: boolean;
}

/**
 * One function, one answer: what can this student do right now.
 *
 * Results are shown to anyone (the board is public); everything before them
 * needs an account and a registration, and the playing screens additionally
 * need web play to be switched on.
 */
export function arenaScreen(i: ScreenInput): ArenaScreen {
  if (i.loading) return 'loading';
  const t = i.tournament;
  if (!t) return 'absent';
  switch (t.state) {
    case 'draft':
      return 'notOpen';
    case 'void':
      return 'void';
    case 'provisional':
    case 'final':
      return 'result';
    default:
      break;
  }
  if (!i.signedIn) return 'signin';
  if (i.registered === undefined) return 'loading';
  const signUpOpen = t.state === 'registration' || t.state === 'doors';
  if (!i.registered) return signUpOpen ? 'register' : (t.state === 'grading' ? 'grading' : 'closed');
  if (t.state === 'registration') return 'lobby';
  if (!i.webPlay) return t.state === 'grading' ? 'grading' : 'appOnly';
  if (t.state === 'doors') return 'doors';
  if (t.state === 'live') return 'live';
  return 'grading';
}

// ── The answer receipt ──────────────────────────────────────────────────────

export type AnswerReceiptStatus = 'sending' | 'accepted' | 'retryable' | 'rejected';

export interface AnswerResult {
  ok: boolean;
  error?: string;
  duplicate?: boolean;
}

/**
 * Errors the WINDOW produced: nothing about trying again fixes them. Anything
 * else (offline, a 5xx, an unknown code) may never have reached the server, so
 * the honest move is to offer a retry — the composite answer id makes a second
 * attempt a no-op if the first actually landed.
 */
const TERMINAL_ERRORS = new Set(['window_closed', 'no_window', 'answers_closed', 'not_registered', 'not_eligible']);

export function classifyAnswerResult(result: AnswerResult | null): AnswerReceiptStatus {
  if (result === null) return 'sending';
  if (result.ok) return 'accepted';
  return TERMINAL_ERRORS.has(result.error || '') ? 'rejected' : 'retryable';
}

// ── The clock ───────────────────────────────────────────────────────────────

/**
 * Where the server will start this student's clock: the moment the question
 * painted here, clamped into [opensAt, opensAt + RENDER_GRACE_MS] — the same
 * clamp `scoreAnswer` applies. A student who loads the page twelve seconds
 * into a question is therefore NOT shown a fresh twenty seconds the server
 * would never honour.
 */
export function effectiveShownAt(shownAt: number, opensAt: number): number {
  if (!opensAt) return shownAt;
  return Math.min(Math.max(shownAt, opensAt), opensAt + RENDER_GRACE_MS);
}

export interface TierRing {
  /** How much of the ring has burned down, 1 → 0. */
  remaining: number;
  /** Where on the ring the full/half boundary sits, 1 → 0. */
  boundary: number;
  tier: AnswerTier;
  /** Whole seconds left in the CURRENT tier. */
  secondsInTier: number;
  /** What a correct answer is worth right now. */
  points: number;
}

/** The clock as a tier, not a countdown: the number counts to the NEXT edge. */
export function tierRing(elapsedMs: number): TierRing {
  const e = Math.max(0, elapsedMs);
  const remaining = Math.max(0, Math.min(1, 1 - e / TIER_HALF_MS));
  const boundary = 1 - TIER_FULL_MS / TIER_HALF_MS;
  const tier: AnswerTier = e <= TIER_FULL_MS ? 'full' : e <= TIER_HALF_MS ? 'half' : 'none';
  const nextEdge = tier === 'full' ? TIER_FULL_MS : TIER_HALF_MS;
  return {
    remaining,
    boundary,
    tier,
    secondsInTier: tier === 'none' ? 0 : Math.max(0, Math.ceil((nextEdge - e) / 1000)),
    points: tier === 'full' ? 1000 : tier === 'half' ? 500 : 0,
  };
}

// ── Qualification ───────────────────────────────────────────────────────────

export interface QualificationState {
  /** What the bar fills to — registrations before doors, presence after. */
  counted: number;
  needed: number;
  qualified: boolean;
  /** Registered enough, but not enough of them are in the room. */
  shortOnTheNight: boolean;
}

export function qualificationState(input: {
  registered: number;
  present: number;
  minPlayers: number;
  doorsOpen: boolean;
}): QualificationState {
  const min = Math.max(1, Math.floor(input.minPlayers || 0) || 1);
  const registered = Math.max(0, Math.floor(input.registered || 0));
  const present = Math.max(0, Math.floor(input.present || 0));
  const counted = input.doorsOpen ? present : registered;
  const needed = Math.max(0, min - counted);
  return {
    counted,
    needed,
    qualified: needed === 0,
    shortOnTheNight: input.doorsOpen && registered >= min && present < min,
  };
}

// ── Small formatting ────────────────────────────────────────────────────────

const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));

/** Fixed-width countdown; days prefixed rather than folded into hours. */
export function formatCountdown(msRemaining: number): string {
  const s = Math.max(0, Math.floor(msRemaining / 1000));
  const days = Math.floor(s / 86400);
  const clock = `${pad(Math.floor(s / 3600) % 24)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
  return days > 0 ? `${days}j ${clock}` : clock;
}

/**
 * Keyboard → option index. `1`–`4` (and the numpad) and `a`–`d`, matching the
 * letters on screen. Null for anything else, or past the last option.
 */
export function keyToChoice(key: string, optionCount: number): number | null {
  if (!key || key.length !== 1) return null;
  let i = -1;
  if (key >= '1' && key <= '9') i = key.charCodeAt(0) - 49;
  else {
    const k = key.toLowerCase();
    if (k >= 'a' && k <= 'z') i = k.charCodeAt(0) - 97;
  }
  return i >= 0 && i < optionCount ? i : null;
}

/**
 * A per-browser random id: `web_` + 32 hex characters.
 *
 * EVIDENCE, NOT AUTH. It is the browser's equivalent of the per-install id the
 * app sends — it identifies this browser profile, not a person, resets when
 * storage is cleared, and exists only so a reviewer can see "forty accounts
 * from one machine" or "this answer came from a different device than the
 * last one". A school lab computer shared by a class is the honest case, which
 * is exactly why the server flags and never blocks on it. Matches the server's
 * `normalizeDeviceHash` shape (`[A-Za-z0-9_-]{8,128}`).
 */
export function makeWebDeviceHash(randomBytes: (n: number) => Uint8Array): string {
  const bytes = randomBytes(16);
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) hex += bytes[i].toString(16).padStart(2, '0');
  return `web_${hex}`;
}

export function isValidDeviceHash(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(v);
}
