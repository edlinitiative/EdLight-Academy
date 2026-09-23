/**
 * api/tournois/_shared — the engine behind user-created tournaments.
 * ───────────────────────────────────────────────────────────────────────────
 * Files under api/ whose name begins with `_` are not deployed as endpoints.
 *
 * The rules themselves live in shared/tournois/* and are pure; this file is
 * the Firestore side: where each thing is stored, who may read it, and the one
 * `advanceTournament()` every tick, every play request and the cron call.
 *
 * DATA MODEL (all times epoch ms)
 *
 *   userTournaments/{tid}                    public / unlisted: anyone reads; private: roster + creator
 *     config (shared/tournois/config), creatorUid, creatorName, pin, state,
 *     schedule, nextDeadlineAt, playerCount, currentRound, closedThrough,
 *     bracketRounds, winner, standingsDirty
 *   userTournaments/{tid}/roster/{uid}       the lobby: name, school, class, seed — same read rule
 *   userTournaments/{tid}/live/state         the ONE doc a live room subscribes to — same read rule
 *   userTournaments/{tid}/live/progress      "N/M ont validé", throttled — same read rule
 *   userTournaments/{tid}/standings/current  rebuilt server-side from players/* — same read rule
 *   userTournaments/{tid}/matches/{rXmY}     bracket — same read rule
 *   userTournaments/{tid}/questions/{live|rN}  SERVER ONLY — carries the keys
 *   userTournaments/{tid}/players/{uid}      SERVER ONLY — the scores standings are rebuilt from
 *   userTournaments/{tid}/answers/{i}_{uid}  SERVER ONLY — live answers
 *   userTournaments/{tid}/attempts/{r}_{uid} SERVER ONLY — a player's timed round
 *   tournamentPins/{pin}                     { tid } — get by PIN, never listable
 *   users/{uid}/myTournaments/{tid}          "Mes tournois" — owner reads
 *
 * The Arène's integrity rules, kept:
 *  1. The answer key never reaches a client before its reveal: questions/* is
 *     unreadable by every client, and live/state only ever carries a
 *     `toPublicQuestion()` copy until the question closes.
 *  2. The answer endpoints reveal nothing mid-question — no correct, no
 *     points. A live reveal happens once, for the whole room, on live/state;
 *     a round's corrections only after the round closes (so a friend who
 *     played first cannot relay them).
 *  3. Per-player scores are server-only; the public sees standings/current,
 *     rebuilt from scratch, never a counter clients increment.
 *  4. The server's clock decides; a live client's "I painted at" is clamped
 *     to three seconds, and a late answer scores zero unconditionally.
 *  5. Advancing is lazy and idempotent: every decision is recomputed from the
 *     stored schedule inside a transaction and written only when the stored
 *     state is behind the clock. The browser never holds CRON_SECRET — a
 *     client tick can only ask the server to catch up to where the clock
 *     already says it is.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { DocumentData, DocumentReference, Firestore, Transaction } from 'firebase-admin/firestore';
import { checkRateLimit } from '../_lib/rateLimit';
import { publicDisplayName } from '../arena/_shared';
import { isAcceptableAliasInput } from '../../shared/alias';
import { cleanText, type TournamentConfig, type TournamentFormat } from '../../shared/tournois/config';
import {
  bracketSchedule,
  decideLiveAdvance,
  lastClosedRound,
  liveNextDeadline,
  livePositionAt,
  roundAt,
  roundsNextDeadline,
  type LivePhase,
  type Schedule,
} from '../../shared/tournois/schedule';
import { rankPlayers, rankTournamentTeams, type PlayerRow } from '../../shared/tournois/scoring';
import { firstRound, nextRound, resolveMatch, type Entrant, type Match, type RoundScore } from '../../shared/tournois/bracket';
import { toPublicQuestion, type StoredQuestion } from '../../shared/tournois/questions';

export const COLLECTION = 'userTournaments';
export const PINS = 'tournamentPins';

export type TournamentState = 'scheduled' | 'running' | 'finished' | 'cancelled';

export interface TournamentDoc extends TournamentConfig {
  id: string;
  creatorUid: string;
  creatorName: string;
  pin: string;
  state: TournamentState;
  schedule: Schedule;
  nextDeadlineAt: number | null;
  playerCount: number;
  currentRound: number;
  closedThrough: number;
  bracketRounds: number;
  winner: { uid: string; displayName: string } | null;
  standingsDirty: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Stored per player, server-only. `rounds` keys are round indexes as strings. */
export interface PlayerDoc {
  uid: string;
  displayName: string;
  school: string | null;
  grade: string | null;
  points: number;
  correct: number;
  answered: number;
  totalMs: number;
  rounds: Record<string, RoundScore & { answered: number }>;
}

export const tRef = (db: Firestore, tid: string) => db.doc(`${COLLECTION}/${tid}`);
export const sub = (db: Firestore, tid: string, path: string) => db.doc(`${COLLECTION}/${tid}/${path}`);
export const subCol = (db: Firestore, tid: string, name: string) => db.collection(`${COLLECTION}/${tid}/${name}`);

// ── Input plumbing ──────────────────────────────────────────────────────────

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

export function boundedInt(value: unknown, min: number, max: number): number | null {
  const n = typeof value === 'number' ? value : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

export async function enforceRateLimit(res: VercelResponse, key: string, bucket: string): Promise<boolean> {
  const { allowed, remaining, resetAt } = await checkRateLimit(key, bucket);
  if (!allowed) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))));
    res.status(429).json({ error: 'rate_limit_exceeded' });
    return false;
  }
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  return true;
}

/** Best-effort caller address for unauthenticated buckets (spectator ticks). */
export function clientKey(req: VercelRequest): string {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = fwd || String(req.headers['x-real-ip'] || '') || 'unknown';
  return `ip_${ip.replace(/[^A-Za-z0-9]/g, '_').slice(0, 60)}`;
}

/** Same constant-time check as api/arena/_shared. */
export function cronAuthorized(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) return false;
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const headerSecret = (req.headers['x-cron-secret'] as string) || '';
  const match = (a: string) => {
    if (a.length !== secret.length) return false;
    let m = 0;
    for (let i = 0; i < a.length; i += 1) m |= a.charCodeAt(i) ^ secret.charCodeAt(i);
    return m === 0;
  };
  return (!!bearer && match(bearer)) || (!!headerSecret && match(headerSecret));
}

// ── Reading ────────────────────────────────────────────────────────────────

/** Can this uid see a tournament? Mirrors the firestore.rules read rule. */
export async function canSee(db: Firestore, t: TournamentDoc, uid: string | null): Promise<boolean> {
  if (t.visibility !== 'private') return true;
  if (!uid) return false;
  if (t.creatorUid === uid) return true;
  return (await sub(db, t.id, `roster/${uid}`).get()).exists;
}

export function emptyPlayer(uid: string, displayName: string, school: string | null, grade: string | null): PlayerDoc {
  return { uid, displayName, school, grade, points: 0, correct: 0, answered: 0, totalMs: 0, rounds: {} };
}

/** Totals are always the sum of the rounds — never incremented on their own. */
export function withRound(p: PlayerDoc, round: number, r: RoundScore & { answered: number }): PlayerDoc {
  const rounds = { ...(p.rounds || {}), [String(round)]: r };
  const vals = Object.values(rounds);
  return {
    ...p,
    rounds,
    points: vals.reduce((s, v) => s + (v.points || 0), 0),
    correct: vals.reduce((s, v) => s + (v.correct || 0), 0),
    answered: vals.reduce((s, v) => s + (v.answered || 0), 0),
    totalMs: vals.reduce((s, v) => s + (v.totalMs || 0), 0),
  };
}

// ── Standings ──────────────────────────────────────────────────────────────

/** The next instant the schedule itself changes something, or null when it is over. */
export function scheduledDeadline(t: Pick<TournamentDoc, 'format' | 'schedule'>, now: number): number | null {
  if (t.format === 'live') return liveNextDeadline(livePositionAt(t.schedule, now));
  return roundsNextDeadline(t.schedule.rounds, now);
}

export const STANDINGS_ROWS = 500;

/**
 * Rebuild standings/current from every players/* row. From scratch every time,
 * so running it twice (two ticks racing) writes the same document twice.
 */
export async function recomputeStandings(db: Firestore, tid: string, now: number): Promise<void> {
  const tSnap = await tRef(db, tid).get();
  if (!tSnap.exists) return;
  const t = tSnap.data() as TournamentDoc;
  const snap = await subCol(db, tid, 'players').get();
  const rows: PlayerRow[] = snap.docs.map((d) => {
    const p = d.data() as PlayerDoc;
    return {
      uid: p.uid,
      displayName: p.displayName,
      school: p.school,
      grade: p.grade,
      points: p.points || 0,
      correct: p.correct || 0,
      answered: p.answered || 0,
      totalMs: p.totalMs || 0,
    };
  });
  const ranked = rankPlayers(rows).slice(0, STANDINGS_ROWS).map((r) => ({
    uid: r.uid,
    displayName: r.displayName,
    school: r.school || null,
    grade: r.grade || null,
    points: r.points,
    correct: r.correct,
    answered: r.answered,
    rank: r.rank,
  }));
  const teams = rankTournamentTeams(t.teamRule, t.teamSize, rows).slice(0, 50).map((s) => ({
    key: s.key,
    label: s.label,
    rank: s.rank,
    score: s.teamXp,
    counted: s.counted,
    members: s.members,
    qualified: s.qualified,
    needed: s.needed,
  }));
  const final = t.state === 'finished';
  await sub(db, tid, 'standings/current').set({
    rows: ranked,
    teams,
    total: rows.length,
    final,
    updatedAt: now,
  });
  const patch: Record<string, unknown> = { standingsDirty: false, updatedAt: now };
  if (final) {
    // The bracket's winner is decided by the bracket, not by total points.
    if (t.format !== 'bracket') {
      const top = ranked[0];
      patch.winner = top && top.points > 0 ? { uid: top.uid, displayName: top.displayName } : null;
    }
    patch.nextDeadlineAt = null;
  } else if (t.state !== 'cancelled') {
    // A dirty-standings nudge pulled the deadline forward; put it back on the schedule.
    patch.nextDeadlineAt = scheduledDeadline(t, now);
  }
  await tRef(db, tid).update(patch);
}

// ── Advancing ──────────────────────────────────────────────────────────────

export interface AdvanceResult {
  changed: boolean;
  recompute: boolean;
  state: TournamentState | null;
}

const NOOP: AdvanceResult = { changed: false, recompute: false, state: null };

/**
 * One idempotent step toward where the clock says the tournament should be.
 * Returns `changed: false` when the stored state already matches — which is
 * what a second, racing tick finds once the first has committed (Firestore
 * re-runs the losing transaction against the fresh document).
 */
export async function advanceOnce(db: Firestore, tid: string, now: number): Promise<AdvanceResult> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(tRef(db, tid));
    if (!snap.exists) return NOOP;
    const t = snap.data() as TournamentDoc;
    if (t.state === 'cancelled') return NOOP;
    if (t.state === 'finished') {
      // A round attempt that finished in the grace after close marks standings dirty.
      return t.standingsDirty ? { changed: false, recompute: true, state: t.state } : NOOP;
    }
    switch (t.format as TournamentFormat) {
      case 'live':
        return advanceLive(db, tx, t, now);
      case 'bracket':
        return advanceBracket(db, tx, t, now);
      default:
        return advanceRounds(tx, db, t, now);
    }
  });
}

async function advanceLive(db: Firestore, tx: Transaction, t: TournamentDoc, now: number): Promise<AdvanceResult> {
  const liveRef = sub(db, t.id, 'live/state');
  const liveSnap = await tx.get(liveRef);
  const live = liveSnap.exists ? (liveSnap.data() as DocumentData) : null;
  const stored = { phase: ((live?.phase as LivePhase) || 'lobby'), index: typeof live?.index === 'number' ? live.index : -1 };
  const d = decideLiveAdvance(t.schedule, stored, now);
  if (d.noop) {
    return t.standingsDirty ? { changed: false, recompute: true, state: t.state } : NOOP;
  }
  const target = d.target;
  const count = t.schedule.questionCount;
  // Reads first (transactions forbid reads after writes).
  const qSnap = await tx.get(sub(db, t.id, 'questions/live'));
  const items = ((qSnap.data()?.items || []) as StoredQuestion[]);
  const showIndex = target.phase === 'question' || target.phase === 'reveal' ? target.index
    : target.phase === 'done' ? count - 1 : -1;
  const revealIndex = target.phase === 'reveal' ? target.index : target.phase === 'done' ? count - 1 : -1;
  let reveal: Record<string, unknown> | null = null;
  if (revealIndex >= 0 && items[revealIndex]) {
    const q = items[revealIndex];
    const answers = await tx.get(subCol(db, t.id, 'answers').where('index', '==', revealIndex));
    const counts = q.options.map(() => 0);
    let correct = 0;
    answers.docs.forEach((a) => {
      const data = a.data();
      if (Number.isInteger(data.choice) && data.choice >= 0 && data.choice < counts.length) counts[data.choice] += 1;
      if (data.correct === true) correct += 1;
    });
    reveal = {
      index: revealIndex,
      answer: q.answer,
      explanation: q.explanation,
      explanationHt: q.explanationHt,
      counts,
      answered: answers.size,
      correct,
    };
  }
  const shown = showIndex >= 0 && items[showIndex] ? toPublicQuestion(items[showIndex]) : null;
  tx.set(liveRef, {
    phase: target.phase,
    index: target.phase === 'done' ? count : target.index,
    opensAt: target.opensAt,
    closesAt: target.closesAt,
    revealUntil: target.revealUntil,
    questionCount: count,
    questionMs: t.schedule.questionMs,
    question: shown,
    reveal,
    updatedAt: now,
  });
  const state: TournamentState = d.finished ? 'finished' : target.phase === 'lobby' ? 'scheduled' : 'running';
  tx.update(tRef(db, t.id), {
    state,
    currentRound: 0,
    nextDeadlineAt: d.finished ? null : liveNextDeadline(target),
    updatedAt: now,
  });
  return { changed: true, recompute: d.revealedIndexes.length > 0 || d.finished, state };
}

async function advanceRounds(tx: Transaction, db: Firestore, t: TournamentDoc, now: number): Promise<AdvanceResult> {
  const rounds = t.schedule.rounds;
  const cur = roundAt(rounds, now);
  const closed = lastClosedRound(rounds, now);
  const finished = closed === rounds.length - 1;
  const state: TournamentState = finished ? 'finished' : now >= t.schedule.startsAt ? 'running' : 'scheduled';
  const currentRound = cur ? cur.index : -1;
  if (state === t.state && currentRound === t.currentRound && closed === t.closedThrough) {
    return t.standingsDirty ? { changed: false, recompute: true, state } : NOOP;
  }
  tx.update(tRef(db, t.id), {
    state,
    currentRound,
    closedThrough: closed,
    nextDeadlineAt: finished ? null : roundsNextDeadline(rounds, now),
    updatedAt: now,
  });
  return { changed: true, recompute: closed > t.closedThrough || t.standingsDirty || finished, state };
}

async function advanceBracket(db: Firestore, tx: Transaction, t: TournamentDoc, now: number): Promise<AdvanceResult> {
  if (t.state === 'scheduled') {
    if (now < t.schedule.startsAt) return NOOP;
    const roster = await tx.get(subCol(db, t.id, 'roster'));
    const entrants: Entrant[] = roster.docs
      .map((d) => d.data())
      .sort((a, b) => (a.seed || 0) - (b.seed || 0) || (a.joinedAt || 0) - (b.joinedAt || 0))
      .map((r, i) => ({ uid: r.uid, displayName: r.displayName, seed: i + 1 }));
    if (entrants.length < 2) {
      const only = entrants[0];
      tx.update(tRef(db, t.id), {
        state: 'finished',
        winner: only ? { uid: only.uid, displayName: only.displayName } : null,
        nextDeadlineAt: null,
        updatedAt: now,
      });
      return { changed: true, recompute: true, state: 'finished' };
    }
    const matches = firstRound(entrants);
    const schedule = bracketSchedule(t.schedule, entrants.length);
    matches.forEach((m) => tx.set(sub(db, t.id, `matches/${m.id}`), m));
    tx.update(tRef(db, t.id), {
      state: 'running',
      schedule,
      bracketRounds: schedule.rounds.length,
      currentRound: 0,
      closedThrough: -1,
      nextDeadlineAt: roundsNextDeadline(schedule.rounds, now),
      updatedAt: now,
    });
    return { changed: true, recompute: false, state: 'running' };
  }

  const rounds = t.schedule.rounds;
  const closed = lastClosedRound(rounds, now);
  if (closed <= t.closedThrough) {
    const cur = roundAt(rounds, now);
    const currentRound = cur ? cur.index : t.currentRound;
    if (currentRound !== t.currentRound) {
      tx.update(tRef(db, t.id), { currentRound, updatedAt: now });
      return { changed: true, recompute: false, state: t.state };
    }
    return t.standingsDirty ? { changed: false, recompute: true, state: t.state } : NOOP;
  }
  // Resolve ONE round per step; the caller loops, so a tick that arrives two
  // rounds late still walks through both in order.
  const r = t.closedThrough + 1;
  const mSnap = await tx.get(subCol(db, t.id, 'matches').where('round', '==', r));
  const matches = mSnap.docs.map((d) => d.data() as Match);
  const uids = [...new Set(matches.flatMap((m) => [m.a?.uid, m.b?.uid]).filter((u): u is string => !!u))];
  const pRefs: DocumentReference[] = uids.map((u) => sub(db, t.id, `players/${u}`));
  const pSnaps = pRefs.length ? await tx.getAll(...pRefs) : [];
  const scores: Record<string, RoundScore | undefined> = {};
  pSnaps.forEach((s) => {
    const p = s.data() as PlayerDoc | undefined;
    if (p) scores[p.uid] = p.rounds?.[String(r)];
  });
  const resolved = matches.map((m) => resolveMatch(m, scores));
  resolved.forEach((m) => tx.set(sub(db, t.id, `matches/${m.id}`), m));
  const isFinal = resolved.length <= 1;
  if (isFinal) {
    const final = resolved[0];
    const side = final && (final.a?.uid === final.winnerUid ? final.a : final.b);
    tx.update(tRef(db, t.id), {
      state: 'finished',
      closedThrough: r,
      currentRound: r,
      winner: side ? { uid: side.uid, displayName: side.displayName } : null,
      nextDeadlineAt: null,
      updatedAt: now,
    });
    return { changed: true, recompute: true, state: 'finished' };
  }
  nextRound(resolved).forEach((m) => tx.set(sub(db, t.id, `matches/${m.id}`), m));
  const cur = roundAt(rounds, now);
  tx.update(tRef(db, t.id), {
    closedThrough: r,
    currentRound: cur ? cur.index : r + 1,
    nextDeadlineAt: roundsNextDeadline(rounds, now) ?? now,
    updatedAt: now,
  });
  return { changed: true, recompute: true, state: t.state };
}

/** Catch a tournament up to `now`: step until nothing changes, then rebuild standings once. */
export async function advanceTournament(db: Firestore, tid: string, now: number): Promise<{ steps: number; state: TournamentState | null }> {
  let steps = 0;
  let recompute = false;
  let state: TournamentState | null = null;
  for (let i = 0; i < 12; i += 1) {
    const r = await advanceOnce(db, tid, now);
    recompute = recompute || r.recompute;
    if (r.state) state = r.state;
    if (!r.changed) break;
    steps += 1;
  }
  if (recompute) await recomputeStandings(db, tid, now);
  return { steps, state };
}

/** Read a tournament, or null. */
export async function readTournament(db: Firestore, tid: string): Promise<TournamentDoc | null> {
  const snap = await tRef(db, tid).get();
  return snap.exists ? (snap.data() as TournamentDoc) : null;
}

// ── Joining ────────────────────────────────────────────────────────────────

const GRADE_CODES = ['7e', '8e', '9e', 'NS1', 'NS2', 'NS3', 'NS4', 'POSTBAC'];

/**
 * Who the player is on this tournament's boards.
 *
 * The name: what they typed (the same alias rule the leaderboard saves), else
 * their public board alias, else the first name off their token — never a
 * full name, because most of this audience is under 18 and a public
 * tournament is watched by strangers. School and class are the student's
 * own claim, the way the leaderboard takes them; a tournament has no prize to
 * make lying worth policing.
 */
export async function resolveIdentity(
  db: Firestore,
  uid: string,
  tokenName: string | undefined,
  body: Record<string, unknown>,
): Promise<JoinIdentity | null> {
  const typed = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  let displayName: string | null = isAcceptableAliasInput(typed) ? typed.slice(0, 24) : null;
  if (!displayName) displayName = await publicDisplayName(db, uid, tokenName);
  if (!displayName) return null;
  const school = cleanText(body.school, 80) || null;
  const grade = typeof body.grade === 'string' && GRADE_CODES.includes(body.grade) ? body.grade : null;
  return { uid, displayName, school, grade };
}

export interface JoinIdentity {
  uid: string;
  displayName: string;
  school: string | null;
  grade: string | null;
}

export type JoinOutcome =
  | { ok: true; already: boolean; seed: number }
  | { ok: false; error: 'not_found' | 'closed' | 'full' | 'school_required' | 'grade_required' };

/** Can a new player still come in? A knockout is drawn at the start; the rest take late arrivals. */
export function joinOpen(t: Pick<TournamentDoc, 'state' | 'format'>): boolean {
  if (t.state === 'scheduled') return true;
  return t.state === 'running' && t.format !== 'bracket';
}

/**
 * Put a player on the roster, once. The seed is the join order, taken from
 * `playerCount` inside the same transaction, so two students joining in the
 * same instant get two different seeds.
 */
export async function joinTournament(db: Firestore, tid: string, who: JoinIdentity, now: number): Promise<JoinOutcome> {
  return db.runTransaction(async (tx): Promise<JoinOutcome> => {
    const snap = await tx.get(tRef(db, tid));
    if (!snap.exists) return { ok: false, error: 'not_found' };
    const t = snap.data() as TournamentDoc;
    const rosterRef = sub(db, tid, `roster/${who.uid}`);
    const existing = await tx.get(rosterRef);
    if (existing.exists) return { ok: true, already: true, seed: existing.data()?.seed || 0 };
    if (!joinOpen(t)) return { ok: false, error: 'closed' };
    if ((t.playerCount || 0) >= t.maxPlayers) return { ok: false, error: 'full' };
    if (t.teamRule === 'school' && !who.school) return { ok: false, error: 'school_required' };
    if (t.teamRule === 'grade' && !who.grade) return { ok: false, error: 'grade_required' };
    const seed = (t.playerCount || 0) + 1;
    tx.set(rosterRef, {
      uid: who.uid,
      displayName: who.displayName,
      school: who.school,
      grade: who.grade,
      seed,
      joinedAt: now,
    });
    tx.set(sub(db, tid, `players/${who.uid}`), emptyPlayer(who.uid, who.displayName, who.school, who.grade));
    tx.set(db.doc(`users/${who.uid}/myTournaments/${tid}`), {
      tid,
      title: t.title,
      format: t.format,
      startsAt: t.startsAt,
      role: t.creatorUid === who.uid ? 'creator' : 'player',
      joinedAt: now,
    }, { merge: true });
    tx.update(tRef(db, tid), { playerCount: seed, updatedAt: now });
    return { ok: true, already: false, seed };
  });
}
