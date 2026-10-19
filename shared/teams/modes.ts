/**
 * teams/modes — shared-answer (J12) and relay (J13) team play. Pure: no clock,
 * no I/O. The API loads the stored records, calls these, writes the result
 * inside ONE transaction, so every decision below is serializable.
 *
 * SHARED ANSWER ("shared-authority-v1")
 *   A locked three-starter team submits ONE answer per question. Exactly one
 *   starter holds the server-owned submitter authority, identified by a
 *   monotonically increasing `authorityVersion`. Every submission names the
 *   version its device last saw; a stale device (the old holder after a
 *   transfer or a claim) is refused with `authority_stale`. The team answer
 *   record is created, never overwritten, so a race between an old and a new
 *   holder accepts at most one answer per question.
 *   Transfer: the holder (or the team captain) hands authority to another
 *   starter. Failover: when the holder has not been seen for ABSENT_MS the
 *   deputy may claim it; after twice that, any starter may. Presence is the
 *   server's record of the holder's last request — never a client claim.
 *   A transfer never extends a timer or replaces an accepted answer.
 *
 * RELAY ("relay-slots-v1")
 *   The captain orders the three starters before the start; the order is
 *   frozen in a server-only control record at the first play request after
 *   the start. Only the owner of the current slot can answer.
 *     live   — synchronous: question i belongs to slot i mod 3. A turn that
 *              expires is a zero; the room moves on on its own schedule.
 *     window — asynchronous: the questions are split into three consecutive
 *              legs. A leg opens when the previous one ends; its owner has
 *              `relayTurnMs` to start it, else it is forfeited (zero) and the
 *              next leg opens. Once started, a leg lasts at most its questions'
 *              time; a player who leaves mid-leg does not hold the team up.
 *   Predeclared substitute policy: none (forfeit). A teammate never takes an
 *   absent player's turn.
 */
import { PENDING, SKIPPED, type Attempt } from '../tournois/attempt';
import { ANSWER_GRACE_MS, attemptAnswerLate } from '../tournois/schedule';
import { scoreAnswer } from '../tournois/scoring';

export const GAME_MODES = ['independent', 'shared', 'relay'] as const;
export type GameMode = (typeof GAME_MODES)[number];
export type TeamGameMode = Exclude<GameMode, 'independent'>;
/** Versioned scoring/authority policies stored on entries and engine docs. */
export const TEAM_MODE_POLICY: Record<TeamGameMode, string> = {
  shared: 'shared-authority-v1',
  relay: 'relay-slots-v1',
};
/** The engine formats these modes run on. Rounds/bracket stay individual or independent. */
export const TEAM_MODE_FORMATS = ['live', 'window'] as const;

/** Holder silent this long → the deputy may claim; twice this → any starter. */
export const ABSENT_MS = 15_000;
/** Presence is written at most this often per starter. */
export const PRESENCE_WRITE_MS = 5_000;
/** Bounded audit of authority changes kept on the control record. */
export const TRANSFER_LOG_MAX = 20;

/** Missing → independent (legacy). Anything unknown → null: never silently coerced. */
export function parseGameMode(value: unknown): GameMode | null {
  if (value === undefined || value === null || value === '') return 'independent';
  return typeof value === 'string' && (GAME_MODES as readonly string[]).includes(value)
    ? (value as GameMode)
    : null;
}

export function isTeamGameMode(value: unknown): value is TeamGameMode {
  return value === 'shared' || value === 'relay';
}

// ── Control record ─────────────────────────────────────────────────────────

export interface TeamRoles {
  submitter: string;
  deputy: string;
}

export interface TransferLog {
  from: string | null;
  to: string;
  version: number;
  at: number;
  reason: 'transfer' | 'claim';
}

/** userTournaments/{tid}/teamControl/{entryId} — server only. */
export interface TeamControl {
  entryId: string;
  mode: TeamGameMode;
  policy: string;
  captainUid: string;
  starters: string[];
  /** shared */
  holderUid: string;
  deputyUid: string;
  authorityVersion: number;
  /** relay order (frozen); for shared it is the starter order. */
  slots: string[];
  lastSeen: Record<string, number>;
  transfers: TransferLog[];
  createdAt: number;
  updatedAt: number;
}

export interface EntryForControl {
  id: string;
  captainUid: string;
  starters: string[];
  roles?: TeamRoles | null;
  relaySlots?: string[] | null;
}

/** A permutation of the starters, or null. */
export function validSlots(slots: unknown, starters: string[]): string[] | null {
  if (!Array.isArray(slots) || slots.length !== starters.length) return null;
  if (!slots.every((s) => typeof s === 'string' && starters.includes(s))) return null;
  return new Set(slots).size === starters.length ? (slots as string[]) : null;
}

/** Submitter and deputy: two different starters, or null. */
export function validRoles(roles: unknown, starters: string[]): TeamRoles | null {
  const r = roles as Partial<TeamRoles> | null | undefined;
  if (!r || typeof r.submitter !== 'string' || typeof r.deputy !== 'string') return null;
  if (!starters.includes(r.submitter) || !starters.includes(r.deputy)) return null;
  return r.submitter === r.deputy ? null : { submitter: r.submitter, deputy: r.deputy };
}

/** What the roles will be when play starts (also shown before the start). */
export function plannedRoles(entry: EntryForControl): { holderUid: string; deputyUid: string; slots: string[] } {
  const starters = entry.starters;
  const roles = validRoles(entry.roles, starters);
  const holderUid = roles?.submitter
    ?? (starters.includes(entry.captainUid) ? entry.captainUid : starters[0]);
  const deputyUid = roles?.deputy && roles.deputy !== holderUid
    ? roles.deputy
    : starters.find((u) => u !== holderUid) ?? holderUid;
  return { holderUid, deputyUid, slots: validSlots(entry.relaySlots, starters) ?? [...starters] };
}

/** Frozen at the first request after the start. */
export function initialControl(entry: EntryForControl, mode: TeamGameMode, now: number): TeamControl {
  const planned = plannedRoles(entry);
  return {
    entryId: entry.id,
    mode,
    policy: TEAM_MODE_POLICY[mode],
    captainUid: entry.captainUid,
    starters: [...entry.starters],
    holderUid: planned.holderUid,
    deputyUid: planned.deputyUid,
    authorityVersion: 1,
    slots: planned.slots,
    lastSeen: {},
    transfers: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** When `uid` may claim authority, or null if it never can (the holder, a non-starter, relay). */
export function claimableAt(c: TeamControl, uid: string): number | null {
  if (c.mode !== 'shared' || uid === c.holderUid || !c.starters.includes(uid)) return null;
  const seen = c.lastSeen?.[c.holderUid] ?? c.createdAt;
  return seen + (uid === c.deputyUid ? ABSENT_MS : 2 * ABSENT_MS);
}

/** Record the caller's presence; null when nothing needs writing. */
export function touch(c: TeamControl, uid: string, now: number): TeamControl | null {
  if (!c.starters.includes(uid)) return null;
  const last = c.lastSeen?.[uid] ?? 0;
  if (now - last < PRESENCE_WRITE_MS) return null;
  return { ...c, lastSeen: { ...(c.lastSeen || {}), [uid]: now }, updatedAt: now };
}

export type AuthorityRefusal =
  | 'not_a_starter'
  | 'authority_stale'
  | 'not_authority_holder'
  | 'holder_present'
  | 'invalid_recipient'
  | 'unsupported_mode';

export type AuthorityOutcome =
  | { ok: true; control: TeamControl; already: boolean }
  | { ok: false; error: AuthorityRefusal };

const logged = (c: TeamControl, entry: TransferLog): TransferLog[] =>
  [...(c.transfers || []), entry].slice(-TRANSFER_LOG_MAX);

/** Hand authority to another starter. Holder or captain only; `expectedVersion` must be current. */
export function transferAuthority(
  c: TeamControl, actor: string, to: string, expectedVersion: unknown, now: number,
): AuthorityOutcome {
  if (c.mode !== 'shared') return { ok: false, error: 'unsupported_mode' };
  if (!c.starters.includes(actor) && actor !== c.captainUid) return { ok: false, error: 'not_a_starter' };
  // A retried transfer that already landed is a success, not a conflict.
  if (expectedVersion === c.authorityVersion - 1 && c.holderUid === to && c.transfers?.[c.transfers.length - 1]?.reason === 'transfer')
    return { ok: true, control: c, already: true };
  if (expectedVersion !== c.authorityVersion) return { ok: false, error: 'authority_stale' };
  if (actor !== c.holderUid && actor !== c.captainUid) return { ok: false, error: 'not_authority_holder' };
  if (!c.starters.includes(to) || to === c.holderUid) return { ok: false, error: 'invalid_recipient' };
  const version = c.authorityVersion + 1;
  return {
    ok: true,
    already: false,
    control: {
      ...c,
      holderUid: to,
      deputyUid: c.deputyUid === to ? c.holderUid : c.deputyUid,
      authorityVersion: version,
      // The recipient was chosen by a present teammate: their absence clock starts now.
      lastSeen: { ...(c.lastSeen || {}), [to]: now },
      transfers: logged(c, { from: c.holderUid, to, version, at: now, reason: 'transfer' }),
      updatedAt: now,
    },
  };
}

/** Take authority from an absent holder. Server time decides when that is allowed. */
export function claimAuthority(
  c: TeamControl, actor: string, expectedVersion: unknown, now: number,
): AuthorityOutcome {
  if (c.mode !== 'shared') return { ok: false, error: 'unsupported_mode' };
  if (!c.starters.includes(actor)) return { ok: false, error: 'not_a_starter' };
  if (actor === c.holderUid) return { ok: true, control: c, already: true };
  if (expectedVersion !== c.authorityVersion) return { ok: false, error: 'authority_stale' };
  const at = claimableAt(c, actor);
  if (at === null || now < at) return { ok: false, error: 'holder_present' };
  const version = c.authorityVersion + 1;
  return {
    ok: true,
    already: false,
    control: {
      ...c,
      holderUid: actor,
      deputyUid: c.deputyUid === actor ? c.holderUid : c.deputyUid,
      authorityVersion: version,
      lastSeen: { ...(c.lastSeen || {}), [actor]: now },
      transfers: logged(c, { from: c.holderUid, to: actor, version, at: now, reason: 'claim' }),
      updatedAt: now,
    },
  };
}

/** May `uid` submit the team's answer with the version its device holds? */
export function sharedSubmitRefusal(
  c: TeamControl, uid: string, version: unknown,
): 'not_a_starter' | 'authority_stale' | 'not_authority_holder' | null {
  if (!c.starters.includes(uid)) return 'not_a_starter';
  if (version !== c.authorityVersion) return 'authority_stale';
  return uid === c.holderUid ? null : 'not_authority_holder';
}

/** Live relay: question i belongs to slot i mod 3. */
export function relayLiveOwner(slots: string[], index: number): string {
  return slots[((index % slots.length) + slots.length) % slots.length];
}

// ── Window team attempts ───────────────────────────────────────────────────

/** userTournaments/{tid}/teamAttempts/{round}_{entryId} — `uid` holds the entry id. */
export interface TeamAttempt extends Attempt {
  mode: TeamGameMode;
  /** Who submitted each position (null: unanswered). */
  answeredBy: Array<string | null>;
  /** relay only */
  legs?: RelayLeg[];
}

export interface RelayLeg {
  owner: string;
  /** Positions [start, end). */
  start: number;
  end: number;
  /** 0 = not open yet. */
  openedAt: number;
  startedAt: number;
  endedAt: number;
  forfeited: boolean;
}

/** Three consecutive legs covering every position. */
export function legBounds(count: number, legs: number): Array<[number, number]> {
  return Array.from({ length: legs }, (_, k) => [
    Math.floor((k * count) / legs),
    Math.floor(((k + 1) * count) / legs),
  ]);
}

const MIN = 60_000;
/** How long a relay leg's owner has to start once it opens: a quarter of the window, 10 min to 4 h. */
export function relayTurnMs(windowMs: number): number {
  return Math.max(10 * MIN, Math.min(4 * 60 * MIN, Math.floor(windowMs / 4)));
}

export function newTeamAttempt(
  entryId: string, mode: TeamGameMode, round: number, order: number[], slots: string[], now: number, opensAt: number,
): TeamAttempt {
  const n = order.length;
  const base: TeamAttempt = {
    uid: entryId,
    mode,
    round,
    order,
    servedAt: Array(n).fill(0),
    choices: Array(n).fill(PENDING),
    points: Array(n).fill(0),
    correct: Array(n).fill(false),
    elapsedMs: Array(n).fill(0),
    answeredBy: Array(n).fill(null),
    pos: 0,
    done: false,
    startedAt: now,
    finishedAt: null,
  };
  if (mode === 'relay')
    base.legs = legBounds(n, slots.length).map(([start, end], k) => ({
      owner: slots[k],
      start,
      end,
      openedAt: k === 0 ? opensAt : 0,
      startedAt: 0,
      endedAt: 0,
      forfeited: false,
    }));
  return base;
}

const copyAttempt = (a: TeamAttempt): TeamAttempt => ({
  ...a,
  servedAt: [...a.servedAt],
  choices: [...a.choices],
  points: [...a.points],
  correct: [...a.correct],
  elapsedMs: [...a.elapsedMs],
  answeredBy: [...(a.answeredBy || a.order.map(() => null))],
  ...(a.legs ? { legs: a.legs.map((l) => ({ ...l })) } : {}),
});

export const legIndexAt = (a: TeamAttempt, pos: number): number =>
  (a.legs || []).findIndex((l) => pos >= l.start && pos < l.end);

/**
 * Bring a relay attempt up to `now`, from stored facts only — any starter's
 * request (or a retry) computes the same result. Every derived time (a leg's
 * end, the next leg's opening) is the instant it happened, not the instant a
 * request noticed it.
 */
export function relayCatchUp(
  a0: TeamAttempt, now: number, questionMs: number, closesAt: number, turnMs: number,
): TeamAttempt {
  const a = copyAttempt(a0);
  const legs = a.legs || [];
  const n = a.order.length;
  const skipTo = (end: number) => {
    for (let p = a.pos; p < end; p += 1) {
      if (a.choices[p] === PENDING) {
        a.choices[p] = SKIPPED;
        a.elapsedMs[p] = questionMs;
      }
    }
    a.pos = end;
  };
  const openNext = (k: number, at: number) => {
    if (legs[k + 1] && !legs[k + 1].openedAt) legs[k + 1].openedAt = at;
  };
  for (let guard = 0; guard < n + legs.length + 2 && !a.done; guard += 1) {
    if (a.pos >= n) {
      a.done = true;
      a.finishedAt = a.finishedAt ?? (legs[legs.length - 1]?.endedAt || now);
      break;
    }
    const k = legIndexAt(a, a.pos);
    const leg = legs[k];
    if (!leg) break;
    if (!leg.openedAt && k > 0) {
      // The previous leg is complete (the position moved past it): it opens this one.
      const prev = legs[k - 1];
      if (!prev.endedAt) {
        const last = prev.end - 1;
        prev.endedAt = a.servedAt[last] > 0 ? a.servedAt[last] + Math.min(a.elapsedMs[last], questionMs) : now;
      }
      leg.openedAt = prev.endedAt;
    }
    if (!leg.openedAt) break;
    if (!leg.startedAt) {
      const deadline = Math.min(leg.openedAt + turnMs, closesAt);
      if (now < deadline) break;
      skipTo(leg.end);
      leg.forfeited = true;
      leg.endedAt = deadline;
      openNext(k, deadline);
      continue;
    }
    // Close the served questions whose time ran out.
    while (a.pos < leg.end && a.servedAt[a.pos] > 0 && attemptAnswerLate(a.servedAt[a.pos], questionMs, now)) {
      a.choices[a.pos] = SKIPPED;
      a.elapsedMs[a.pos] = questionMs;
      a.pos += 1;
    }
    if (a.pos < leg.end) {
      if (a.servedAt[a.pos] > 0) break; // the current question is still open
      const hardEnd = Math.min(leg.startedAt + (leg.end - leg.start) * questionMs + ANSWER_GRACE_MS, closesAt);
      if (now >= hardEnd) {
        skipTo(leg.end);
        leg.endedAt = hardEnd;
        openNext(k, hardEnd);
        continue;
      }
      a.servedAt[a.pos] = now;
      break;
    }
    // The leg is complete: it ended when its last question was answered or timed out.
    if (!leg.endedAt) {
      const last = leg.end - 1;
      leg.endedAt = a.servedAt[last] > 0 ? a.servedAt[last] + Math.min(a.elapsedMs[last], questionMs) : now;
    }
    openNext(k, leg.endedAt);
  }
  return a;
}

export type TeamPlayRefusal =
  | 'done'
  | 'not_your_turn'
  | 'turn_not_open'
  | 'wrong_position'
  | 'not_served';

/** The leg owner starts (or resumes) their leg. */
export function relayStartLeg(
  a0: TeamAttempt, uid: string, now: number, questionMs: number, closesAt: number, turnMs: number,
): { attempt: TeamAttempt; refused: TeamPlayRefusal | null } {
  const a = relayCatchUp(a0, now, questionMs, closesAt, turnMs);
  if (a.done) return { attempt: a, refused: 'done' };
  const leg = (a.legs || [])[legIndexAt(a, a.pos)];
  if (!leg || leg.owner !== uid) return { attempt: a, refused: 'not_your_turn' };
  if (leg.startedAt) return { attempt: a, refused: null };
  if (!leg.openedAt || now < leg.openedAt) return { attempt: a, refused: 'turn_not_open' };
  leg.startedAt = now;
  return { attempt: relayCatchUp(a, now, questionMs, closesAt, turnMs), refused: null };
}

/** Record one answer of a team attempt (relay: owner of the position's leg; shared: checked by the caller). */
export function teamAnswer(
  a0: TeamAttempt,
  uid: string,
  pos: number,
  choice: number,
  answerKey: number,
  now: number,
  questionMs: number,
  closesAt: number,
  turnMs: number,
): { attempt: TeamAttempt; refused: TeamPlayRefusal | null; duplicate: boolean } {
  const relay = a0.mode === 'relay';
  if (relay) {
    const k = legIndexAt(a0, pos);
    if (k < 0 || a0.legs![k].owner !== uid) return { attempt: a0, refused: 'not_your_turn', duplicate: false };
  }
  // A retry of an answer that already landed: idempotent, not an error.
  if (pos < a0.pos && a0.choices[pos] !== PENDING && a0.answeredBy?.[pos] === uid)
    return { attempt: a0, refused: null, duplicate: true };
  if (a0.done) return { attempt: a0, refused: 'done', duplicate: false };
  if (pos !== a0.pos) return { attempt: a0, refused: 'wrong_position', duplicate: false };
  if (!a0.servedAt[pos]) return { attempt: a0, refused: 'not_served', duplicate: false };
  const a = copyAttempt(a0);
  const late = attemptAnswerLate(a.servedAt[pos], questionMs, now);
  const isChoice = Number.isInteger(choice) && choice >= 0;
  const correct = isChoice && choice === answerKey;
  const scored = scoreAnswer({ correct, startedAt: a.servedAt[pos], receivedAt: now, questionMs, late });
  a.choices[pos] = isChoice ? choice : SKIPPED;
  a.correct[pos] = correct && !late;
  a.points[pos] = scored.points;
  a.elapsedMs[pos] = Math.min(scored.elapsedMs, questionMs);
  a.answeredBy[pos] = isChoice ? uid : null;
  a.pos = pos + 1;
  if (relay) {
    const leg = a.legs![legIndexAt(a0, pos)];
    if (a.pos === leg.end) leg.endedAt = now;
    return { attempt: relayCatchUp(a, now, questionMs, closesAt, turnMs), refused: null, duplicate: false };
  }
  return { attempt: sharedCatchUp(a, now, questionMs, closesAt), refused: null, duplicate: false };
}

/** Shared window: the same per-question clock as an individual attempt. */
export function sharedCatchUp(a0: TeamAttempt, now: number, questionMs: number, closesAt: number): TeamAttempt {
  const a = copyAttempt(a0);
  if (a.done) return a;
  const n = a.order.length;
  while (a.pos < n && a.servedAt[a.pos] > 0 && attemptAnswerLate(a.servedAt[a.pos], questionMs, now)) {
    a.choices[a.pos] = SKIPPED;
    a.elapsedMs[a.pos] = questionMs;
    a.pos += 1;
  }
  if (a.pos < n && a.servedAt[a.pos] === 0) {
    if (now < closesAt) a.servedAt[a.pos] = now;
    else a.pos = n;
  }
  if (a.pos >= n) {
    a.done = true;
    a.finishedAt = a.finishedAt ?? now;
  }
  return a;
}

/** Legs whose opening this step recorded and whose owner should now be told. */
export function newlyOpenedLegs(before: TeamAttempt | null, after: TeamAttempt): RelayLeg[] {
  return (after.legs || []).filter((leg, k) =>
    k > 0 && leg.openedAt > 0 && !leg.startedAt && !leg.forfeited && !(before?.legs?.[k]?.openedAt));
}

// ── Scoring ────────────────────────────────────────────────────────────────

export interface TeamContribution {
  uid: string;
  points: number;
  correct: number;
  answered: number;
  totalMs: number;
  /** Relay: this slot's questions with no answer (expired or forfeited turns). */
  missed: number;
}

export interface TeamModeScore {
  entryId: string;
  points: number;
  correct: number;
  answered: number;
  totalMs: number;
  /** Questions (closed so far) the team did not answer. */
  missed: number;
  /** Relay: by slot. Shared: empty — the team answer is not split between members. */
  contributions: TeamContribution[];
}

export interface LiveTeamAnswer {
  index: number;
  uid: string;
  points: number;
  correct: boolean;
  elapsedMs: number;
}

/** Live: score from the team's answer records; `closed` questions have ended. */
export function liveTeamScore(
  entryId: string, mode: TeamGameMode, slots: string[], answers: LiveTeamAnswer[], closed: number, questionMs: number,
): TeamModeScore {
  const byIndex = new Map(answers.filter((x) => x.index < closed).map((x) => [x.index, x]));
  const contributions = new Map<string, TeamContribution>(
    slots.map((uid) => [uid, { uid, points: 0, correct: 0, answered: 0, totalMs: 0, missed: 0 }]),
  );
  let points = 0;
  let correct = 0;
  let totalMs = 0;
  for (let i = 0; i < closed; i += 1) {
    const x = byIndex.get(i);
    const c = mode === 'relay' ? contributions.get(relayLiveOwner(slots, i)) : undefined;
    if (!x) {
      totalMs += questionMs;
      if (c) {
        c.missed += 1;
        c.totalMs += questionMs;
      }
      continue;
    }
    const ms = Math.min(x.elapsedMs, questionMs);
    points += x.points;
    correct += x.correct ? 1 : 0;
    totalMs += ms;
    if (c) {
      c.points += x.points;
      c.correct += x.correct ? 1 : 0;
      c.answered += 1;
      c.totalMs += ms;
    }
  }
  return {
    entryId,
    points,
    correct,
    answered: byIndex.size,
    totalMs,
    missed: closed - byIndex.size,
    contributions: mode === 'relay' ? [...contributions.values()] : [],
  };
}

/** Window: score from the team attempt (null: never started — every question missed). */
export function windowTeamScore(
  entryId: string, mode: TeamGameMode, slots: string[], a: TeamAttempt | null, questionCount: number, questionMs: number,
): TeamModeScore {
  const legs = a?.legs ?? (mode === 'relay'
    ? legBounds(questionCount, slots.length).map(([start, end], k) => ({ owner: slots[k], start, end }))
    : []);
  const contributions = legs.map((l) => ({ uid: l.owner, points: 0, correct: 0, answered: 0, totalMs: 0, missed: 0 }));
  let points = 0;
  let correct = 0;
  let answered = 0;
  let totalMs = 0;
  for (let p = 0; p < questionCount; p += 1) {
    const choice = a ? a.choices[p] : PENDING;
    const isAnswered = choice !== undefined && choice >= 0;
    const ms = isAnswered ? Math.min(a!.elapsedMs[p] || 0, questionMs) : questionMs;
    const pts = isAnswered ? a!.points[p] || 0 : 0;
    const ok = isAnswered && !!a!.correct[p];
    points += pts;
    correct += ok ? 1 : 0;
    answered += isAnswered ? 1 : 0;
    totalMs += ms;
    const k = legs.findIndex((l) => p >= l.start && p < l.end);
    if (k >= 0) {
      const c = contributions[k];
      c.points += pts;
      c.correct += ok ? 1 : 0;
      c.answered += isAnswered ? 1 : 0;
      c.totalMs += ms;
      c.missed += isAnswered ? 0 : 1;
    }
  }
  return {
    entryId,
    points,
    correct,
    answered,
    totalMs,
    missed: questionCount - answered,
    contributions: mode === 'relay' ? contributions : [],
  };
}

/**
 * Rank locked entries. Rows keep the independent named-team row shape
 * (id, label, starters, points, correct, totalMs, missing, contributions,
 * rank) so every existing board renders them, plus `gameMode` and `missed`.
 */
export function rankTeamModes(
  mode: TeamGameMode,
  entries: Array<{ id: string; label: string; starters: string[] }>,
  scores: TeamModeScore[],
) {
  const byEntry = new Map(scores.map((s) => [s.entryId, s]));
  const rows = entries
    .map((entry) => {
      const s = byEntry.get(entry.id);
      return {
        id: entry.id,
        label: entry.label,
        starters: entry.starters,
        gameMode: mode,
        points: s?.points ?? 0,
        correct: s?.correct ?? 0,
        totalMs: s?.totalMs ?? 0,
        missed: s?.missed ?? 0,
        missing: 0,
        contributions: s?.contributions ?? [],
        rank: 0,
      };
    })
    .sort((a, b) => b.points - a.points || b.correct - a.correct || a.totalMs - b.totalMs || a.id.localeCompare(b.id));
  rows.forEach((row, i) => {
    const prev = rows[i - 1];
    row.rank = prev && row.points === prev.points && row.correct === prev.correct && row.totalMs === prev.totalMs
      ? prev.rank
      : i + 1;
  });
  return rows;
}
