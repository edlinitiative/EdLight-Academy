/**
 * Arena Service — the live inter-school championship, client side.
 * ────────────────────────────────────────────────────────────────
 * See docs/design/2026-09-17-arena-tournament-design.md, sections C and F.
 *
 * The split here is not a style choice, it is the whole integrity model:
 *
 *  - Every WRITE goes through an API route with the Admin SDK. The rules deny
 *    client writes on everything under `tournaments/*` entirely, so a write
 *    attempted from here does not "usually" fail — it always fails. Scoring,
 *    the tier a submission earns, and whether a school qualified are decided by
 *    the server clock and nothing else.
 *  - Every READ is a direct Firestore subscription. This is the fan-out
 *    primitive the design turns on: a playing client subscribes to ONE live
 *    question document and one tournament document, not to a WebSocket server
 *    somebody has to keep alive at 18:40 on a Friday.
 *
 * The pure functions at the bottom (countdown, qualification, invite copy) hold
 * the lobby's whole decision logic and are exported so they can be tested
 * without a renderer — see utils/__tests__/arenaLobby.test.ts.
 */

import { Share } from 'react-native';
import { collection, doc, onSnapshot, query, where, Timestamp, type Unsubscribe } from 'firebase/firestore';
import { auth, db } from './firebase';
import { getReferralCode } from './referralService';
import type { ArenaState } from '../../../shared/arena/state';
import { TIER_FULL_MS, TIER_HALF_MS, type AnswerTier } from '../../../shared/arena/scoring';
import { cachedDeviceHash } from '../utils/integrity';
import { attestationToken } from '../utils/attestation';

const API_BASE = 'https://academy.edlight.org/api/arena';
const REGISTER_URL = `${API_BASE}/register`;
const ANSWER_URL = `${API_BASE}/answer`;
const PRESENCE_URL = `${API_BASE}/presence`;

// ── Shapes read off Firestore ───────────────────────────────────────────────

export interface ArenaRoundSpec {
  index: number;
  questionCount: number;
  category: string;
  label: string;
}

/** The question currently on the clock, as the tournament document advertises it. */
export interface ArenaCurrentQuestion {
  index: number;
  opensAt: number; // epoch ms
  closesAt: number; // epoch ms
  seq: number;
}

export interface ArenaTournament {
  id: string;
  slug: string;
  title: string;
  state: ArenaState;
  startsAt: number; // epoch ms
  doorsAt: number; // epoch ms
  rounds: ArenaRoundSpec[];
  questionCount: number;
  /** Frozen per tournament, never global — a later event may play sevens. */
  teamSize: number;
  minPlayers: number;
  /** Prize pool in cents USD, biggest first. */
  prizes: number[];
  currentRound: number | null;
  currentQuestion: ArenaCurrentQuestion | null;
  counts: { schools: number; players: number; qualifiedSchools: number };
}

/**
 * The delivery document — `tournaments/{tid}/live/{index}`.
 *
 * Carries no answer key, by construction: `questions/{index}` (which does) is
 * `allow read: if false`. Anything a client can subscribe to, a client can dump.
 */
export interface ArenaLiveQuestion {
  index: number;
  seq: number;
  prompt: string;
  promptHt: string;
  options: string[];
  optionsHt: string[];
  opensAt: number; // epoch ms
  closesAt: number; // epoch ms
  state: 'pending' | 'open' | 'closed';
  /**
   * The answer, revealed. Null until `state` is `closed`, and written by the
   * server at the same moment — the ~10s pause is the only window in which this
   * field may exist, because anything a client can subscribe to while a
   * question is open is an answer key the whole room can read.
   */
  answerIndex: number | null;
  /** Category label for the question chip, when the round carries one. */
  category: string;
}

/**
 * `tournamentRegistrations/{tid}_{uid}` — the auditable claim, and the ONLY
 * arena document a player can read about themselves.
 *
 * `tournaments/{tid}/players/{uid}` is `allow read: if false` — including a
 * player's own row — and that is deliberate rather than an oversight. The score
 * increment lands the instant an answer is scored, so five friends submitting
 * five different options would learn the correct one from whose score moved,
 * while the question is still open. It is the cheapest attack on the whole
 * design and it needs no tooling at all. So the client never learns its running
 * score, and everything the player screens show about a student comes from here
 * plus the public standings document.
 */
export interface ArenaRegistration {
  uid: string;
  tid: string;
  schoolKey: string;
  grade: string;
  eligible: boolean;
  attestedAt: number;
}

/** One school's lane, as `tournaments/{tid}/standings/current` stores it. */
export interface ArenaSchoolStanding {
  key: string;
  label: string;
  /** CODOSA — what the board shows; the full name never fits. */
  shortName: string;
  teamAvg: number;
  teamTotalMs: number;
  /** How many players were counted into `teamAvg`. */
  counted: number;
  /** The school's head count. */
  members: number;
  qualified: boolean;
  /** Players still needed to qualify. 0 once qualified. */
  needed: number;
  /** 1-based among QUALIFIED schools; 0 when the school cannot compete. */
  rank: number;
  /** The uids currently counting — how a student learns they are in the five. */
  top5: string[];
}

/**
 * The student's OWN row in the ranked individuals slice.
 *
 * Read for one uid and never rendered as a list. The board exists on this
 * document because the broadcast needs it; the phone that is playing looks up
 * exactly one row and shows nothing else, because watching yourself drop
 * mid-round is demoralising and it invites tab-switching.
 */
export interface ArenaIndividualStanding {
  uid: string;
  displayName: string;
  schoolKey: string;
  score: number;
  correct: number;
  avgMs: number;
  rank: number;
  streak: number;
}

export interface ArenaStandings {
  seq: number;
  schools: ArenaSchoolStanding[];
  individuals: ArenaIndividualStanding[];
}

/** What the register and presence endpoints report back about a school. */
export interface ArenaSchoolCounts {
  registered: number;
  present: number;
  needed: number;
  qualified: boolean;
  /** WHICH count `qualified` was computed from. The honest label depends on it. */
  basis: 'registered' | 'present';
}

// ── Reading ─────────────────────────────────────────────────────────────────

const ms = (v: any): number => (v instanceof Timestamp ? v.toMillis() : Number(v) || 0);
const str = (v: any, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: any, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const strings = (v: any): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);

const ARENA_STATES: ArenaState[] = [
  'draft', 'registration', 'doors', 'live', 'grading', 'provisional', 'final', 'void',
];
const readState = (v: any): ArenaState => (ARENA_STATES.includes(v) ? v : 'draft');

function toTournament(id: string, d: any): ArenaTournament {
  const cq = d?.currentQuestion;
  return {
    id,
    slug: str(d?.slug, id),
    title: str(d?.title),
    state: readState(d?.state),
    startsAt: ms(d?.startsAt),
    doorsAt: ms(d?.doorsAt),
    rounds: Array.isArray(d?.rounds)
      ? d.rounds.map((r: any, i: number) => ({
        index: num(r?.index, i),
        questionCount: num(r?.questionCount),
        category: str(r?.category),
        label: str(r?.label),
      }))
      : [],
    questionCount: num(d?.questionCount),
    // A tournament document written before teamSize was frozen still has to
    // play: five is the design's floor and the number every screen renders.
    teamSize: num(d?.teamSize, 5),
    minPlayers: num(d?.minPlayers, 5),
    prizes: Array.isArray(d?.prizes?.individual)
      ? d.prizes.individual.filter((p: any) => typeof p === 'number')
      : [],
    currentRound: typeof d?.currentRound === 'number' ? d.currentRound : null,
    currentQuestion: cq
      ? { index: num(cq.index), opensAt: ms(cq.opensAt), closesAt: ms(cq.closesAt), seq: num(cq.seq) }
      : null,
    counts: {
      schools: num(d?.countsPublic?.schools),
      players: num(d?.countsPublic?.players),
      qualifiedSchools: num(d?.countsPublic?.qualifiedSchools),
    },
  };
}

function toLiveQuestion(d: any): ArenaLiveQuestion {
  const state = d?.state;
  return {
    index: num(d?.index),
    seq: num(d?.seq),
    prompt: str(d?.prompt),
    promptHt: str(d?.promptHt),
    options: strings(d?.options),
    optionsHt: strings(d?.optionsHt),
    opensAt: ms(d?.opensAt),
    closesAt: ms(d?.closesAt),
    state: state === 'open' || state === 'closed' ? state : 'pending',
    // Trusted only once the window is shut: a reveal that leaked early would
    // be the end of the tournament's credibility, so the client refuses to
    // read one off an open question even if the server ever wrote it.
    answerIndex: state === 'closed' && typeof d?.answerIndex === 'number' ? d.answerIndex : null,
    category: str(d?.category),
  };
}

/**
 * The tournament document. One subscription per client, and the only place the
 * state machine, the clock and the public counters reach the app.
 *
 * `cb(null)` on a missing document AND on a listener error — a tournament that
 * does not exist and a rules rejection are the same thing to a screen, which
 * should show the "no event scheduled" state rather than an error nobody can
 * act on.
 */
export function subscribeTournament(
  tid: string,
  cb: (t: ArenaTournament | null) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'tournaments', tid),
    (snap) => cb(snap.exists() ? toTournament(snap.id, snap.data()) : null),
    (err) => {
      console.error('[Arena] tournament listener error:', err);
      onError?.(err);
      cb(null);
    },
  );
}

/** `doors` is the more urgent moment — the room is filling right now. */
const OPEN_STATE_PRIORITY = ['doors', 'registration'] as const;

/**
 * Which open tournament the Home tab should announce, if any.
 *
 * Pure and exported for tests, same reason the broadcast side's `pickOnAir`
 * is: get the ordering wrong and either nothing gets announced while a room
 * is filling, or last month's tournament outranks this month's.
 */
export function pickOpenTournament(rows: ArenaTournament[]): ArenaTournament | null {
  for (const state of OPEN_STATE_PRIORITY) {
    const inState = rows.filter((r) => r.state === state);
    if (inState.length === 0) continue;
    return inState.sort((a, b) => a.startsAt - b.startsAt)[0];
  }
  return null;
}

/**
 * Is there a tournament open for sign-up right now?
 *
 * The registration screen (`ArenaLobbyScreen`) was fully built and worked
 * from the day it shipped, and the ONLY link to it anywhere in the app was a
 * button on the RESULTS screen of a tournament that had already finished — a
 * student who had never played had no way in. This is the query the Home tab
 * needed to fix that: it does not take a tid, because nobody browsing Home has
 * one to give it.
 *
 * `registration`/`doors` only — `live` and anything after means sign-up has
 * closed. When both states have a tournament (should not happen in practice;
 * one event runs at a time) `doors` wins because the room is filling THIS
 * minute, which is more urgent than an announcement for later.
 */
export function subscribeOpenTournament(
  cb: (t: ArenaTournament | null) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  const q = query(collection(db, 'tournaments'), where('state', 'in', [...OPEN_STATE_PRIORITY]));
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => toTournament(d.id, d.data()));
      cb(pickOpenTournament(rows));
    },
    (err) => {
      console.error('[Arena] open-tournament listener error:', err);
      onError?.(err);
      cb(null);
    },
  );
}

/** Furthest along first — a question in progress is more urgent than a wait for review. */
const ACTIVE_STATE_PRIORITY = ['live', 'grading', 'provisional'] as const;

/**
 * Which in-progress tournament the Home tab should offer a way back into.
 *
 * Same shape as `pickOpenTournament`, a different set of states and a
 * different question: not "can I sign up" but "is there somewhere I already
 * registered that I could still get back to."
 */
export function pickActiveTournament(rows: ArenaTournament[]): ArenaTournament | null {
  for (const state of ACTIVE_STATE_PRIORITY) {
    const inState = rows.filter((r) => r.state === state);
    if (inState.length === 0) continue;
    return inState.sort((a, b) => a.startsAt - b.startsAt)[0];
  }
  return null;
}

/**
 * Is there a tournament past sign-up that a student could still re-enter?
 *
 * CORRECTION, from an external audit: `ArenaAnnounceCard` — Home's only door
 * into the Arena — self-hides the moment a tournament leaves `doors`, on the
 * reasoning that `live` and later means sign-up has closed. True for sign-up,
 * but it also removed the only way BACK for a student who registered, left
 * the screen (backgrounded the app, tapped a notification, answered a call),
 * and returned to Home mid-tournament — exactly when they most need to find
 * their way back to a question worth real points. This is the companion
 * query: whoever is watching still has to confirm they actually registered
 * for whatever this turns up (see ArenaAnnounceCard) — this alone doesn't
 * know who is asking.
 */
export function subscribeActiveTournament(
  cb: (t: ArenaTournament | null) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  const q = query(collection(db, 'tournaments'), where('state', 'in', [...ACTIVE_STATE_PRIORITY]));
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => toTournament(d.id, d.data()));
      cb(pickActiveTournament(rows));
    },
    (err) => {
      console.error('[Arena] active-tournament listener error:', err);
      onError?.(err);
      cb(null);
    },
  );
}

/**
 * The one document a playing client watches during a question.
 *
 * `index` is a number on the tournament document and a document ID here, so it
 * is stringified in exactly one place — this one.
 */
export function subscribeLiveQuestion(
  tid: string,
  index: number,
  cb: (q: ArenaLiveQuestion | null) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'tournaments', tid, 'live', String(index)),
    (snap) => cb(snap.exists() ? toLiveQuestion(snap.data()) : null),
    (err) => {
      console.error('[Arena] live question listener error:', err);
      onError?.(err);
      cb(null);
    },
  );
}

/**
 * The student's own registration — the one arena document about them a client
 * may read. Null means "not registered", which is also what signed-out and
 * never-played look like, and all three want the same screen.
 */
export function subscribeRegistration(
  tid: string,
  uid: string,
  cb: (r: ArenaRegistration | null) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'tournamentRegistrations', `${tid}_${uid}`),
    (snap) => {
      if (!snap.exists()) { cb(null); return; }
      const d: any = snap.data();
      cb({
        uid: str(d?.uid, uid),
        tid: str(d?.tid, tid),
        schoolKey: str(d?.schoolKey),
        grade: str(d?.grade),
        eligible: d?.eligible !== false,
        attestedAt: ms(d?.attestedAt),
      });
    },
    (err) => {
      console.error('[Arena] registration listener error:', err);
      onError?.(err);
      cb(null);
    },
  );
}

/**
 * The single standings document every surface reads. Ten thousand spectators
 * subscribe to this one doc — which is the whole spectator read cost, and the
 * reason the player client can afford to read it too.
 *
 * `individuals` is lifted off it too, but the player screens look up exactly
 * ONE row — their own — and never render the list. The board exists here for
 * the broadcast; watching yourself drop mid-round is demoralising and it
 * invites tab-switching, so it does not reach the phone that is playing.
 *
 * A student outside the ranked slice simply has no row, and the screen shows
 * their school's position rather than inventing a number for them.
 */
export function subscribeStandings(
  tid: string,
  cb: (s: ArenaStandings | null) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'tournaments', tid, 'standings', 'current'),
    (snap) => {
      if (!snap.exists()) { cb(null); return; }
      const d: any = snap.data();
      const schools: ArenaSchoolStanding[] = Array.isArray(d?.schools)
        ? d.schools.map((s: any) => {
          const label = str(s?.label);
          return {
            key: str(s?.key),
            label,
            shortName: str(s?.shortName, label),
            teamAvg: num(s?.teamAvg),
            teamTotalMs: num(s?.teamTotalMs),
            counted: num(s?.counted),
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
          displayName: str(p?.displayName),
          schoolKey: str(p?.schoolKey),
          score: num(p?.score),
          correct: num(p?.correct),
          avgMs: num(p?.avgMs),
          rank: num(p?.rank),
          streak: num(p?.streak),
        }))
        : [];
      cb({ seq: num(d?.seq), schools, individuals });
    },
    (err) => {
      console.error('[Arena] standings listener error:', err);
      onError?.(err);
      cb(null);
    },
  );
}

// ── Writing (server-authoritative) ──────────────────────────────────────────

/** Authed POST helper — same Bearer-token pattern as challengeService. */
async function authedPost(url: string, payload: Record<string, unknown>): Promise<any | null> {
  const user = auth.currentUser;
  if (!user) return null;
  let token: string;
  try {
    token = await user.getIdToken();
  } catch {
    return null;
  }
  /*
   * "This is the real app", when the device can say so (E7).
   *
   * Attached to every Arena write rather than only to answers: registration
   * and presence are the two calls a script would use to build a fake roster,
   * and they are cheap to attest because the token is cached.
   *
   * `attestationToken()` never throws and returns null on every failure path —
   * an unsupported device, an outage, a provider not yet registered. No header
   * then, and the request goes out exactly as it always has. The server reads
   * absence as unknown and never blocks on it.
   */
  const attestation = await attestationToken();

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(attestation ? { 'X-Firebase-AppCheck': attestation } : {}),
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[Arena] endpoint returned', res.status, data?.error);
      return { error: data?.error || `http_${res.status}` };
    }
    return data;
  } catch (err) {
    console.error('[Arena] request error:', err);
    return null;
  }
}

export type ArenaWriteResult<T> = ({ ok: true } & T) | { ok: false; error: string };

const failed = (error: string): { ok: false; error: string } => ({ ok: false, error });

const countsFrom = (d: any): ArenaSchoolCounts => ({
  registered: num(d?.registered),
  present: num(d?.present),
  needed: num(d?.needed),
  qualified: d?.qualified === true,
  basis: d?.basis === 'present' ? 'present' : 'registered',
});

/**
 * Enter the tournament.
 *
 * `grade` is attested, not proven — the server records the claim and rejects
 * only POSTBAC, because the Arena is a primary-and-secondary tournament. The
 * deterrent is that verification happens at CLAIM, for winners only, and that
 * it is announced beforehand; the attestation checkbox is what makes a later
 * removal the published rule working rather than an argument about what
 * somebody said in September.
 *
 * Idempotent by key: the ids are composite and derived, so re-registering
 * overwrites one row rather than minting a second — and a re-submission during
 * `doors` never zeroes a score already earned.
 */
export async function registerForTournament(opts: {
  tournamentId: string;
  schoolKey: string;
  grade: string;
  deviceHash?: string | null;
}): Promise<ArenaWriteResult<{ counts: ArenaSchoolCounts }>> {
  const data = await authedPost(REGISTER_URL, {
    tournamentId: opts.tournamentId,
    schoolKey: opts.schoolKey,
    grade: opts.grade,
    deviceHash: opts.deviceHash ?? null,
  });
  if (!data) return failed('offline');
  if (!data.ok) return failed(String(data.error || 'unknown'));
  return { ok: true, counts: countsFrom(data) };
}

/**
 * One submission, which is the commitment.
 *
 * `clientShownAt` is when the question PAINTED on this device, not when the
 * server opened it — a slow connection must not be taxed for the network. The
 * server clamps it into [opensAt, opensAt + 3s], so claiming a late render can
 * only ever cost a tier, never buy one. The composite answer ID
 * (`{uid}_{index}`) makes a retry a no-op rather than a race, so this is safe
 * to call again after a dropped response.
 *
 * Note what does NOT come back: whether the answer was correct, and what it
 * scored. The reveal arrives on the live document when the window closes, the
 * same instant for everybody in the room — a per-client verdict would tell the
 * first five friends to answer what the right option was while the question was
 * still open for everyone else.
 */
export async function submitAnswer(opts: {
  tournamentId: string;
  questionIndex: number;
  choice: number;
  clientShownAt: number;
  focusLosses?: number;
}): Promise<ArenaWriteResult<{ recorded: boolean; duplicate: boolean }>> {
  /*
   * WHICH DEVICE THIS ANSWER IS COMING FROM, on every answer rather than once
   * at registration (E7). The server compares it against the previous answer's
   * and flags a mid-tournament switch — it never blocks, because a dead phone
   * and a borrowed tablet are the common honest cases.
   *
   * Read through `cachedDeviceHash`, not `deviceHash()` directly: this sits on
   * the submit path with a tiered clock running, and the native call is worth
   * making once per launch rather than twenty-five times under time pressure.
   * A failure resolves to null — a device that will not identify itself is not
   * evidence of anything, and must never cost a student their answer.
   */
  const data = await authedPost(ANSWER_URL, {
    tournamentId: opts.tournamentId,
    questionIndex: opts.questionIndex,
    choice: opts.choice,
    clientShownAt: opts.clientShownAt,
    focusLosses: opts.focusLosses ?? 0,
    deviceHash: await cachedDeviceHash(),
  });
  if (!data) return failed('offline');
  if (!data.ok) return failed(String(data.error || 'unknown'));
  return { ok: true, recorded: data.recorded !== false, duplicate: data.duplicate === true };
}

/**
 * "I am in the room."
 *
 * Qualification is evaluated at doors close on players actually PRESENT, not on
 * registrations (Decisions — 2026-09-18, §3), so this call is the difference
 * between a school fielding a team and not. It answers with BOTH counts every
 * time, which is what lets the lobby show `5 inscrits · 3 présents` honestly
 * rather than one number that means something different before and after 18:00.
 *
 * A heartbeat, not a one-shot: it is safe to re-send, and the rate limit is
 * generous for exactly that reason.
 */
export async function markPresent(opts: {
  tournamentId: string;
}): Promise<ArenaWriteResult<{ counts: ArenaSchoolCounts; minPlayers: number }>> {
  const data = await authedPost(PRESENCE_URL, { tournamentId: opts.tournamentId });
  if (!data) return failed('offline');
  if (!data.ok) return failed(String(data.error || 'unknown'));
  return { ok: true, counts: countsFrom(data), minPlayers: num(data.minPlayers, 5) };
}

// ── Pure logic (no Firestore, no clock of its own) ──────────────────────────

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** The clock has run out. */
  done: boolean;
}

export function countdownParts(msRemaining: number): CountdownParts {
  const clamped = Math.max(0, Math.floor(msRemaining / 1000));
  return {
    days: Math.floor(clamped / 86400),
    hours: Math.floor(clamped / 3600) % 24,
    minutes: Math.floor(clamped / 60) % 60,
    seconds: clamped % 60,
    done: clamped <= 0,
  };
}

const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));

/**
 * The lobby hero, in tabular figures.
 *
 * Fixed width at every scale on purpose: a countdown whose digits shuffle
 * sideways every second is the one element on the screen guaranteed to be
 * looked at continuously, and the jitter is what makes a lobby feel cheap.
 * Days are prefixed rather than folded into hours, because "47:12:03" is a
 * number nobody parses as two days.
 */
export function formatCountdown(msRemaining: number): string {
  const { days, hours, minutes, seconds, done } = countdownParts(msRemaining);
  if (done) return '00:00:00';
  const clock = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return days > 0 ? `${days}j ${clock}` : clock;
}

export interface QualificationInput {
  /** Players registered to this school for this tournament. */
  registered: number;
  /** Players of this school confirmed present. Only meaningful once doors open. */
  present: number;
  /** The floor, off the tournament document. */
  minPlayers: number;
  /** Doors are open — presence is now the test, registration is only context. */
  doorsOpen: boolean;
}

export interface QualificationState {
  /** The number the bar fills to — registrations before doors, presence after. */
  counted: number;
  /** How many more are needed. 0 once qualified. */
  needed: number;
  qualified: boolean;
  /**
   * Show BOTH numbers (`5 inscrits · 3 présents`). A school can be qualified on
   * paper and short on the night, and discovering that at kick-off is a bad
   * surprise and a bad story — so from doors open the lobby shows the gap.
   */
  showBoth: boolean;
  /** Registered enough, but not enough of them turned up. The dangerous case. */
  shortOnTheNight: boolean;
}

export function qualificationState(input: QualificationInput): QualificationState {
  const min = Math.max(1, Math.floor(input.minPlayers || 0) || 1);
  const registered = Math.max(0, Math.floor(input.registered || 0));
  const present = Math.max(0, Math.floor(input.present || 0));
  const counted = input.doorsOpen ? present : registered;
  const needed = Math.max(0, min - counted);
  return {
    counted,
    needed,
    qualified: needed === 0,
    showBoth: input.doorsOpen,
    shortOnTheNight: input.doorsOpen && registered >= min && present < min,
  };
}

export type ArenaInviteCase = 'short' | 'qualified' | 'doors-short';

/** Which of the three messages a school needs right now. */
export function inviteCase(q: Pick<QualificationState, 'qualified' | 'showBoth'>): ArenaInviteCase {
  if (q.qualified) return 'qualified';
  return q.showBoth ? 'doors-short' : 'short';
}

export interface ArenaInviteInput {
  /** CODOSA. Falls back to the full name when a school has never been given one. */
  schoolName: string;
  qualification: QualificationState;
  lang: 'fr' | 'ht';
  /** Where the invite lands. */
  url: string;
  /** The referral code the growth rails already mint, when there is one. */
  referralCode?: string | null;
}

/**
 * The invite, framed around the SCHOOL and never the sender.
 *
 * "Viens jouer avec moi" asks for a favour and gets the reply a favour gets.
 * "Il manque 2 joueurs à CODOSA pour se qualifier" is a fact about something
 * the reader already belongs to, and it is the only mechanic in the product
 * where a student benefits from recruiting people who are not close friends.
 *
 * Three cases, because the ask genuinely changes:
 *  - short, before doors      → register, there is still time
 *  - doors open and short     → come NOW, the room is open and it ends tonight
 *  - qualified                → the team is in; bring people to the stands
 */
export function buildArenaInviteMessage(input: ArenaInviteInput): string {
  const { schoolName, qualification, lang, url } = input;
  const ht = lang === 'ht';
  const n = qualification.needed;
  // Kreyòl does not inflect the noun for number — "2 jwè" is correct as it
  // stands, and pluralising it would read as a translation of French.
  const players = ht ? 'jwè' : n > 1 ? 'joueurs' : 'joueur';

  let head: string;
  switch (inviteCase(qualification)) {
    case 'qualified':
      head = ht
        ? `🏆 ${schoolName} KALIFYE pou Chanpyona EdLight la ! Vin jwe ak nou.`
        : `🏆 ${schoolName} EST QUALIFIÉ pour le Championnat EdLight ! Viens jouer avec nous.`;
      break;
    case 'doors-short':
      head = ht
        ? `⏰ Sal la louvri — ${schoolName} manke ${n} ${players}. Si nou pa konplè, lekòl la pa nan konpetisyon an aswè a.`
        : `⏰ La salle est ouverte — il manque ${n} ${players} à ${schoolName}. Sans eux, l'école ne concourt pas ce soir.`;
      break;
    default:
      head = ht
        ? `🏆 Li manke ${n} ${players} nan ${schoolName} pou lekòl la kalifye nan Chanpyona EdLight la.`
        : `🏆 Il manque ${n} ${players} à ${schoolName} pour se qualifier au Championnat EdLight.`;
      break;
  }

  const codeLine = input.referralCode
    ? ht
      ? ` Sèvi ak kòd mwen ${input.referralCode} lè w enskri, nou chak ap genyen yon bonus.`
      : ` Utilise mon code ${input.referralCode} en t'inscrivant — on gagne chacun un bonus.`
    : '';

  return `${head}${codeLine} ${url}`;
}

/** Open the native share sheet with the school-framed invite. */
export async function shareArenaInvite(input: Omit<ArenaInviteInput, 'referralCode'>): Promise<void> {
  const ref = await getReferralCode().catch(() => null);
  const message = buildArenaInviteMessage({ ...input, referralCode: ref?.code ?? null });
  try {
    await Share.share({ message });
  } catch {
    /* user cancelled */
  }
}

export interface TierRing {
  /** How much of the ring has burned down, 1 → 0. */
  remaining: number;
  /** Where on the ring the full/half boundary sits, 1 → 0. */
  boundary: number;
  /** What this answer would score if submitted right now. */
  tier: AnswerTier;
  /** Whole seconds left in the CURRENT tier — the number under the ring. */
  secondsInTier: number;
}

/**
 * The clock, expressed as a tier rather than as a countdown.
 *
 * The design's one demand of this ring: the tier has to be legible WHILE
 * answering, not explained afterwards. A plain countdown says "8 seconds left"
 * and the student has no idea that 4 of those seconds are worth 1000 points and
 * 4 are worth 500. So the ring carries the boundary as a visible mark, changes
 * colour when it crosses, and the number underneath counts down to the NEXT
 * tier, not to zero.
 *
 * Measured from when the question rendered on this device, matching what the
 * server will clamp and score.
 */
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
  };
}
